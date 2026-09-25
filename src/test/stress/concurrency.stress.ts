import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

/**
 * Real contention against a real Postgres: many transactions at once, on a
 * pool wide enough that they genuinely overlap. Each test states an
 * invariant and hammers it. See vitest.stress.config.ts for how to run.
 */

const url = process.env.STRESS_DATABASE_URL;
const allowed = process.env.STRESS_ALLOW_DESTRUCTIVE === 'yes-this-is-a-scratch-database';
if (!url || !allowed) {
  throw new Error(
    'Refusing to run: these tests truncate tables. Set STRESS_DATABASE_URL to a scratch database ' +
      'and STRESS_ALLOW_DESTRUCTIVE=yes-this-is-a-scratch-database.'
  );
}
process.env.DATABASE_URL = url;
process.env.DATABASE_POOL_MAX = process.env.DATABASE_POOL_MAX ?? '20';
delete process.env.REDIS_REST_URL; // exercise the no-Redis path deterministically

vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));

const { db } = await import('@/db');
const schema = await import('@/db/schema');
const { createOrder } = await import('@/lib/orders');
const { recordProviderEvent, applyPaymentSignal } = await import('@/modules/payments/payment-service');
const { setPrice } = await import('@/modules/catalog/pricing-commands');
const { saveCart } = await import('@/lib/cart-server');
const { enqueue } = await import('@/infrastructure/jobs/queue');
const { registerJob, runJobs } = await import('@/infrastructure/jobs/worker');
const { saveDraft, publishDocument } = await import('@/modules/cms/cms-commands');

const A = { productId: 'rice-bran-cleansing-oil', size: '150ml' };
const B = { productId: 'centella-cleansing-balm', size: '100ml' };
const owner = { id: 'stress', role: 'owner' };

const CHECKOUT = {
  email: 'stress@example.com',
  paymentMethod: 'cod' as const,
  address: {
    fullName: 'Stress Test',
    line1: '1 Test Street',
    line2: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'IN',
    phone: '9876543210',
  },
};

async function reset() {
  await db.execute(sql`truncate orders, order_items, addresses, domain_events, event_deliveries,
    payment_events, inventory, product_pricing, carts, cart_items, jobs, idempotency_keys,
    audit_logs, cms_documents, cms_revisions restart identity cascade`);
}

async function stockOf(sku: { productId: string; size: string }) {
  const [row] = await db
    .select({ q: schema.inventory.quantity })
    .from(schema.inventory)
    .where(sql`${schema.inventory.productId} = ${sku.productId} and ${schema.inventory.size} = ${sku.size}`);
  return row?.q;
}

/** Runs `n` tasks at once and reports how long the burst took. */
async function burst<T>(n: number, task: (i: number) => Promise<T>) {
  const started = performance.now();
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => task(i)));
  const ms = Math.round(performance.now() - started);
  const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  return { results, ms, rejected };
}

const report: string[] = [];
const note = (line: string) => {
  report.push(line);
  console.log(`[stress] ${line}`);
};

beforeAll(async () => {
  // Confirm the product sizes used below really exist in the catalogue.
  const { getProductById } = await import('@/lib/catalogue');
  for (const sku of [A, B]) {
    if (!getProductById(sku.productId)?.sizes.some((s) => s.label === sku.size)) {
      throw new Error(`Test SKU missing from catalogue: ${sku.productId} ${sku.size}`);
    }
  }
});

afterAll(async () => {
  const summary = '=== stress summary ===\n' + report.join('\n') + '\n';
  console.log(summary);
  if (process.env.STRESS_REPORT) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.STRESS_REPORT, summary);
  }
});

describe('checkout under contention', () => {
  it('never sells more than is on the shelf', async () => {
    await reset();
    await db.insert(schema.inventory).values({ ...A, quantity: 10 });

    const { results, ms, rejected } = await burst(60, () =>
      createOrder({ ...CHECKOUT, items: [{ ...A, quantity: 1 }] })
    );
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    const orders = await db.select().from(schema.orders);

    note(`oversell: 60 buyers for 10 units → ${ok} orders, stock ${await stockOf(A)}, ${rejected.length} errors, ${ms} ms`);
    expect(rejected).toHaveLength(0);
    expect(ok).toBe(10);
    expect(orders).toHaveLength(10);
    expect(await stockOf(A)).toBe(0);
  });

  it('does not deadlock when baskets name the same SKUs in opposite orders', async () => {
    await reset();
    await db.insert(schema.inventory).values([
      { ...A, quantity: 1000 },
      { ...B, quantity: 1000 },
    ]);

    const { results, ms, rejected } = await burst(40, (i) =>
      createOrder({
        ...CHECKOUT,
        items:
          i % 2 === 0
            ? [{ ...A, quantity: 1 }, { ...B, quantity: 1 }]
            : [{ ...B, quantity: 1 }, { ...A, quantity: 1 }],
      })
    );
    const failed = results.filter((r) => r.status === 'fulfilled' && !r.value.ok).length;

    note(`opposite baskets: 40 checkouts → ${40 - failed - rejected.length} ok, ${failed} refused, ${rejected.length} errors, ${ms} ms`);
    for (const r of rejected) note(`  error: ${String(r.reason?.message ?? r.reason).slice(0, 160)}`);
    expect(rejected).toHaveLength(0);
    expect(failed).toBe(0);
    expect(await stockOf(A)).toBe(960);
    expect(await stockOf(B)).toBe(960);
  });

  it('turns a burst of retries with one idempotency key into one order', async () => {
    await reset();
    await db.insert(schema.inventory).values({ ...A, quantity: 100 });

    const { results, ms, rejected } = await burst(30, () =>
      createOrder({ ...CHECKOUT, items: [{ ...A, quantity: 1 }], idempotencyKey: 'chk_stress_same' })
    );
    const numbers = new Set(
      results.flatMap((r) => (r.status === 'fulfilled' && r.value.ok ? [r.value.orderNumber] : []))
    );

    note(`idempotent retries: 30 identical → ${numbers.size} distinct order(s), stock ${await stockOf(A)}, ${rejected.length} errors, ${ms} ms`);
    expect(rejected).toHaveLength(0);
    expect(numbers.size).toBe(1);
    expect(await db.select().from(schema.orders)).toHaveLength(1);
    expect(await stockOf(A)).toBe(99);
  });
});

describe('payments under contention', () => {
  it('applies a storm of duplicate and distinct webhooks exactly once', async () => {
    await reset();
    await db.insert(schema.inventory).values({ ...A, quantity: 10 });
    const created = await createOrder({
      ...CHECKOUT,
      paymentMethod: 'razorpay',
      items: [{ ...A, quantity: 1 }],
    } as never);
    if (!created.ok) throw new Error(created.error);
    await db.update(schema.orders).set({ paymentReference: 'order_STRESS' }).where(eq(schema.orders.id, created.orderId));
    await applyPaymentSignal(created.orderId, { type: 'session_opened' });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, created.orderId));

    const event = (id: string) => ({
      provider: 'razorpay',
      providerEventId: id,
      eventType: 'payment.captured',
      providerOrderRef: 'order_STRESS',
      providerPaymentId: 'pay_1',
      amount: order.total,
      payload: {},
      signal: { type: 'captured' as const, amount: order.total },
    });

    // 30 redeliveries of one event, and 10 distinct events saying the same thing.
    const { ms, rejected } = await burst(40, (i) => recordProviderEvent(event(i < 30 ? 'evt_same' : `evt_${i}`)));
    const paidEvents = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.name, 'order.paid'));
    const recorded = await db.select().from(schema.paymentEvents);
    const [after] = await db.select().from(schema.orders).where(eq(schema.orders.id, created.orderId));

    note(`webhook storm: 40 deliveries → ${recorded.length} recorded, ${paidEvents.length} order.paid, status ${after.paymentStatus}, ${rejected.length} errors, ${ms} ms`);
    expect(rejected).toHaveLength(0);
    expect(recorded).toHaveLength(11);
    expect(paidEvents).toHaveLength(1);
    expect(after.paymentStatus).toBe('paid');
  });
});

describe('admin edits under contention', () => {
  it('lets exactly one of many simultaneous price saves from the same version win', async () => {
    await reset();
    const { results, ms, rejected } = await burst(20, (i) =>
      setPrice(
        { ...A, price: 60_000 + i, salePrice: null, offerLabel: null, offerEndsAt: null, expectedVersion: 0 },
        owner
      )
    );
    const wins = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    note(`price saves: 20 from version 0 → ${wins} accepted, ${rejected.length} errors, ${ms} ms`);
    expect(rejected).toHaveLength(0);
    expect(wins).toBe(1);
  });

  it('publishes a version once however many times it is pressed', async () => {
    await reset();
    const saved = await saveDraft(
      { type: 'article', slug: 'stress', body: { title: 'Stress', body: 'Body.' }, expectedVersion: 0 },
      owner
    );
    if (!saved.ok) throw new Error(saved.message);

    const { results, ms, rejected } = await burst(15, () =>
      publishDocument({ documentId: saved.value.id, expectedVersion: 1 }, owner)
    );
    const changed = results.filter((r) => r.status === 'fulfilled' && r.value.ok && r.value.value.changed).length;
    const events = await db.select().from(schema.domainEvents).where(eq(schema.domainEvents.name, 'content.published'));
    note(`publish: 15 presses → ${changed} change(s), ${events.length} event(s), ${rejected.length} errors, ${ms} ms`);
    expect(rejected).toHaveLength(0);
    expect(changed).toBe(1);
    expect(events).toHaveLength(1);
  });
});

describe('carts under contention', () => {
  it('creates one cart when a new visitor fires many saves at once', async () => {
    await reset();
    const { ms, rejected } = await burst(25, (i) =>
      saveCart([{ ...A, quantity: (i % 5) + 1 }], null, 'anon-stress')
    );
    const carts = await db.select().from(schema.carts);
    const items = await db.select().from(schema.cartItems);
    note(`cart saves: 25 at once → ${carts.length} cart, ${items.length} line, ${rejected.length} errors, ${ms} ms`);
    for (const r of rejected) note(`  error: ${String(r.reason?.message ?? r.reason).slice(0, 160)}`);
    expect(rejected).toHaveLength(0);
    expect(carts).toHaveLength(1);
    expect(items).toHaveLength(1);
  });
});

describe('job queue under contention', () => {
  it('runs every job exactly once across concurrent workers', async () => {
    await reset();
    const runs = new Map<number, number>();
    registerJob('stress.count', async (_payload, job) => {
      runs.set(job.id, (runs.get(job.id) ?? 0) + 1);
    });
    for (let i = 0; i < 300; i++) await enqueue('stress.count', { i });

    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, w) =>
        runJobs({ workerId: `w${w}`, limit: 300, deadlineMs: 60_000 })
      )
    );
    const ms = Math.round(performance.now() - started);
    const claimed = results.reduce((n, r) => n + r.claimed, 0);
    const twice = [...runs.values()].filter((n) => n > 1).length;
    const [{ n: left }] = (await db.execute(
      sql`select count(*)::int as n from jobs where status <> 'succeeded'`
    )) as unknown as { n: number }[];

    note(`jobs: 300 jobs, 8 workers → ${runs.size} ran, ${twice} ran twice, ${claimed} claims, ${left} unfinished, ${ms} ms`);
    expect(runs.size).toBe(300);
    expect(twice).toBe(0);
    expect(claimed).toBe(300);
    expect(left).toBe(0);
  });
});

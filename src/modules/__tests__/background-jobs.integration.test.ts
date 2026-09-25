import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { domainEvents, eventDeliveries, inventory, jobs, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';
import { MemoryObjectStorage } from '@/infrastructure/storage/memory-storage';

/**
 * The work that runs after the response: payment reconciliation, the
 * analytics landing zone, the event-stream relay and the AI seam.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder } = await import('@/lib/orders');
const { applyPaymentSignal } = await import('@/modules/payments/payment-service');
const { reconcileJobHandler, scheduleReconciliation } = await import('@/modules/payments/jobs');
const { PermanentJobError } = await import('@/infrastructure/jobs/queue');
const { exportEventBatch } = await import('@/modules/analytics/landing-zone');
const { streamRelay } = await import('@/modules/analytics/stream-relay');
const { MemoryProducer, KafkaRestProducer } = await import('@/infrastructure/streaming/producer');
const { drain, emitEvent } = await import('@/lib/events');
const { skinAnalysisJobHandler } = await import('@/modules/ai/skin-analysis');

const SKU = { productId: 'rice-bran-cleansing-oil', size: '150ml' };
const REF = 'order_TEST123';
const CHECKOUT = {
  email: 'priya@example.com',
  paymentMethod: 'razorpay' as const,
  address: {
    fullName: 'Priya Sharma',
    line1: 'Flat 402, Sunrise Residency',
    line2: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400059',
    country: 'IN',
    phone: '9876543210',
  },
  items: [{ ...SKU, quantity: 1 }],
};

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(
    sql`truncate orders, order_items, addresses, domain_events, event_deliveries, consumer_registrations, payment_events, inventory, jobs, export_watermarks restart identity cascade`
  );
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

async function openOrder() {
  const created = await createOrder(CHECKOUT);
  if (!created.ok) throw new Error(created.error);
  await db.update(orders).set({ paymentReference: REF }).where(eq(orders.id, created.orderId));
  await applyPaymentSignal(created.orderId, { type: 'session_opened' });
  return created.orderId;
}

const provider = (payments: { id: string; amount: number; status: string }[] | null) => () => ({
  listPayments: async () => payments,
});

/** Events older than the export's safety lag. */
const ageEvents = () => db.execute(sql`update domain_events set created_at = created_at - interval '1 hour'`);

describe('payment reconciliation job', () => {
  it('applies a payment whose webhook never arrived', async () => {
    const orderId = await openOrder();
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

    await reconcileJobHandler(provider([{ id: 'pay_1', amount: order.total, status: 'captured' }]))({ orderId });

    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.paymentStatus).toBe('paid');
  });

  it('asks again later when the provider cannot say yet', async () => {
    const orderId = await openOrder();
    await expect(reconcileJobHandler(provider(null))({ orderId })).rejects.toThrow('not yet determinable');
    await expect(
      reconcileJobHandler(provider([{ id: 'p', amount: 1, status: 'authorized' }]))({ orderId })
    ).rejects.not.toBeInstanceOf(PermanentJobError);
  });

  it('gives up at once when no provider is configured', async () => {
    const orderId = await openOrder();
    await expect(reconcileJobHandler(() => null)({ orderId })).rejects.toBeInstanceOf(PermanentJobError);
  });

  it('never cancels: an unpaid order is left for the sweep', async () => {
    const orderId = await openOrder();
    await reconcileJobHandler(provider([]))({ orderId });
    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.status).not.toBe('cancelled');
    expect(after.paymentStatus).toBe('pending');
  });

  it('is scheduled once per order however often the session opens', async () => {
    const orderId = await openOrder();
    await scheduleReconciliation(orderId);
    await scheduleReconciliation(orderId);
    const queued = await db.select().from(jobs);
    expect(queued).toHaveLength(1);
    expect(queued[0].runAt.getTime()).toBeGreaterThan(Date.now() + 15 * 60_000);
  });
});

describe('analytics landing zone', () => {
  it('writes day-partitioned NDJSON that Spark can read, with personal data redacted', async () => {
    await emitEvent('order.placed', 'o1', { orderId: 'o1', email: 'priya@example.com' });
    await emitEvent('order.paid', 'o1', { orderId: 'o1' });
    await ageEvents();

    const storage = new MemoryObjectStorage();
    const result = await exportEventBatch(storage);

    expect(result.exported).toBe(2);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatch(/^landing\/domain_events\/dt=\d{4}-\d{2}-\d{2}\/part-000000000001\.ndjson$/);

    const lines = new TextDecoder().decode((await storage.get(result.files[0]))!).trim().split('\n');
    const rows = lines.map((l) => JSON.parse(l));
    expect(rows.map((r) => r.name)).toEqual(['order.placed', 'order.paid']);
    expect(rows[0]).toMatchObject({ schema_version: 1, event_id: 1, subject: 'o1' });
    expect(rows[0].payload.email).toBe('[redacted]');
  });

  it('holds back events too recent to be sure of their order', async () => {
    await emitEvent('order.placed', 'o1', { orderId: 'o1' });
    expect((await exportEventBatch(new MemoryObjectStorage())).exported).toBe(0);
  });

  it('moves on from where it stopped, and never exports an event twice', async () => {
    const storage = new MemoryObjectStorage();
    await emitEvent('order.placed', 'o1', {});
    await ageEvents();
    await exportEventBatch(storage);

    await emitEvent('order.placed', 'o2', {});
    await ageEvents();
    const second = await exportEventBatch(storage);

    expect(second).toMatchObject({ exported: 1, lastEventId: 2 });
    const all = (await Promise.all((await storage.list('landing/')).map((k) => storage.get(k))))
      .map((b) => new TextDecoder().decode(b!).trim().split('\n'))
      .flat();
    expect(all).toHaveLength(2);
  });

  it('rebuilds the same file after a crash between writing and recording progress', async () => {
    const storage = new MemoryObjectStorage();
    await emitEvent('order.placed', 'o1', {});
    await ageEvents();
    await exportEventBatch(storage);

    // More events arrive; then progress is lost, as if the first run had
    // written its file and died before committing the watermark.
    await emitEvent('order.paid', 'o1', {});
    await ageEvents();
    await db.execute(sql`update export_watermarks set last_event_id = 0`);
    await exportEventBatch(storage);

    const keys = await storage.list('landing/');
    expect(keys).toHaveLength(1); // the same file, overwritten, not a second one
    const lines = new TextDecoder().decode((await storage.get(keys[0]))!).trim().split('\n');
    expect(lines.map((l) => JSON.parse(l).event_id)).toEqual([1, 2]);
  });
});

describe('event stream relay', () => {
  it('copies events to their aggregate topic, keyed by subject', async () => {
    const producer = new MemoryProducer();
    // A new consumer starts at the head of the log: connecting a stream does
    // not replay history into it. So it registers before these events exist.
    await drain('stream-relay-test', streamRelay(producer));
    await emitEvent('order.placed', 'order-42', { orderId: 'order-42' });
    await emitEvent('order.paid', 'order-42', { orderId: 'order-42' });

    const result = await drain('stream-relay-test', streamRelay(producer));

    expect(result.handled).toBe(2);
    expect(producer.records.map((r) => [r.topic, r.key, r.headers?.event_name])).toEqual([
      ['avyora.order', 'order-42', 'order.placed'],
      ['avyora.order', 'order-42', 'order.paid'],
    ]);
  });

  it('keeps an undelivered event for retry when the broker is down', async () => {
    const down = { kind: 'down', send: async () => { throw new Error('broker unreachable'); } };
    await drain('stream-relay-test', streamRelay(down));
    await emitEvent('order.placed', 'o1', {});

    const result = await drain('stream-relay-test', streamRelay(down));
    expect(result.failed).toBe(1);
    const [delivery] = await db.select().from(eventDeliveries);
    expect(delivery).toMatchObject({ status: 'failed', lastError: 'broker unreachable' });
    expect(await db.select().from(domainEvents)).toHaveLength(1);
  });

  it('speaks the Kafka REST v3 produce API', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ error_code: 200 }), { status: 200 });
    }) as unknown as typeof fetch;

    const producer = new KafkaRestProducer(
      { baseUrl: 'https://kafka.example/', clusterId: 'lkc-1', apiKey: 'k', apiSecret: 's' },
      fakeFetch
    );
    await producer.send({ topic: 'avyora.order', key: 'o1', value: { a: 1 }, headers: { event_id: '7' } });

    expect(seen!.url).toBe('https://kafka.example/kafka/v3/clusters/lkc-1/topics/avyora.order/records');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('k:s')}`);
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      key: { type: 'STRING', data: 'o1' },
      value: { type: 'JSON', data: { a: 1 } },
      headers: [{ name: 'event_id', value: btoa('7') }],
    });
  });

  it('treats a per-record error inside a 200 as a failure', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error_code: 40403, message: 'topic not found' }), { status: 200 })) as unknown as typeof fetch;
    const producer = new KafkaRestProducer({ baseUrl: 'https://k', clusterId: 'c', apiKey: 'k', apiSecret: 's' }, fakeFetch);
    await expect(producer.send({ topic: 't', key: 'k', value: {} })).rejects.toThrow('topic not found');
  });
});

describe('skin analysis seam', () => {
  it('fails permanently and says why, while no analyser exists', async () => {
    await expect(skinAnalysisJobHandler()({ imageKey: 'x', consentedAt: 'now' })).rejects.toThrow(
      'No skin analyser is configured.'
    );
  });

  it('refuses an image without recorded consent', async () => {
    const analyzer = { modelVersion: 't', analyze: vi.fn() };
    await expect(skinAnalysisJobHandler(() => analyzer)({ imageKey: 'x' })).rejects.toBeInstanceOf(PermanentJobError);
    expect(analyzer.analyze).not.toHaveBeenCalled();
  });
});

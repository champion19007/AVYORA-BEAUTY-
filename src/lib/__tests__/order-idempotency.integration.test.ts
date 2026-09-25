import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { domainEvents, inventory, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Placing the same order twice.
 *
 * A customer on a bad connection taps "Place Order", sees a spinner, and taps
 * again. The button being disabled does nothing about it: the second request
 * may already be in flight, the network may duplicate it, or they may simply
 * reload and resubmit after giving up. Before the idempotency key, each of
 * those produced a second order — a second charge, and a second bite out of
 * stock for goods nobody asked for twice.
 *
 * The guarantee is a unique index rather than a lookup, so these tests run
 * against a real Postgres. A mocked database cannot enforce a constraint, and
 * the constraint *is* the feature — every other part of this is an
 * optimisation around it.
 */

// Built from the real migrations, so the schema under test is production's.
const { client, db } = await createMigratedDb();

vi.mock('@/db', () => ({
  db,
  isDatabaseConfigured: () => true,
}));

// Consequences of an order, not part of what is being tested. Each opens its
// own connections and reaches for the network.
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder } = await import('../orders');

const SKU = { productId: 'rice-bran-cleansing-oil', size: '150ml' };

const CHECKOUT = {
  email: 'priya@example.com',
  paymentMethod: 'cod' as const,
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
  items: [{ ...SKU, quantity: 2 }],
};

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses');
  await client.exec('DELETE FROM domain_events; DELETE FROM inventory');
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

async function orderCount(): Promise<number> {
  return (await db.select().from(orders)).length;
}

async function stockNow(): Promise<number> {
  const [row] = await db.select().from(inventory).where(eq(inventory.productId, SKU.productId));
  return row?.quantity ?? -1;
}

describe('order idempotency', () => {
  it('returns the original order when the same key is submitted twice', async () => {
    const key = 'chk_11111111-2222-3333-4444-555555555555';

    const first = await createOrder({ ...CHECKOUT, idempotencyKey: key });
    const second = await createOrder({ ...CHECKOUT, idempotencyKey: key });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.orderId).toBe(first.orderId);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(await orderCount()).toBe(1);
  });

  it('does not take stock twice for a repeated submission', async () => {
    // The expensive half of the bug. A duplicate order is visible and can be
    // refunded; stock silently removed for a phantom order is not, and it
    // makes the shop refuse to sell goods it physically has.
    const key = 'chk_duplicate-stock-check';

    await createOrder({ ...CHECKOUT, idempotencyKey: key });
    expect(await stockNow()).toBe(8);

    await createOrder({ ...CHECKOUT, idempotencyKey: key });
    expect(await stockNow()).toBe(8);
  });

  it('emits one order.placed event, not two', async () => {
    // The consumers are idempotent per event, but a second event is a second
    // *fact* — it would mean two confirmation emails for one purchase.
    const key = 'chk_single-event';

    await createOrder({ ...CHECKOUT, idempotencyKey: key });
    await createOrder({ ...CHECKOUT, idempotencyKey: key });

    const placed = (await db.select().from(domainEvents)).filter(
      (e) => e.name === 'order.placed'
    );
    expect(placed).toHaveLength(1);
  });

  it('treats two concurrent submissions of one key as one order', async () => {
    // The case the pre-flight read cannot catch: both requests look up the key
    // before either has inserted, so both proceed. The unique index is what
    // actually decides, and the loser must recover rather than fail.
    const key = 'chk_concurrent';

    const [a, b] = await Promise.all([
      createOrder({ ...CHECKOUT, idempotencyKey: key }),
      createOrder({ ...CHECKOUT, idempotencyKey: key }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.orderNumber).toBe(b.orderNumber);
    expect(await orderCount()).toBe(1);
    expect(await stockNow()).toBe(8);
  });

  it('still allows a genuine second order under a different key', async () => {
    // Deduplication must not become a purchase limit: a customer who orders
    // again next week is placing a real second order.
    const first = await createOrder({ ...CHECKOUT, idempotencyKey: 'chk_first' });
    const second = await createOrder({ ...CHECKOUT, idempotencyKey: 'chk_second' });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.orderNumber).not.toBe(first.orderNumber);
    expect(await orderCount()).toBe(2);
    expect(await stockNow()).toBe(6);
  });

  it('does not collide orders that carry no key at all', async () => {
    // Postgres treats NULLs as distinct in a unique index, which is what lets
    // the column stay nullable. Pinned because a well-meaning NOT NULL, or a
    // default of '', would make the second keyless order fail.
    const { idempotencyKey: _omitted, ...noKey } = { ...CHECKOUT, idempotencyKey: undefined };

    const first = await createOrder(noKey);
    const second = await createOrder(noKey);

    expect(first.ok && second.ok).toBe(true);
    expect(await orderCount()).toBe(2);
  });
});

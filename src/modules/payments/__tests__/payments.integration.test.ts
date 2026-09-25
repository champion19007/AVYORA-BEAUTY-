import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { inventory, orders, paymentEvents } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Payments against a real Postgres.
 *
 * Every scenario here is one that happens in production and that the previous
 * code got wrong: webhooks out of order, delivered twice, racing the browser
 * callback, or arriving after the order was given up on. The guarantees are
 * row locks and unique indexes, which only a real database enforces.
 */

const { client, db } = await createMigratedDb();

vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/event-consumers', () => ({ drainQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder, markOrderPaid, markOrderPaymentFailed, cancelOrder } = await import(
  '@/lib/orders'
);
const { recordProviderEvent, applyPaymentSignal } = await import('../payment-service');
const { reconcileOrder } = await import('../reconciliation');
const { sweepAbandonedReservations } = await import('@/lib/reservation-sweep');

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
  items: [{ ...SKU, quantity: 2 }],
};

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await db.execute(sql`truncate orders, order_items, addresses, domain_events, payment_events, inventory restart identity cascade`);
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

/** A razorpay order with its payment window open, as checkout leaves it. */
async function openOrder(reference = REF) {
  const created = await createOrder(CHECKOUT);
  if (!created.ok) throw new Error(created.error);
  await db.update(orders).set({ paymentReference: reference }).where(eq(orders.id, created.orderId));
  await applyPaymentSignal(created.orderId, { type: 'session_opened' });
  return created;
}

async function orderRow(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row;
}

async function stock(): Promise<number> {
  const [row] = await db.select().from(inventory).where(eq(inventory.productId, SKU.productId));
  return row.quantity;
}

function event(id: string, type: string, signal: Parameters<typeof recordProviderEvent>[0]['signal'], amount: number | null, reference = REF) {
  return recordProviderEvent({
    provider: 'razorpay',
    providerEventId: id,
    eventType: type,
    providerOrderRef: reference,
    providerPaymentId: `pay_${id}`,
    amount,
    payload: { id },
    signal,
  });
}

describe('payments', () => {
  it('opens a session as pending, with stock held', async () => {
    const order = await openOrder();
    expect((await orderRow(order.orderId)).paymentStatus).toBe('pending');
    expect(await stock()).toBe(8);
  });

  it('keeps an order paid when a failure webhook arrives after the capture', async () => {
    const order = await openOrder();

    await event('evt_capture', 'payment.captured', { type: 'captured', amount: order.totalPaise }, order.totalPaise);
    await event('evt_fail', 'payment.failed', { type: 'failed' }, order.totalPaise);

    const row = await orderRow(order.orderId);
    expect(row.paymentStatus).toBe('paid');
    // The old code released a paid order's stock here.
    expect(await stock()).toBe(8);
    expect(row.stockRestoredAt).toBeNull();
  });

  it('ends paid when the failure arrives first, taking the stock back', async () => {
    const order = await openOrder();

    await event('evt_fail', 'payment.failed', { type: 'failed' }, order.totalPaise);
    expect(await stock()).toBe(10);

    await event('evt_capture', 'payment.captured', { type: 'captured', amount: order.totalPaise }, order.totalPaise);

    const row = await orderRow(order.orderId);
    expect(row.paymentStatus).toBe('paid');
    expect(await stock()).toBe(8);
    expect(row.stockRestoredAt).toBeNull();
    expect(row.attentionReason).toBeNull();
  });

  it('flags the order when the stock sold to someone else in between', async () => {
    const order = await openOrder();
    await event('evt_fail', 'payment.failed', { type: 'failed' }, order.totalPaise);

    // Someone else buys everything while the first customer retries.
    await db.update(inventory).set({ quantity: 0 }).where(eq(inventory.productId, SKU.productId));

    await event('evt_capture', 'payment.captured', { type: 'captured', amount: order.totalPaise }, order.totalPaise);

    const row = await orderRow(order.orderId);
    expect(row.paymentStatus).toBe('paid');
    expect(row.attentionReason).toMatch(/sold/i);
    // The partial reservation was rolled back to its savepoint, not left behind.
    expect(await stock()).toBe(0);
  });

  it('processes a webhook delivered twice exactly once', async () => {
    const order = await openOrder();

    const first = await event('evt_same', 'payment.captured', { type: 'captured', amount: order.totalPaise }, order.totalPaise);
    const second = await event('evt_same', 'payment.captured', { type: 'captured', amount: order.totalPaise }, order.totalPaise);

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(await db.select().from(paymentEvents)).toHaveLength(1);
  });

  it('does not record an event for an order it cannot find, so the retry is processed', async () => {
    const result = await event('evt_early', 'payment.captured', { type: 'captured', amount: 100 }, 100, 'order_NOT_YET');
    expect(result.status).toBe('unknown_order');
    expect(await db.select().from(paymentEvents)).toHaveLength(0);
  });

  it('rejects a capture for the wrong amount and records why', async () => {
    const order = await openOrder();
    const result = await event('evt_short', 'payment.captured', { type: 'captured', amount: 1 }, 1);

    expect(result.status).toBe('processed');
    expect((await orderRow(order.orderId)).paymentStatus).toBe('pending');
    const [recorded] = await db.select().from(paymentEvents);
    expect(recorded.outcome).toBe('rejected');
  });

  it('never overwrites the provider order reference', async () => {
    // Every later webhook for this order is found by that reference. It used
    // to be replaced by the payment id, and refunds could never be matched.
    const order = await openOrder();
    await markOrderPaid(order.orderId, 'pay_ABC', order.totalPaise);

    expect((await orderRow(order.orderId)).paymentReference).toBe(REF);

    const refund = await event('evt_refund', 'refund.processed', { type: 'refunded' }, order.totalPaise);
    expect(refund.status).toBe('processed');
    expect((await orderRow(order.orderId)).paymentStatus).toBe('refunded');
  });

  it('honours a payment that arrives after cancellation and flags it', async () => {
    const order = await openOrder();
    await cancelOrder(order.orderId);
    expect(await stock()).toBe(10);

    await event('evt_late', 'payment.captured', { type: 'captured', amount: order.totalPaise }, order.totalPaise);

    const row = await orderRow(order.orderId);
    expect(row.paymentStatus).toBe('paid');
    expect(row.status).toBe('paid');
    expect(row.attentionReason).toMatch(/cancelled/i);
    expect(await stock()).toBe(8);
  });

  it('settles a capture and a failure racing each other into one consistent state', async () => {
    const order = await openOrder();

    await Promise.all([
      markOrderPaid(order.orderId, 'pay_1', order.totalPaise),
      markOrderPaymentFailed(order.orderId),
    ]);

    const row = await orderRow(order.orderId);
    // Either order of application ends paid; stock must match that.
    expect(row.paymentStatus).toBe('paid');
    expect(await stock()).toBe(8);
  });
});

describe('reconciliation', () => {
  const provider = (answer: Array<{ id: string; amount: number; status: string }> | null) => ({
    listPayments: async () => answer,
  });

  it('applies a capture the webhook never delivered', async () => {
    const order = await openOrder();
    const result = await reconcileOrder(
      order.orderId,
      provider([{ id: 'pay_1', amount: order.totalPaise, status: 'captured' }])
    );

    expect(result).toBe('paid');
    expect((await orderRow(order.orderId)).paymentStatus).toBe('paid');
  });

  it('treats an unreachable provider as unknown, not unpaid', async () => {
    const order = await openOrder();
    expect(await reconcileOrder(order.orderId, provider(null))).toBe('unknown');
    expect((await orderRow(order.orderId)).paymentStatus).toBe('pending');
  });

  it('waits on an authorised but uncaptured payment', async () => {
    const order = await openOrder();
    const result = await reconcileOrder(
      order.orderId,
      provider([{ id: 'pay_1', amount: order.totalPaise, status: 'authorized' }])
    );
    expect(result).toBe('unknown');
  });

  it('reports not paid when every attempt failed', async () => {
    const order = await openOrder();
    const result = await reconcileOrder(
      order.orderId,
      provider([{ id: 'pay_1', amount: order.totalPaise, status: 'failed' }])
    );
    expect(result).toBe('not_paid');
  });

  describe('the abandonment sweep', () => {
    async function ageOrder(id: string) {
      await db
        .update(orders)
        .set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
        .where(eq(orders.id, id));
    }

    it('recovers a paid order instead of cancelling it', async () => {
      const order = await openOrder();
      await ageOrder(order.orderId);

      const result = await sweepAbandonedReservations(
        30,
        provider([{ id: 'pay_1', amount: order.totalPaise, status: 'captured' }])
      );

      expect(result).toMatchObject({ recovered: 1, released: 0 });
      const row = await orderRow(order.orderId);
      expect(row.paymentStatus).toBe('paid');
      expect(row.status).not.toBe('cancelled');
      expect(await stock()).toBe(8);
    });

    it('leaves an order alone when the provider cannot be reached', async () => {
      const order = await openOrder();
      await ageOrder(order.orderId);

      const result = await sweepAbandonedReservations(30, provider(null));

      expect(result).toMatchObject({ undetermined: 1, released: 0 });
      expect((await orderRow(order.orderId)).status).toBe('pending');
      expect(await stock()).toBe(8);
    });

    it('releases an order the provider confirms was never paid', async () => {
      const order = await openOrder();
      await ageOrder(order.orderId);

      const result = await sweepAbandonedReservations(30, provider([]));

      expect(result).toMatchObject({ released: 1 });
      expect((await orderRow(order.orderId)).status).toBe('cancelled');
      expect(await stock()).toBe(10);
    });
  });
});

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { inventory, orders, returnRequests, stockLots } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Returns and refunds: the policy's rules, enforced in one place, and money
 * that can never be refunded twice.
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder, getOrderByNumber } = await import('@/lib/orders');
const R = await import('../returns');

const SKU = { productId: 'face-wash', size: '150ml' };
const owner = { id: 'owner', role: 'owner' };
const CHECKOUT = {
  email: 'asha@example.com',
  paymentMethod: 'cod' as const,
  address: {
    fullName: 'Asha Rao',
    line1: '12 MG Road',
    line2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'IN',
    phone: '9876543210',
  },
  items: [{ ...SKU, quantity: 2 }],
};

async function placed(set: Partial<typeof orders.$inferInsert> = {}) {
  const r = await createOrder(CHECKOUT);
  if (!r.ok) throw new Error('order not placed');
  const [row] = await db.select().from(orders);
  if (Object.keys(set).length > 0) await db.update(orders).set(set).where(eq(orders.id, row.id));
  return (await getOrderByNumber(row.orderNumber))!;
}
const delivered = (daysAgo = 1, set: Partial<typeof orders.$inferInsert> = {}) =>
  placed({ status: 'delivered', deliveredAt: new Date(Date.now() - daysAgo * 86_400_000), ...set });
const lot = async () => (await db.select().from(stockLots))[0];
const total = async () => (await db.select().from(inventory))[0].quantity;
const one = async () => (await db.select().from(returnRequests))[0];
const all = (order: Awaited<ReturnType<typeof placed>>) =>
  order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));

afterAll(async () => {
  await client?.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await client.exec('DELETE FROM order_item_lots; DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses');
  await client.exec('DELETE FROM domain_events; DELETE FROM audit_logs; DELETE FROM stock_lots; DELETE FROM inventory');
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
  await db
    .insert(stockLots)
    .values({ ...SKU, batchCode: 'B1', expiresOn: `${new Date().getUTCFullYear() + 2}-01-31`, quantity: 10 });
});

describe('asking for a return', () => {
  it('accepts one within the window, and only one at a time', async () => {
    const order = await delivered();
    const input = { kind: 'damaged', items: all(order), refundTo: 'asha@okhdfc' };
    expect(await R.requestReturn(order, input)).toEqual({ ok: true });
    expect(await R.requestReturn(order, input)).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
  });

  it('closes the window after the set number of days', async () => {
    const order = await delivered(R.RETURN_WINDOW_DAYS + 1);
    const r = await R.requestReturn(order, { kind: 'unopened', items: all(order), refundTo: 'asha@okhdfc' });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/close/) });
  });

  it('needs a UPI ID to refund a cash order, and no more units than were bought', async () => {
    const order = await delivered();
    expect(await R.requestReturn(order, { kind: 'unopened', items: all(order) })).toMatchObject({ ok: false });
    const tooMany = [{ orderItemId: order.items[0].id, quantity: 3 }];
    expect(await R.requestReturn(order, { kind: 'unopened', items: tooMany, refundTo: 'a@ok' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at most 2/),
    });
  });

  it('is refused before delivery', async () => {
    const order = await placed();
    expect(await R.requestReturn(order, { kind: 'unopened', items: all(order), refundTo: 'a@okhdfc' })).toMatchObject({
      ok: false,
    });
  });
});

describe('inspection', () => {
  it('puts sealed units back into their batch, and writes off the rest', async () => {
    const order = await delivered();
    await R.requestReturn(order, { kind: 'unopened', items: all(order), refundTo: 'asha@okhdfc' });
    const { id } = await one();
    await R.decideReturn(id, true, owner);
    expect(await total()).toBe(8);

    expect(await R.receiveReturn(id, true, owner)).toEqual({ ok: true });
    expect(await total()).toBe(10);
    expect((await lot()).quantity).toBe(10);
    // Twice is refused, so the shelf cannot be credited twice.
    expect(await R.receiveReturn(id, true, owner)).toMatchObject({ ok: false });
    expect(await total()).toBe(10);
  });

  it('keeps written-off units off the shelf', async () => {
    const order = await delivered();
    await R.requestReturn(order, { kind: 'damaged', items: all(order), refundTo: 'asha@okhdfc' });
    const { id } = await one();
    await R.decideReturn(id, true, owner);
    await R.receiveReturn(id, false, owner);
    expect(await total()).toBe(8);
  });
});

describe('refunds', () => {
  it('records a UPI refund for a cash order only with its reference, then forgets the UPI ID', async () => {
    const order = await delivered(1, { paymentStatus: 'paid' });
    await R.requestReturn(order, { kind: 'damaged', items: all(order), refundTo: 'asha@okhdfc' });
    const { id } = await one();
    await R.decideReturn(id, true, owner);

    expect(await R.refundReturn(id, { amountPaise: 1000 }, owner)).toMatchObject({ ok: false });
    expect(await R.refundReturn(id, { amountPaise: order.total, reference: 'UTR123' }, owner)).toEqual({ ok: true });
    expect(await one()).toMatchObject({ status: 'refunded', refundMethod: 'upi', refundTo: null });
    const [after] = await db.select().from(orders);
    expect(after).toMatchObject({ refundedTotal: order.total, paymentStatus: 'refunded', status: 'refunded' });
  });

  it('never refunds more than was paid', async () => {
    const order = await delivered(1, { paymentStatus: 'paid' });
    await R.requestReturn(order, { kind: 'damaged', items: all(order), refundTo: 'asha@okhdfc' });
    const { id } = await one();
    await R.decideReturn(id, true, owner);
    const r = await R.refundReturn(id, { amountPaise: order.total + 1, reference: 'UTR' }, owner);
    expect(r).toMatchObject({ ok: false });
  });

  it('cancels a paid online order before packing and refunds it through Cashfree', async () => {
    vi.stubEnv('CASHFREE_APP_ID', 'test-app');
    vi.stubEnv('CASHFREE_SECRET_KEY', 'test-secret');
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response(JSON.stringify({ cf_refund_id: 'cf-1', refund_status: 'PENDING' }), { status: 200 });
    });
    const order = await placed({ status: 'paid', paymentStatus: 'paid', paymentProvider: 'cashfree' });

    expect(await R.cancelByCustomer(order)).toEqual({ ok: true });
    expect(await total()).toBe(10);
    const c = await one();
    expect(c).toMatchObject({ kind: 'cancelled', status: 'received' });

    expect(await R.refundReturn(c.id, { amountPaise: order.total }, owner)).toEqual({ ok: true });
    expect(calls).toEqual([`POST https://sandbox.cashfree.com/pg/orders/${order.orderNumber}/refunds`]);
    expect(await one()).toMatchObject({ status: 'refunded', refundStatus: 'pending', refundReference: 'cf-1' });
    // A second press does nothing.
    expect(await R.refundReturn(c.id, { amountPaise: order.total }, owner)).toMatchObject({ ok: false });
    expect(calls).toHaveLength(1);
  });

  it('leaves the case refundable when Cashfree refuses', async () => {
    vi.stubEnv('CASHFREE_APP_ID', 'test-app');
    vi.stubEnv('CASHFREE_SECRET_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ message: 'insufficient balance' }), { status: 400 })
    );
    const order = await placed({ status: 'paid', paymentStatus: 'paid', paymentProvider: 'cashfree' });
    await R.cancelByCustomer(order);
    const c = await one();
    expect(await R.refundReturn(c.id, { amountPaise: order.total }, owner)).toEqual({
      ok: false,
      error: 'insufficient balance',
    });
    expect(await one()).toMatchObject({ status: 'received', refundStatus: null });
  });

  it('will not cancel once packing has started', async () => {
    const order = await placed({ status: 'fulfilled' });
    expect(await R.cancelByCustomer(order)).toMatchObject({ ok: false });
  });
});

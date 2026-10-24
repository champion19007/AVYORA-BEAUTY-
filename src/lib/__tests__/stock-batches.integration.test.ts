import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { inventory, orderItemLots, orders, stockLots } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Batches at checkout: earliest expiry ships first, short-dated stock never
 * ships, and a cancelled order's units go back into the batch they came from.
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder, restoreOrderStock } = await import('../orders');
const { holdBackExpiringBatches, shippingCutoff } = await import('../inventory');

const SKU = { productId: 'face-wash', size: '150ml' };
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
  items: [{ ...SKU, quantity: 3 }],
};
const year = new Date().getUTCFullYear();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function stock(lots: { batchCode: string; expiresOn: string | null; quantity: number }[]) {
  await db.insert(inventory).values({ ...SKU, quantity: lots.reduce((n, l) => n + l.quantity, 0) });
  await db.insert(stockLots).values(lots.map((l) => ({ ...SKU, ...l })));
}
const lot = async (batchCode: string) =>
  (await db.select().from(stockLots).where(eq(stockLots.batchCode, batchCode)))[0];
const total = async () => (await db.select().from(inventory))[0].quantity;

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec(
    'DELETE FROM order_item_lots; DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses; DELETE FROM offers'
  );
  await client.exec('DELETE FROM domain_events; DELETE FROM stock_lots; DELETE FROM inventory');
});

describe('batches at checkout', () => {
  it('takes the earliest expiry first, spilling into the next batch', async () => {
    await stock([
      { batchCode: 'LATE', expiresOn: `${year + 3}-01-31`, quantity: 5 },
      { batchCode: 'EARLY', expiresOn: `${year + 2}-01-31`, quantity: 2 },
    ]);
    expect((await createOrder(CHECKOUT)).ok).toBe(true);

    expect((await lot('EARLY')).quantity).toBe(0);
    expect((await lot('LATE')).quantity).toBe(4);
    expect(await total()).toBe(4);
    const picks = await db.select().from(orderItemLots);
    expect(picks.map((p) => p.quantity).sort()).toEqual([1, 2]);
  });

  it('never sends a batch inside the shipping limit, even before the sweep has run', async () => {
    await stock([
      { batchCode: 'SHORT', expiresOn: daysFromNow(30), quantity: 5 },
      { batchCode: 'GOOD', expiresOn: `${year + 2}-01-31`, quantity: 2 },
    ]);
    const r = await createOrder(CHECKOUT);
    expect(r).toMatchObject({ ok: false });
    expect(await db.select().from(orders)).toHaveLength(0);
    expect((await lot('GOOD')).quantity).toBe(2);
    expect(await total()).toBe(7);
  });

  it('puts a cancelled order back into the batches it came from', async () => {
    await stock([{ batchCode: 'B1', expiresOn: `${year + 2}-01-31`, quantity: 5 }]);
    await createOrder(CHECKOUT);
    const [order] = await db.select().from(orders);

    expect(await restoreOrderStock(order.id)).toBe(true);
    expect((await lot('B1')).quantity).toBe(5);
    expect(await total()).toBe(5);
    expect(await db.select().from(orderItemLots)).toHaveLength(0);
  });

  it('sells untracked stock (no batches) from the total, as before', async () => {
    await db.insert(inventory).values({ ...SKU, quantity: 5 });
    expect((await createOrder(CHECKOUT)).ok).toBe(true);
    expect(await total()).toBe(2);
  });
});

describe('holding back short-dated batches', () => {
  it('moves them out of the sellable total for the stockroom to remove', async () => {
    await stock([
      { batchCode: 'SHORT', expiresOn: daysFromNow(30), quantity: 5 },
      { batchCode: 'GOOD', expiresOn: `${year + 2}-01-31`, quantity: 2 },
      { batchCode: 'NOT-RECORDED', expiresOn: null, quantity: 1 },
    ]);
    expect(await holdBackExpiringBatches()).toEqual({ batches: 1, units: 5 });
    expect(await lot('SHORT')).toMatchObject({ quantity: 0, expiredUnits: 5 });
    expect(await total()).toBe(3);
    expect(await holdBackExpiringBatches()).toEqual({ batches: 0, units: 0 });
  });

  it('cuts off at the shelf-life limit, in India time', () => {
    expect(shippingCutoff(new Date('2026-12-31T20:00:00Z'))).toBe('2027-04-01');
  });
});

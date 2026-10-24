import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { inventory, offers, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Offers at checkout: the order is charged the discount the engine gives,
 * records which offer it used, and never sells below the profit floor.
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder } = await import('../orders');

// The sample gel cleanser: ₹349 for 150ml. Cost ₹100 puts its floor at ₹144.49.
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
  items: [{ ...SKU, quantity: 2 }],
};

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses; DELETE FROM offers');
  await client.exec('DELETE FROM domain_events; DELETE FROM inventory');
  await client.exec(`UPDATE catalog_variants SET cost_paise = 10000 WHERE legacy_stock_key = 'face-wash::150ml'`);
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

const addOffer = (over: Partial<typeof offers.$inferInsert> = {}) =>
  db.insert(offers).values({ name: 'Launch 10%', kind: 'percent_off', percentOff: 10, ...over });

describe('offers at checkout', () => {
  it('charges the automatic offer and records it on the order', async () => {
    await addOffer();
    const r = await createOrder(CHECKOUT);
    expect(r.ok).toBe(true);
    const [o] = await db.select().from(orders);
    expect(o.discount).toBe(6980);
    expect(o.total).toBe(69800 - 6980 + 7900);
    expect(o.offerId).not.toBeNull();
  });

  it('applies a typed coupon and refuses an unknown one', async () => {
    await addOffer({ name: 'Welcome 20%', percentOff: 20, couponCode: 'WELCOME20' });
    expect(await createOrder({ ...CHECKOUT, offerCode: 'nope' })).toMatchObject({ ok: false });
    expect((await createOrder({ ...CHECKOUT, offerCode: 'welcome20' })).ok).toBe(true);
    const [o] = await db.select().from(orders);
    expect(o).toMatchObject({ discount: 13960, offerCode: 'WELCOME20' });
  });

  it('caps a too-generous offer at the profit floor', async () => {
    // Saved directly, past the admin check, as if costs rose after it was approved.
    await addOffer({ name: 'Mistake', percentOff: 90 });
    expect((await createOrder(CHECKOUT)).ok).toBe(true);
    const [o] = await db.select().from(orders);
    // Each unit may come down to ₹144.49 and no further.
    expect(o.discount).toBe((34900 - 14449) * 2);
  });

  it('refuses the order when the discount shown has since changed', async () => {
    await addOffer();
    const r = await createOrder({ ...CHECKOUT, expectedDiscountPaise: 13960 });
    expect(r).toMatchObject({ ok: false, code: 'price_changed' });
    expect(await db.select().from(orders).where(eq(orders.email, CHECKOUT.email))).toHaveLength(0);
  });

  it('waives delivery for a free-delivery offer the margin can pay for', async () => {
    await addOffer({ name: 'Free delivery', kind: 'free_delivery', percentOff: null });
    expect((await createOrder(CHECKOUT)).ok).toBe(true);
    const [o] = await db.select().from(orders);
    expect(o).toMatchObject({ shipping: 0, discount: 0, total: 69800 });
  });
});

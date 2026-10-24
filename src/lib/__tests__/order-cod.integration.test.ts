import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventory, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/** Cash on delivery at checkout: a ceiling on the amount, and only where a courier takes cash. */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));
const service = vi.hoisted(() => ({
  answer: null as null | { deliverable: boolean; cod: boolean; days: number | null },
}));
vi.mock('@/modules/shipping/shiprocket', async (orig) => ({
  ...(await orig<typeof import('@/modules/shipping/shiprocket')>()),
  checkServiceability: async () => service.answer,
}));

const { createOrder } = await import('../orders');

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
  items: [{ ...SKU, quantity: 1 }],
};

afterAll(async () => {
  await client?.close();
});
beforeEach(async () => {
  service.answer = null;
  await client.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses; DELETE FROM domain_events');
  await client.exec('DELETE FROM inventory');
  await db.insert(inventory).values({ ...SKU, quantity: 50 });
});

describe('cash on delivery at checkout', () => {
  it('is refused above the limit', async () => {
    const r = await createOrder({ ...CHECKOUT, items: [{ ...SKU, quantity: 10 }] });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/up to ₹3,000/) });
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it('is refused where couriers take no cash, and nothing is sent where none deliver', async () => {
    service.answer = { deliverable: true, cod: false, days: 4 };
    expect(await createOrder(CHECKOUT)).toMatchObject({ ok: false, error: expect.stringMatching(/not available/) });
    service.answer = { deliverable: false, cod: false, days: null };
    expect(await createOrder(CHECKOUT)).toMatchObject({ ok: false, error: expect.stringMatching(/do not deliver/) });
    expect((await db.select().from(inventory))[0].quantity).toBe(50);
  });

  it('goes through when the PIN code is served, or when Shiprocket cannot tell', async () => {
    service.answer = { deliverable: true, cod: true, days: 3 };
    expect((await createOrder(CHECKOUT)).ok).toBe(true);
    service.answer = null;
    expect((await createOrder({ ...CHECKOUT, email: 'ravi@example.com' })).ok).toBe(true);
  });
});

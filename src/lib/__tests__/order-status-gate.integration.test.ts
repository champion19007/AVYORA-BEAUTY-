import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventory } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * With an owner-managed catalogue, checkout reads each product's status in the
 * database, not only the list compiled at the last publish: hiding a product
 * stops its sales at once, and a draft sells only while a preview is shown.
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@/data/catalogue.published.json', () => ({
  default: {
    publishedAt: '2026-10-24T00:00:00.000Z',
    products: [
      {
        id: 'face-wash',
        name: 'Face Wash',
        slug: 'face-wash',
        tagline: '',
        description: 'A face wash.',
        images: ['/images/products/coming-soon.jpg'],
        price: 349,
        isBestSeller: false,
        isNewLaunch: false,
        category: 'cleanser',
        concerns: [],
        ingredients: [],
        sizes: [{ label: '150ml', price: 349 }],
      },
    ],
  },
}));

const { createOrder } = await import('../orders');

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
  items: [{ productId: 'face-wash', size: '150ml', quantity: 1 }],
};
const setStatus = (status: string) =>
  client.exec(`UPDATE catalog_products SET status = '${status}' WHERE id = 'face-wash'`);

afterAll(async () => {
  await client?.close();
});
beforeEach(async () => {
  await client.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses; DELETE FROM inventory');
  await db.insert(inventory).values({ productId: 'face-wash', size: '150ml', quantity: 10 });
});

describe('checkout reads product status', () => {
  it('sells a live product', async () => {
    await setStatus('live');
    expect((await createOrder(CHECKOUT)).ok).toBe(true);
  });

  it('refuses one hidden since the last publish, and a draft outside a preview', async () => {
    for (const status of ['hidden', 'draft']) {
      await setStatus(status);
      expect(await createOrder(CHECKOUT)).toMatchObject({
        ok: false,
        error: expect.stringContaining('no longer available'),
      });
    }
  });
});

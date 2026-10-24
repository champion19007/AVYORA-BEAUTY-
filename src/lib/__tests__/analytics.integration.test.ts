import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { orderItems, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/** The owner's sales figures count real sales only, the same as the stock autopilot. */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({
  db,
  isDatabaseConfigured: () => true,
  readWith: (_consistency: string, fn: (d: typeof db) => unknown) => fn(db),
}));

const { productSales } = await import('../analytics');

let seq = 0;
async function sale(quantity: number, extra: Partial<typeof orders.$inferInsert>) {
  seq += 1;
  const id = `a-${seq}`;
  await db.insert(orders).values({
    id,
    orderNumber: `AVY-A${seq}`,
    email: 'a@example.com',
    status: 'paid',
    paymentStatus: 'paid',
    paymentProvider: 'cashfree',
    subtotal: 50_000 * quantity,
    total: 50_000 * quantity,
    ...extra,
  });
  await db.insert(orderItems).values({
    orderId: id,
    productId: 'ha-toner',
    productName: 'HA Toner',
    size: '150ml',
    unitPrice: 50_000,
    quantity,
    lineTotal: 50_000 * quantity,
  });
}

beforeEach(async () => {
  await client.exec('DELETE FROM order_items; DELETE FROM orders');
});
afterAll(async () => {
  await client?.close();
});

describe('sales figures', () => {
  it('count paid online orders and cash on delivery, and nothing that is not a sale', async () => {
    await sale(1, {}); // paid online
    await sale(2, { status: 'pending', paymentStatus: 'unpaid', paymentProvider: 'cod' }); // COD, not yet delivered
    await sale(4, { status: 'pending', paymentStatus: 'unpaid' }); // abandoned at the payment screen
    await sale(8, { status: 'returned' }); // came back
    await sale(16, { status: 'cancelled' });

    const [row] = await productSales(30);
    expect(row.unitsSold).toBe(3);
    expect(row.revenue).toBe(150_000);
  });
});

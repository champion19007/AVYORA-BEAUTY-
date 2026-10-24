import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventory, orderItems, orders, restockRequests } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
const sent: string[] = [];
vi.mock('@/lib/notify', () => ({
  whatsappConfigured: () => true,
  emailDeliveryConfigured: () => false,
  sendWhatsApp: async (text: string) => {
    sent.push(text);
    return { ok: true };
  },
  sendEmail: async () => ({ ok: true }),
}));

const { planSku, runStockAutopilot, summaryText } = await import('../autopilot');

const NOW = new Date('2026-10-21T03:15:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let seq = 0;
async function sale(
  productId: string,
  size: string,
  quantity: number,
  at: Date,
  extra: Partial<typeof orders.$inferInsert> = {}
) {
  seq += 1;
  const id = `o-${seq}`;
  await db.insert(orders).values({
    id,
    orderNumber: `AVY-${seq}`,
    email: 'a@example.com',
    status: 'paid',
    paymentStatus: 'paid',
    paymentProvider: 'cashfree',
    subtotal: 50_000 * quantity,
    total: 50_000 * quantity,
    createdAt: at,
    ...extra,
  });
  await db.insert(orderItems).values({
    orderId: id,
    productId,
    productName: productId,
    size,
    unitPrice: 50_000,
    quantity,
    lineTotal: 50_000 * quantity,
  });
}

beforeEach(async () => {
  sent.length = 0;
  await client.exec('DELETE FROM restock_requests; DELETE FROM order_items; DELETE FROM orders; DELETE FROM inventory');
});
afterAll(async () => {
  await client?.close();
});

describe('the reorder rule', () => {
  it('reorders a fast seller before it runs out, sized for lead time plus a month', () => {
    // 56 sold in 28 days = 2 a day; 7-day lead time needs 14 on hand.
    expect(planSku({ soldInWindow: 56, quantity: 12, lowStockThreshold: 5 })).toMatchObject({
      dailyRate: 2,
      reorderPoint: 14,
      daysLeft: 6,
      suggest: 74 - 12,
    });
    expect(planSku({ soldInWindow: 56, quantity: 40, lowStockThreshold: 5 }).suggest).toBe(0);
  });

  it('uses the low-stock threshold for slow sellers, and never asks for nothing', () => {
    expect(planSku({ soldInWindow: 0, quantity: 3, lowStockThreshold: 5 })).toMatchObject({
      daysLeft: null,
      suggest: 7,
    });
    expect(planSku({ soldInWindow: 0, quantity: 20, lowStockThreshold: 5 }).suggest).toBe(0);
  });
});

describe('the morning run', () => {
  it('raises one request per running-low SKU, from real sales only, and sends the summary', async () => {
    await db.insert(inventory).values([
      { productId: 'ha-toner', size: '150ml', quantity: 10, lowStockThreshold: 5 },
      { productId: 'sunscreen', size: '50ml', quantity: 100, lowStockThreshold: 5 },
      { productId: 'retinol', size: '30ml', quantity: 0, lowStockThreshold: 5, allowBackorder: true },
    ]);
    // ha-toner: 2 a day for four weeks, so 10 left is 5 days: below the 14 reorder point.
    for (let d = 1; d <= 28; d++) await sale('ha-toner', '150ml', 2, daysAgo(d - 0.5));
    // Demand that is not real: cancelled, and unpaid online. Must not count.
    await sale('sunscreen', '50ml', 20, daysAgo(2), { status: 'cancelled' });
    await sale('sunscreen', '50ml', 20, daysAgo(2), { status: 'pending', paymentStatus: 'unpaid' });

    const result = await runStockAutopilot(db as never, NOW);
    expect(result.raised).toEqual([{ productId: 'ha-toner', size: '150ml', quantity: 64 }]);
    const [request] = await db.select().from(restockRequests);
    expect(request).toMatchObject({ requestedBy: 'autopilot', requestedQuantity: 64, quantityAtRequest: 10 });
    expect(request.note).toMatch(/about 5 days left/);

    expect(result.ordersLastDay).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/1 order, ₹1,000/);

    // Next morning: the open request is not raised again.
    const again = await runStockAutopilot(db as never, NOW);
    expect(again.raised).toEqual([]);
    expect(await db.select().from(restockRequests)).toHaveLength(1);
  });

  it('says so plainly when nothing is low', () => {
    expect(summaryText({ ordersLastDay: 0, salesLastDayPaise: 0, low: [], raisedCount: 0 }).short).toMatch(
      /everything is above its reorder level/
    );
  });
});

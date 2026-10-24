import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { domainEvents, inventory, orders, returnRequests } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * A parcel's life with Shiprocket, against a real (PGlite) Postgres: booked
 * from dispatch, then moved by the courier's webhook, including the cases
 * that cost money when wrong (cash collected, parcels coming back).
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const { createOrder } = await import('@/lib/orders');
const { bookCourier, applyTrackingUpdate } = await import('../shipments');
const { getShiprocketConfig, resetShiprocketToken } = await import('../shiprocket');
const { POST: webhook } = await import('@/app/api/webhooks/courier/route');

const SKU = { productId: 'rice-bran-cleansing-oil', size: '150ml' };
const config = getShiprocketConfig({
  SHIPROCKET_EMAIL: 'api@shop.test',
  SHIPROCKET_PASSWORD: 'pw',
  SHIPROCKET_PICKUP_LOCATION: 'Home',
})!;
const staff = { username: 'manager', role: 'manager' };

const shiprocket = (async (url: string) => {
  const path = url.replace('https://apiv2.shiprocket.in/v1/external', '');
  const body: Record<string, unknown> = {
    '/auth/login': { token: 't' },
    '/orders/create/adhoc': { order_id: 1, shipment_id: 2 },
    '/courier/assign/awb': {
      awb_assign_status: 1,
      response: { data: { awb_code: 'AWB-1', courier_name: 'Delhivery' } },
    },
    '/courier/generate/pickup': {},
    '/courier/generate/label': { label_url: 'https://labels.test/2.pdf' },
  };
  return new Response(JSON.stringify(body[path] ?? {}), { status: 200 });
}) as unknown as typeof fetch;

async function packedOrder(paymentMethod: 'cod' | 'cashfree' = 'cod') {
  const placed = await createOrder(
    {
      email: 'priya@example.com',
      paymentMethod,
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
    },
    null
  );
  if (!placed.ok) throw new Error(placed.error);
  await db
    .update(orders)
    .set({
      status: 'fulfilled',
      fraudStatus: 'approved',
      codConfirmedAt: new Date(),
      ...(paymentMethod === 'cod' ? {} : { paymentStatus: 'paid' as const }),
    })
    .where(eq(orders.id, placed.orderId));
  return placed;
}

const read = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const stock = async () => (await db.select().from(inventory).where(eq(inventory.productId, SKU.productId)))[0].quantity;
const events = async (name: string) => (await db.select().from(domainEvents)).filter((e) => e.name === name).length;

beforeEach(async () => {
  resetShiprocketToken();
  process.env.SHIPROCKET_EMAIL = 'api@shop.test';
  process.env.SHIPROCKET_PASSWORD = 'pw';
  process.env.SHIPROCKET_PICKUP_LOCATION = 'Home';
  process.env.SHIPROCKET_WEBHOOK_TOKEN = 'secret-token';
  await client.exec('DELETE FROM audit_logs; DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses');
  await client.exec('DELETE FROM domain_events; DELETE FROM inventory');
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});
afterAll(async () => {
  await client?.close();
});

describe('booking a courier', () => {
  it('records the AWB on a packed order, once', async () => {
    const order = await packedOrder();
    expect(await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket })).toEqual({
      ok: true,
      awb: 'AWB-1',
    });
    const row = await read(order.orderId);
    expect(row.awb).toBe('AWB-1');
    expect(row.shipment).toMatchObject({ courierName: 'Delhivery', labelUrl: 'https://labels.test/2.pdf' });

    const again = await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket });
    expect(again.ok).toBe(false);
  });

  it('refuses orders that are not packed, on hold, or unpaid online', async () => {
    const order = await packedOrder();
    await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, order.orderId));
    expect((await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket })).ok).toBe(false);

    await db.update(orders).set({ status: 'fulfilled', fraudStatus: 'review' }).where(eq(orders.id, order.orderId));
    expect((await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket })).ok).toBe(false);

    const online = await packedOrder('cashfree');
    await db.update(orders).set({ paymentStatus: 'unpaid' }).where(eq(orders.id, online.orderId));
    expect((await bookCourier(online.orderNumber, staff, { config, fetchImpl: shiprocket })).ok).toBe(false);
    expect((await read(online.orderId)).awb).toBeNull();
  });

  it('frees the order for another try when Shiprocket refuses', async () => {
    const order = await packedOrder();
    const refusing = (async () =>
      new Response(JSON.stringify({ message: 'down' }), { status: 500 })) as unknown as typeof fetch;
    expect((await bookCourier(order.orderNumber, staff, { config, fetchImpl: refusing })).ok).toBe(false);
    expect((await read(order.orderId)).shipment).toBeNull();
    expect((await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket })).ok).toBe(true);
  });
});

describe('courier updates', () => {
  async function booked(paymentMethod: 'cod' | 'cashfree' = 'cod') {
    const order = await packedOrder(paymentMethod);
    await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket });
    return order;
  }

  it('moves a COD parcel to delivered and records the cash as collected', async () => {
    const order = await booked();
    expect(await applyTrackingUpdate({ awb: 'AWB-1', statusId: 42, statusLabel: 'PICKED UP' })).toBe('advanced');
    expect((await read(order.orderId)).status).toBe('shipped');
    expect(await events('order.shipped')).toBe(1);

    await applyTrackingUpdate({ awb: 'AWB-1', statusId: 17, statusLabel: 'OUT FOR DELIVERY' });
    await applyTrackingUpdate({ awb: 'AWB-1', statusId: 7, statusLabel: 'DELIVERED' });
    const done = await read(order.orderId);
    expect(done.status).toBe('delivered');
    expect(done.paymentStatus).toBe('paid');

    // A late "in transit" changes nothing.
    expect(await applyTrackingUpdate({ awb: 'AWB-1', statusId: 18, statusLabel: 'IN TRANSIT' })).toBe('recorded');
    expect((await read(order.orderId)).status).toBe('delivered');
    expect(await events('order.shipped')).toBe(1);
  });

  it('opens a return case for a parcel that came back, without restocking it unseen', async () => {
    const order = await booked('cashfree');
    expect(await stock()).toBe(8);
    await applyTrackingUpdate({ awb: 'AWB-1', statusId: 6, statusLabel: 'SHIPPED' });
    await applyTrackingUpdate({ awb: 'AWB-1', statusId: 10, statusLabel: 'RTO DELIVERED' });
    const row = await read(order.orderId);
    expect(row.status).toBe('returned');
    // Still off the shelf until someone has looked at it.
    expect(await stock()).toBe(8);
    const cases = await db.select().from(returnRequests).where(eq(returnRequests.orderId, order.orderId));
    expect(cases).toMatchObject([{ kind: 'undelivered', status: 'approved' }]);

    // A repeat of the same update opens no second case.
    await applyTrackingUpdate({ awb: 'AWB-1', statusId: 10, statusLabel: 'RTO DELIVERED' });
    expect(await db.select().from(returnRequests)).toHaveLength(1);
  });

  it('flags lost or undelivered parcels for the owner without moving them', async () => {
    const order = await booked();
    await applyTrackingUpdate({ awb: 'AWB-1', statusId: 6, statusLabel: 'SHIPPED' });
    expect(await applyTrackingUpdate({ awb: 'AWB-1', statusId: 21, statusLabel: 'UNDELIVERED' })).toBe('flagged');
    const row = await read(order.orderId);
    expect(row.status).toBe('shipped');
    expect(row.attentionReason).toMatch(/could not deliver/);
  });
});

describe('POST /api/webhooks/courier', () => {
  const post = (body: unknown, token?: string) =>
    webhook(
      new Request('http://shop.test/api/webhooks/courier', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-api-key': token } : {}) },
        body: JSON.stringify(body),
      })
    );

  it('refuses a missing or wrong token, and refuses everything when no token is configured', async () => {
    const order = await packedOrder();
    await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket });
    const delivered = { awb: 'AWB-1', shipment_status_id: 7, shipment_status: 'DELIVERED' };

    expect((await post(delivered)).status).toBe(401);
    expect((await post(delivered, 'guess')).status).toBe(401);
    delete process.env.SHIPROCKET_WEBHOOK_TOKEN;
    expect((await post(delivered, 'secret-token')).status).toBe(503);
    expect((await read(order.orderId)).status).toBe('fulfilled');
  });

  it('applies an authentic update, and answers 200 for unknown parcels', async () => {
    const order = await packedOrder();
    await bookCourier(order.orderNumber, staff, { config, fetchImpl: shiprocket });
    const res = await post({ awb: 'AWB-1', shipment_status_id: 42, shipment_status: 'PICKED UP' }, 'secret-token');
    expect(res.status).toBe(200);
    expect((await read(order.orderId)).status).toBe('shipped');
    expect((await post({ awb: 'NOPE', shipment_status_id: 7 }, 'secret-token')).status).toBe(200);
  });
});

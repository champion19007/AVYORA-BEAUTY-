import { beforeEach, describe, expect, it } from 'vitest';
import {
  adhocOrderPayload,
  bookShipment,
  canAdvance,
  getShiprocketConfig,
  parseTrackingUpdate,
  resetShiprocketToken,
  trackingEffect,
  type ParcelOrder,
} from '../shiprocket';

const config = getShiprocketConfig({
  SHIPROCKET_EMAIL: 'api@shop.test',
  SHIPROCKET_PASSWORD: 'pw',
  SHIPROCKET_PICKUP_LOCATION: 'Home',
})!;

const ORDER: ParcelOrder = {
  orderNumber: 'AVY-1001',
  createdAt: new Date('2026-10-21T04:30:00Z'),
  email: 'priya@example.com',
  cod: true,
  totalPaise: 129_900,
  address: {
    fullName: 'Priya Rani Sharma',
    line1: 'Flat 402',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400059',
    phone: '+91 98765 43210',
  },
  items: [{ name: 'Rice Toner (150ml)', sku: 'rice-toner-150', quantity: 2, unitPaise: 64_950 }],
};

/** A fake Shiprocket: answers by path, records every call. */
function fakeShiprocket(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  const calls: { path: string; body: unknown; auth: string | null }[] = [];
  const answers: Record<string, { status?: number; body: unknown }> = {
    '/auth/login': { body: { token: 'tok-1' } },
    '/orders/create/adhoc': { body: { order_id: 555, shipment_id: 777, status: 'NEW' } },
    '/courier/assign/awb': {
      body: { awb_assign_status: 1, response: { data: { awb_code: 'AWB123', courier_name: 'Delhivery Surface' } } },
    },
    '/courier/generate/pickup': { body: { pickup_status: 1 } },
    '/courier/generate/label': { body: { label_created: 1, label_url: 'https://labels.test/777.pdf' } },
    ...overrides,
  };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://apiv2.shiprocket.in/v1/external', '');
    calls.push({
      path,
      body: JSON.parse(String(init.body)),
      auth: (init.headers as Record<string, string>).Authorization ?? null,
    });
    const a = answers[path] ?? { status: 404, body: { message: 'unknown' } };
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => resetShiprocketToken());

describe('booking', () => {
  it('creates the order, assigns an AWB, schedules pickup and gets the label', async () => {
    const { fetchImpl, calls } = fakeShiprocket();
    const result = await bookShipment(ORDER, config, fetchImpl);
    expect(result).toMatchObject({
      ok: true,
      shipment: {
        awb: 'AWB123',
        courierName: 'Delhivery Surface',
        labelUrl: 'https://labels.test/777.pdf',
        shipmentId: 777,
      },
    });
    expect(calls.map((c) => c.path)).toEqual([
      '/auth/login',
      '/orders/create/adhoc',
      '/courier/assign/awb',
      '/courier/generate/pickup',
      '/courier/generate/label',
    ]);
    expect(calls.slice(1).every((c) => c.auth === 'Bearer tok-1')).toBe(true);
    expect(calls[2].body).toEqual({ shipment_id: 777 });
  });

  it('sends rupees, a 10-digit phone, COD and India time', () => {
    const p = adhocOrderPayload(ORDER, config);
    expect(p).toMatchObject({
      order_id: 'AVY-1001',
      order_date: '2026-10-21 10:00',
      pickup_location: 'Home',
      billing_customer_name: 'Priya',
      billing_last_name: 'Rani Sharma',
      billing_phone: '9876543210',
      payment_method: 'COD',
      sub_total: 1299,
      order_items: [{ units: 2, selling_price: 649.5 }],
      weight: 0.5,
    });
    expect(adhocOrderPayload({ ...ORDER, cod: false }, config).payment_method).toBe('Prepaid');
  });

  it('fails clearly when no courier takes the parcel, and when Shiprocket refuses the login', async () => {
    const noCourier = fakeShiprocket({
      '/courier/assign/awb': { body: { awb_assign_status: 0, message: 'Pincode not serviceable' } },
    });
    const r1 = await bookShipment(ORDER, config, noCourier.fetchImpl);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toContain('Pincode not serviceable');

    resetShiprocketToken();
    const badLogin = fakeShiprocket({ '/auth/login': { status: 403, body: {} } });
    expect((await bookShipment(ORDER, config, badLogin.fetchImpl)).ok).toBe(false);
  });

  it('still records the booking if only the label fails', async () => {
    const { fetchImpl } = fakeShiprocket({ '/courier/generate/label': { status: 500, body: {} } });
    expect(await bookShipment(ORDER, config, fetchImpl)).toMatchObject({
      ok: true,
      shipment: { awb: 'AWB123', labelUrl: null },
    });
  });

  it('is off without credentials', () => {
    expect(getShiprocketConfig({})).toBeNull();
  });
});

describe('tracking', () => {
  it('maps courier statuses to what the customer is told', () => {
    expect(trackingEffect(42)).toEqual({ kind: 'status', status: 'shipped' }); // picked up
    expect(trackingEffect(18)).toEqual({ kind: 'status', status: 'shipped' }); // in transit
    expect(trackingEffect(17)).toEqual({ kind: 'status', status: 'out_for_delivery' });
    expect(trackingEffect(7)).toEqual({ kind: 'status', status: 'delivered' });
    expect(trackingEffect(10)).toEqual({ kind: 'status', status: 'returned' });
    expect(trackingEffect(21).kind).toBe('problem'); // undelivered
    expect(trackingEffect(2)).toEqual({ kind: 'none' }); // label generated
  });

  it('only moves forward, so a late update cannot undo a delivery', () => {
    expect(canAdvance('fulfilled', 'shipped')).toBe(true);
    expect(canAdvance('shipped', 'delivered')).toBe(true);
    expect(canAdvance('delivered', 'shipped')).toBe(false);
    expect(canAdvance('out_for_delivery', 'shipped')).toBe(false);
    expect(canAdvance('cancelled', 'shipped')).toBe(false);
    expect(canAdvance('shipped', 'returned')).toBe(true);
    expect(canAdvance('delivered', 'returned')).toBe(false);
  });

  it('reads the webhook body Shiprocket documents', () => {
    expect(
      parseTrackingUpdate({ awb: '19041424751540', shipment_status_id: 18, shipment_status: 'IN TRANSIT' })
    ).toEqual({
      awb: '19041424751540',
      statusId: 18,
      statusLabel: 'IN TRANSIT',
    });
    expect(parseTrackingUpdate({ hello: 'world' })).toBeNull();
  });
});

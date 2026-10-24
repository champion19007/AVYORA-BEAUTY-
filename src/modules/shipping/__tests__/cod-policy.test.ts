import { beforeEach, describe, expect, it } from 'vitest';
import { packingHold } from '../cod-policy';
import {
  checkServiceability,
  getShiprocketConfig,
  resetServiceabilityCache,
  resetShiprocketToken,
} from '../shiprocket';

const ready = {
  paymentProvider: 'cod',
  paymentStatus: 'unpaid',
  fraudStatus: 'approved',
  attentionReason: null,
  codConfirmedAt: new Date(),
};

describe('packingHold', () => {
  it('lets a checked, confirmed cash order be packed', () => {
    expect(packingHold(ready)).toBeNull();
  });

  it('holds a cash order the customer has not confirmed', () => {
    expect(packingHold({ ...ready, codConfirmedAt: null })).toMatch(/confirm/);
  });

  it('holds anything the owner flagged, any failed risk check, and unpaid online orders', () => {
    expect(packingHold({ ...ready, attentionReason: 'x' })).toMatch(/owner/);
    expect(packingHold({ ...ready, fraudStatus: 'review' })).toMatch(/check/);
    expect(packingHold({ ...ready, fraudStatus: 'pending' })).toMatch(/running/);
    expect(packingHold({ ...ready, paymentProvider: 'cashfree', codConfirmedAt: null })).toMatch(/Not paid/);
    expect(
      packingHold({ ...ready, paymentProvider: 'cashfree', paymentStatus: 'paid', codConfirmedAt: null })
    ).toBeNull();
  });
});

describe('checkServiceability', () => {
  const config = getShiprocketConfig({
    SHIPROCKET_EMAIL: 'api@example.com',
    SHIPROCKET_PASSWORD: 'x',
    SHIPROCKET_PICKUP_LOCATION: 'Home',
    SHIPROCKET_PICKUP_PINCODE: '400001',
  });
  let calls = 0;
  const fake = (couriers: { cod: number; estimated_delivery_days: string }[] | null, status = 200) =>
    (async (url: string) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ token: 't' }));
      calls += 1;
      return new Response(JSON.stringify({ data: couriers ? { available_courier_companies: couriers } : {} }), {
        status,
      });
    }) as typeof fetch;

  beforeEach(() => {
    calls = 0;
    resetServiceabilityCache();
    resetShiprocketToken();
  });

  it('reports delivery, cash and the fastest courier', async () => {
    const r = await checkServiceability(
      '560001',
      config,
      fake([
        { cod: 0, estimated_delivery_days: '5' },
        { cod: 1, estimated_delivery_days: '3' },
      ])
    );
    expect(r).toEqual({ deliverable: true, cod: true, days: 3 });
  });

  it('says no for a PIN code no courier serves, and remembers the answer', async () => {
    const f = fake(null, 404);
    expect(await checkServiceability('999999', config, f)).toEqual({ deliverable: false, cod: false, days: null });
    await checkServiceability('999999', config, f);
    expect(calls).toBe(1);
  });

  it('cannot tell without a pickup PIN code or when Shiprocket fails', async () => {
    expect(await checkServiceability('560001', { ...config!, pickupPincode: null }, fake([]))).toBeNull();
    expect(await checkServiceability('560001', config, fake(null, 500))).toBeNull();
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventory, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * A guest order must carry proof that its delivery number was verified by SMS.
 * Checked in createOrder, which every checkout path (COD action, Cashfree and
 * Razorpay routes) goes through, so no path can skip it.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder } = await import('../orders');
const { signPhoneProof } = await import('../checkout-phone');

const SKU = { productId: 'rice-bran-cleansing-oil', size: '150ml' };
const CHECKOUT = {
  email: 'guest@example.com',
  paymentMethod: 'cod' as const,
  address: {
    fullName: 'Guest Buyer',
    line1: 'Flat 1, Example Road',
    line2: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400059',
    country: 'IN',
    phone: '9876543210',
  },
  items: [{ ...SKU, quantity: 1 }],
};

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-0123456789');
  vi.stubEnv('FAST2SMS_API_KEY', 'test-key');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await client?.close();
});
beforeEach(async () => {
  await client.exec(
    'DELETE FROM order_items; DELETE FROM orders; DELETE FROM addresses; DELETE FROM domain_events; DELETE FROM inventory'
  );
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

describe('guest phone verification at checkout', () => {
  it('refuses a guest order without a proof', async () => {
    const result = await createOrder(CHECKOUT);
    expect(result.ok).toBe(false);
    // The client re-renders as a guest on this code, which shows the Get OTP field.
    if (!result.ok) expect(result.code).toBe('phone_unverified');
    expect((await db.select().from(orders)).length).toBe(0);
  });

  it('refuses a proof for a different number', async () => {
    const result = await createOrder({ ...CHECKOUT, phoneProof: await signPhoneProof('9123456789') });
    expect(result.ok).toBe(false);
  });

  // The first order to get past the check loads the rest of the order path; the refusals above never do.
  it('places the order with a proof for the delivery number', { timeout: 60_000 }, async () => {
    const result = await createOrder({ ...CHECKOUT, phoneProof: await signPhoneProof('+91 98765 43210') });
    expect(result.ok).toBe(true);
  });

  it('does not ask a signed-in customer', async () => {
    const result = await createOrder(CHECKOUT, 'user_signed_in');
    // Not refused for the phone: any failure here would be about the user row, not the proof.
    if (!result.ok) expect(result.error).not.toMatch(/Verify your mobile/);
  });
});

import { describe, expect, it } from 'vitest';
import { checkoutSchema } from '@/lib/orders';

const base = {
  email: 'kid@example.com',
  paymentMethod: 'cod',
  address: {
    fullName: 'Test Customer',
    line1: '12 Test Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    phone: '9876543210',
  },
};
const line = { productId: 'face-wash', size: '150ml', quantity: 1 };

describe('checkoutSchema items', () => {
  it('accepts a normal bag', () => {
    expect(checkoutSchema.safeParse({ ...base, items: [{ ...line, quantity: 10 }] }).success).toBe(true);
  });

  it('refuses more than the per-SKU cap, or the same SKU split across lines', () => {
    expect(checkoutSchema.safeParse({ ...base, items: [{ ...line, quantity: 11 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, items: [line, line] }).success).toBe(false);
  });
});

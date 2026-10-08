import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/*
 * The assistant's order check uses the existing `trackOrder` action and
 * nothing else. These tests pin what an unauthorised request gets from it
 * on real migrations: the same "not found" whether the order is missing or
 * the email is wrong, nothing without both fields, and a durable limit.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
const { trackOrder } = await import('@/app/track-order/actions');

const form = (orderNumber: string, email: string) => {
  const f = new FormData();
  f.set('orderNumber', orderNumber);
  f.set('email', email);
  return f;
};

afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate orders, rate_limits restart identity cascade`);
  await db.insert(orders).values({
    orderNumber: 'AVY-T1',
    email: 'owner@example.test',
    status: 'paid',
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    subtotal: 100,
    total: 100,
    shippingAddress: { city: 'Pune', state: 'MH', line1: '1 Private Street' },
  } as typeof orders.$inferInsert);
});

describe('order lookup used by the assistant', () => {
  it('the right number and email find the order, with a coarse location only', async () => {
    const r = await trackOrder({}, form('avy-t1', 'Owner@Example.test'));
    expect(r.found).toMatchObject({ orderNumber: 'AVY-T1', destination: 'Pune, MH' });
    expect(JSON.stringify(r)).not.toMatch(/Private Street/);
  });

  it('a wrong email and a missing order get the same answer, revealing nothing', async () => {
    const wrongEmail = await trackOrder({}, form('AVY-T1', 'someone@example.test'));
    const missing = await trackOrder({}, form('AVY-T999', 'owner@example.test'));
    expect(wrongEmail).toEqual({ error: 'We could not find an order with those details.' });
    expect(missing).toEqual(wrongEmail);
  });

  it('an order number alone is not enough', async () => {
    expect(await trackOrder({}, form('AVY-T1', ''))).toEqual({ error: 'Enter the email you ordered with.' });
  });

  it('guessing is rate limited', async () => {
    let last = {};
    for (let i = 0; i < 25; i++) last = await trackOrder({}, form(`AVY-G${i}`, 'guess@example.test'));
    expect((last as { error?: string }).error).toMatch(/try again|too many/i);
  });
});

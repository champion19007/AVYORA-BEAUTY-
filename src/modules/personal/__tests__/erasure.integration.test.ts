import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/** Self-serve erasure: skin data on its own, or the whole account, with orders kept but unlinked. */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }));

const { eraseAccount, eraseSkinData } = await import('../erasure');

const USER = { id: 'user-1', email: 'Asha@Example.com' };
const owner = { userId: USER.id, anonymousOwnerHash: null };

async function seed() {
  await db.insert(schema.users).values({ id: USER.id, email: USER.email.toLowerCase(), name: 'Asha' });
  await db.insert(schema.addresses).values({
    userId: USER.id,
    fullName: 'Asha Rao',
    line1: '12 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'IN',
    phone: '9876543210',
  });
  const [consent] = await db
    .insert(schema.consentRecords)
    .values({ ...owner, purpose: 'routine_saving', policyVersion: 'v1' })
    .returning();
  await db.insert(schema.orders).values({
    orderNumber: 'AVY-1',
    userId: USER.id,
    email: USER.email,
    subtotal: 100,
    total: 100,
  });
  await db
    .insert(schema.newsletterSubscribers)
    .values({ email: USER.email.toLowerCase(), consentVersion: 'v1', tokenHash: 'a'.repeat(64) });
  return consent;
}

afterAll(async () => {
  await client?.close();
});
beforeEach(async () => {
  await client.exec(
    'DELETE FROM orders; DELETE FROM newsletter_subscribers; DELETE FROM audit_logs; DELETE FROM users'
  );
});

describe('erasure', () => {
  it('deletes skin data and withdraws its consent, keeping the account', async () => {
    await seed();
    expect(await eraseSkinData(db as never, null, USER.id)).toEqual({ ok: true });
    const [consent] = await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.userId, USER.id));
    expect(consent.withdrawnAt).not.toBeNull();
    expect(await db.select().from(schema.users)).toHaveLength(1);
  });

  it('deletes the account and what hangs off it, keeping orders unlinked', async () => {
    await seed();
    expect(await eraseAccount(db as never, null, USER)).toEqual({ ok: true });
    expect(await db.select().from(schema.users)).toHaveLength(0);
    expect(await db.select().from(schema.addresses).where(eq(schema.addresses.userId, USER.id))).toHaveLength(0);
    expect(await db.select().from(schema.consentRecords)).toHaveLength(0);
    expect(await db.select().from(schema.newsletterSubscribers)).toHaveLength(0);
    const [order] = await db.select().from(schema.orders);
    expect(order).toMatchObject({ orderNumber: 'AVY-1', userId: null });
  });
});

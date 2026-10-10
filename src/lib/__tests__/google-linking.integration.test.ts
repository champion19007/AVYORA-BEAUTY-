import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { sessions, users } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/*
 * Google sign-in links to an existing account by email. An unverified
 * password on that account must not survive the link (pre-account hijacking);
 * a verified account keeps everything.
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
const { secureAccountLinkedToGoogle } = await import('../customer-accounts');

const later = new Date(Date.now() + 86_400_000);

afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate sessions, users restart identity cascade`);
});

describe('linking Google to an existing account', () => {
  it('drops an unverified password and ends its sessions', async () => {
    await db.insert(users).values({ id: 'u1', email: 'a@example.test', passwordHash: 'set-by-someone' });
    await db.insert(sessions).values({ sessionToken: 't1', userId: 'u1', expires: later });

    await secureAccountLinkedToGoogle('u1');

    const [row] = await db.select().from(users).where(eq(users.id, 'u1'));
    expect(row.passwordHash).toBeNull();
    expect(row.emailVerified).toBeInstanceOf(Date);
    expect(await db.select().from(sessions).where(eq(sessions.userId, 'u1'))).toHaveLength(0);
  });

  it('keeps a verified account as it is', async () => {
    const verified = new Date('2026-01-01T00:00:00Z');
    await db
      .insert(users)
      .values({ id: 'u2', email: 'b@example.test', passwordHash: 'owner', emailVerified: verified });
    await db.insert(sessions).values({ sessionToken: 't2', userId: 'u2', expires: later });

    await secureAccountLinkedToGoogle('u2');

    const [row] = await db.select().from(users).where(eq(users.id, 'u2'));
    expect(row.passwordHash).toBe('owner');
    expect(row.emailVerified?.toISOString()).toBe(verified.toISOString());
    expect(await db.select().from(sessions).where(eq(sessions.userId, 'u2'))).toHaveLength(1);
  });
});

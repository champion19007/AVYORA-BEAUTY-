import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/*
 * Address book CRUD on real migrations: each account sees and changes only
 * its own addresses. A foreign id finds nothing (the server actions pass
 * the session's user id with every id from the client).
 */
const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
const { addressSchema, createAddress, deleteAddress, getDefaultAddress, listAddresses, setDefaultAddress, updateAddress } = await import('../addresses');

const input = (over: Record<string, unknown> = {}) =>
  addressSchema.parse({ fullName: 'Test Person', phone: '9876543210', postalCode: '411001', line1: '1 Test Street', line2: '', landmark: '', city: 'Pune', state: 'Maharashtra', isDefault: false, ...over });

afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate addresses, users restart identity cascade`);
  await db.insert(users).values([
    { id: 'user-a', email: 'a@example.test' },
    { id: 'user-b', email: 'b@example.test' },
  ]);
});

describe('address book ownership', () => {
  it('create, list, update, set default and delete for the owner', async () => {
    const first = await createAddress('user-a', input());
    const second = await createAddress('user-a', input({ city: 'Mumbai' }));
    expect((await listAddresses('user-a')).map((a) => a.id).sort()).toEqual([first.id, second.id].sort());
    expect(await updateAddress('user-a', second.id, input({ city: 'Nagpur' }))).toBeTruthy();
    expect(await setDefaultAddress('user-a', second.id)).toBe(true);
    expect((await getDefaultAddress('user-a'))?.id).toBe(second.id);
    expect(await deleteAddress('user-a', first.id)).toBe(true);
    expect((await listAddresses('user-a')).map((a) => a.city)).toEqual(['Nagpur']);
  });

  it('another account cannot read, change, default or delete it', async () => {
    const a = await createAddress('user-a', input());
    expect(await listAddresses('user-b')).toEqual([]);
    expect(await updateAddress('user-b', a.id, input({ city: 'Elsewhere' }))).toBeFalsy();
    expect(await setDefaultAddress('user-b', a.id)).toBe(false);
    expect(await deleteAddress('user-b', a.id)).toBe(false);
    expect((await listAddresses('user-a'))[0]).toMatchObject({ id: a.id, city: 'Pune' });
  });
});

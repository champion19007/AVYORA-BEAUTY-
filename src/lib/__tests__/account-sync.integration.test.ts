import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { carts, cartItems, inventory, users, wishlistItems } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/*
 * Guest-to-account sync against real migrations, through the route handlers,
 * with the session and cookies under the test's control.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

let sessionUser: string | null = null;
let cookieJar: Record<string, string> = {};
vi.mock('@/auth', () => ({ auth: async () => (sessionUser ? { user: { id: sessionUser } } : null) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar[name] ? { value: cookieJar[name] } : undefined),
    set: (name: string, value: string) => {
      cookieJar[name] = value;
    },
  }),
}));

const { accountKey, ANONYMOUS_COOKIE, loadCart, mergeIntoAccount, saveCart } = await import('../cart-server');
const { getWishlist } = await import('@/modules/wishlist/wishlist');
const { cache, POLICIES } = await import('@/infrastructure/cache');
const syncRoute = await import('@/app/api/sync/route');
const mergeRoute = await import('@/app/api/sync/merge/route');
const cartRoute = await import('@/app/api/cart/route');
const wishlistRoute = await import('@/app/api/wishlist/route');

const A = 'user-a';
const B = 'user-b';
const L = (productId: string, size: string, quantity: number) => ({ productId, size, quantity });
const post = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
    body: JSON.stringify(body),
  });
const cartRows = async (userId: string) =>
  (await loadCart(userId, null)).sort((x, y) => `${x.productId}${x.size}`.localeCompare(`${y.productId}${y.size}`));

afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate carts, cart_items, wishlist_items, inventory, users restart identity cascade`);
  await db.insert(users).values([
    { id: A, email: 'a@example.test' },
    { id: B, email: 'b@example.test' },
  ]);
  await cache.invalidateNamespace(POLICIES.cart);
  await cache.invalidateNamespace(POLICIES.wishlist);
  sessionUser = null;
  cookieJar = {};
});

describe('merging a guest bag into an account', () => {
  it('into an empty account: the guest’s lines and wishlist become the account’s', async () => {
    const out = await mergeIntoAccount(A, null, [L('retinol', '90ml', 3)], ['retinol']);
    expect(out.lines).toEqual([L('retinol', '90ml', 3)]);
    expect(await cartRows(A)).toEqual([L('retinol', '90ml', 3)]);
    expect(await getWishlist(A)).toEqual(['retinol']);
  });

  it('into an existing server cart: union, larger quantity per SKU', async () => {
    await saveCart([L('retinol', '90ml', 2), L('face-wash', '150ml', 1)], A, null);
    const out = await mergeIntoAccount(A, null, [L('retinol', '90ml', 3), L('retinol', '30ml', 1)], []);
    expect(await cartRows(A)).toEqual([L('face-wash', '150ml', 1), L('retinol', '30ml', 1), L('retinol', '90ml', 3)]);
    expect(out.adjustments).toEqual([{ productId: 'retinol', size: '90ml', from: 2, to: 3, reason: 'kept_larger' }]);
  });

  it('also folds in the server-side guest cart, and transfers it exactly once', async () => {
    await saveCart([L('ha-toner', '200ml', 2)], null, 'anon-1');
    await mergeIntoAccount(A, 'anon-1', [L('retinol', '90ml', 1)], []);
    expect(await cartRows(A)).toEqual([L('ha-toner', '200ml', 2), L('retinol', '90ml', 1)]);
    expect(
      await db
        .select()
        .from(carts)
        .where(sql`anonymous_id = 'anon-1'`)
    ).toHaveLength(0);
  });

  it('repeated merge requests cannot duplicate quantities', async () => {
    await saveCart([L('retinol', '90ml', 2)], A, null);
    const guest = [L('retinol', '90ml', 2), L('face-wash', '150ml', 1)];
    for (let i = 0; i < 4; i++) await mergeIntoAccount(A, null, guest, ['retinol']);
    expect(await cartRows(A)).toEqual([L('face-wash', '150ml', 1), L('retinol', '90ml', 2)]);
    expect(await db.select().from(wishlistItems)).toHaveLength(1);
  });

  it('concurrent merges and saves serialise on the account’s cart: no lost lines, no doubling', async () => {
    await saveCart([L('retinol', '90ml', 1)], A, null);
    await Promise.all([
      mergeIntoAccount(A, null, [L('retinol', '90ml', 2)], []),
      mergeIntoAccount(A, null, [L('retinol', '90ml', 2)], []),
      mergeIntoAccount(A, null, [L('face-wash', '150ml', 1)], []),
    ]);
    const rows = await cartRows(A);
    expect(rows).toEqual([L('face-wash', '150ml', 1), L('retinol', '90ml', 2)]);
    expect((await db.select().from(carts)).filter((c) => c.userId === A)).toHaveLength(1);
  });

  it('caps by counted stock and the purchase limit, and reports it', async () => {
    await db.insert(inventory).values({ productId: 'retinol', size: '90ml', quantity: 2 });
    const out = await mergeIntoAccount(A, null, [L('retinol', '90ml', 5), L('face-wash', '150ml', 40)], []);
    expect(await cartRows(A)).toEqual([L('face-wash', '150ml', 10), L('retinol', '90ml', 2)]);
    expect(out.adjustments.map((a) => a.reason).sort()).toEqual(['purchase_limit', 'stock']);
  });
});

describe('the sync routes', () => {
  it('a guest gets no private state back', async () => {
    const res = await syncRoute.GET();
    expect(await res.json()).toEqual({ accountKey: null, cart: null, wishlist: null });
  });

  it('each account reads only its own bag and wishlist', async () => {
    await saveCart([L('retinol', '90ml', 4)], A, null);
    await mergeIntoAccount(A, null, [], ['retinol']);
    sessionUser = B;
    const asB = await (await syncRoute.GET()).json();
    expect(asB).toEqual({ accountKey: accountKey(B), cart: [], wishlist: [] });
    sessionUser = A;
    const asA = await (await syncRoute.GET()).json();
    expect(asA).toEqual({ accountKey: accountKey(A), cart: [L('retinol', '90ml', 4)], wishlist: ['retinol'] });
    expect(accountKey(A)).not.toContain(A);
  });

  it('merge requires a signed-in account and validates the guest lines', async () => {
    expect((await mergeRoute.POST(post({ lines: [L('retinol', '90ml', 1)] }))).status).toBe(401);
    sessionUser = A;
    const res = await mergeRoute.POST(
      post({
        lines: [L('retinol', '90ml', 1), L('retinol', '60ml', 1), { productId: 'x', price: 1 }],
        wishlist: ['ha-toner', 7],
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      accountKey: accountKey(A),
      cart: [L('retinol', '90ml', 1)],
      wishlist: ['ha-toner'],
    });
  });

  it('merge uses the guest cookie of the request, not one named in the body', async () => {
    await saveCart([L('ha-toner', '200ml', 1)], null, 'someone-elses-anon');
    sessionUser = A;
    cookieJar[ANONYMOUS_COOKIE] = 'my-anon';
    await mergeRoute.POST(post({ lines: [], wishlist: [], anonymousId: 'someone-elses-anon' }));
    expect(await cartRows(A)).toEqual([]);
    expect(
      await db
        .select()
        .from(carts)
        .where(sql`anonymous_id = 'someone-elses-anon'`)
    ).toHaveLength(1);
  });

  it('a save tagged with another account is refused, and nothing is written', async () => {
    sessionUser = B;
    await saveCart([L('face-wash', '150ml', 1)], B, null);
    const res = await cartRoute.POST(post({ lines: [L('retinol', '90ml', 9)], accountKey: accountKey(A) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'account_changed', accountKey: accountKey(B) });
    expect(await cartRows(B)).toEqual([L('face-wash', '150ml', 1)]);
    expect(await cartRows(A)).toEqual([]);
  });

  it('a stale tab that still thinks it is signed in cannot write as a guest either', async () => {
    cookieJar[ANONYMOUS_COOKIE] = 'anon-2';
    const res = await cartRoute.POST(post({ lines: [L('retinol', '90ml', 1)], accountKey: accountKey(A) }));
    expect(res.status).toBe(409);
  });

  it('the wishlist has the same guard', async () => {
    sessionUser = B;
    const refused = await wishlistRoute.POST(post({ productIds: ['retinol'], accountKey: accountKey(A) }));
    expect(refused.status).toBe(409);
    expect(await getWishlist(B)).toEqual([]);
    const ok = await wishlistRoute.POST(post({ productIds: ['retinol'], accountKey: accountKey(B) }));
    expect(ok.status).toBe(200);
    expect(await getWishlist(B)).toEqual(['retinol']);
    expect(await getWishlist(A)).toEqual([]);
  });

  it('a failed merge leaves the guest’s server cart in place to retry', async () => {
    await saveCart([L('ha-toner', '200ml', 2)], null, 'anon-3');
    sessionUser = A;
    cookieJar[ANONYMOUS_COOKIE] = 'anon-3';
    // Force the transaction to fail after it has started.
    await client.exec(`CREATE FUNCTION fail_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$ LANGUAGE plpgsql;
                       CREATE TRIGGER fail_cart_items BEFORE INSERT ON cart_items FOR EACH ROW EXECUTE FUNCTION fail_insert();`);
    try {
      const res = await mergeRoute.POST(post({ lines: [L('retinol', '90ml', 1)], wishlist: [] }));
      expect(res.status).toBe(503);
    } finally {
      await client.exec(`DROP TRIGGER fail_cart_items ON cart_items; DROP FUNCTION fail_insert();`);
    }
    // Rolled back: the guest cart was not deleted and the account got nothing.
    expect(
      await db
        .select()
        .from(carts)
        .where(sql`anonymous_id = 'anon-3'`)
    ).toHaveLength(1);
    expect(await db.select().from(cartItems)).toHaveLength(1);
    // And a retry then succeeds.
    expect((await mergeRoute.POST(post({ lines: [L('retinol', '90ml', 1)], wishlist: [] }))).status).toBe(200);
    expect(await cartRows(A)).toEqual([L('ha-toner', '200ml', 2), L('retinol', '90ml', 1)]);
  });
});

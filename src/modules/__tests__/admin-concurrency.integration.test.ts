import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLogs, domainEvents, inventory, productPricing } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Two operators, one record.
 *
 * Before this, two owners saving one price meant the second silently erased
 * the first, and an owner typing a stock count from memory silently erased a
 * sale that happened while they were typing. Both now fail loudly, and every
 * accepted change leaves an audit row naming who made it.
 */

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));

const { setPrice, STALE_PRICE_MESSAGE } = await import('@/modules/catalog/pricing-commands');
const { setStock, adjustStock } = await import('@/modules/inventory/stock-commands');

const owner = { id: 'owner', role: 'owner' };
const manager = { id: 'manager', role: 'manager' };
const SKU = { productId: 'rice-bran-cleansing-oil', size: '150ml' };

const price = (over: Record<string, unknown> = {}) => ({
  ...SKU,
  price: 64_900,
  salePrice: null,
  offerLabel: null,
  offerEndsAt: null,
  expectedVersion: 0,
  ...over,
});

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate product_pricing, inventory, audit_logs, domain_events restart identity cascade`);
});

describe('price edits', () => {
  it('saves when the version matches, and moves it on', async () => {
    const first = await setPrice(price(), owner);
    expect(first).toMatchObject({ ok: true, value: { version: 1 } });

    const second = await setPrice(price({ price: 69_900, expectedVersion: 1 }), owner);
    expect(second).toMatchObject({ ok: true, value: { version: 2 } });
  });

  it('refuses a save made against a stale version', async () => {
    await setPrice(price(), owner);
    await setPrice(price({ price: 69_900, expectedVersion: 1 }), owner);

    // A second tab, still showing version 1.
    const stale = await setPrice(price({ price: 59_900, expectedVersion: 1 }), owner);

    expect(stale).toEqual({ ok: false, code: 'conflict', message: STALE_PRICE_MESSAGE });
    const [row] = await db.select().from(productPricing);
    expect(row.price).toBe(69_900);
  });

  it('lets exactly one of two simultaneous saves win', async () => {
    await setPrice(price(), owner);

    const results = await Promise.all([
      setPrice(price({ price: 70_000, expectedVersion: 1 }), owner),
      setPrice(price({ price: 80_000, expectedVersion: 1 }), owner),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'conflict')).toHaveLength(1);
  });

  it('lets exactly one of two simultaneous first saves create the row', async () => {
    const results = await Promise.all([
      setPrice(price({ price: 70_000 }), owner),
      setPrice(price({ price: 80_000 }), owner),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(productPricing)).toHaveLength(1);
  });

  it('refuses an offer that is not a discount', async () => {
    const result = await setPrice(price({ salePrice: 70_000 }), owner);
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('refuses the stockroom', async () => {
    expect(await setPrice(price(), manager)).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('records who changed what, with before and after, in the same transaction', async () => {
    await setPrice(price(), owner);
    await setPrice(price({ price: 69_900, expectedVersion: 1 }), owner);

    const trail = await db.select().from(auditLogs).orderBy(auditLogs.id);
    expect(trail).toHaveLength(2);
    expect(trail[1]).toMatchObject({
      actor: 'owner',
      action: 'pricing.set',
      entityId: `${SKU.productId}::${SKU.size}`,
      oldValue: expect.objectContaining({ price: 64_900, version: 1 }),
      newValue: expect.objectContaining({ price: 69_900, version: 2 }),
    });

    const events = await db.select().from(domainEvents);
    expect(events.map((e) => e.name)).toEqual(['pricing.changed', 'pricing.changed']);
  });

  it('writes no audit row for a refused change', async () => {
    await setPrice(price({ expectedVersion: 7 }), owner);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });
});

describe('stock edits', () => {
  it('sets a count when nothing has moved', async () => {
    await db.insert(inventory).values({ ...SKU, quantity: 10 });
    const result = await setStock({ ...SKU, quantity: 25, expectedQuantity: 10 }, owner);
    expect(result).toMatchObject({ ok: true });
  });

  it('refuses an owner count when a sale moved the shelf meanwhile', async () => {
    await db.insert(inventory).values({ ...SKU, quantity: 10 });

    // A customer buys two after the owner's page loaded showing 10.
    await db.update(inventory).set({ quantity: 8 }).where(eq(inventory.productId, SKU.productId));

    const result = await setStock({ ...SKU, quantity: 25, expectedQuantity: 10 }, owner);
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    const [row] = await db.select().from(inventory);
    expect(row.quantity).toBe(8);
  });

  it('refuses an owner count when the stockroom adjusted meanwhile', async () => {
    await db.insert(inventory).values({ ...SKU, quantity: 10 });
    await adjustStock({ ...SKU, delta: 12 }, manager);

    const result = await setStock({ ...SKU, quantity: 10, expectedQuantity: 10 }, owner);
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    const [row] = await db.select().from(inventory);
    expect(row.quantity).toBe(22);
  });

  it('adds up simultaneous stockroom adjustments without losing any', async () => {
    await db.insert(inventory).values({ ...SKU, quantity: 10 });

    await Promise.all([
      adjustStock({ ...SKU, delta: 5 }, manager),
      adjustStock({ ...SKU, delta: 7 }, manager),
      adjustStock({ ...SKU, delta: -2 }, owner),
    ]);

    const [row] = await db.select().from(inventory);
    expect(row.quantity).toBe(20);
    expect(await db.select().from(auditLogs)).toHaveLength(3);
  });

  it('never takes the shelf below zero', async () => {
    await db.insert(inventory).values({ ...SKU, quantity: 3 });
    await adjustStock({ ...SKU, delta: -10 }, manager);
    const [row] = await db.select().from(inventory);
    expect(row.quantity).toBe(0);
  });

  it('keeps absolute counts to the owner', async () => {
    const result = await setStock({ ...SKU, quantity: 5, expectedQuantity: null }, manager);
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

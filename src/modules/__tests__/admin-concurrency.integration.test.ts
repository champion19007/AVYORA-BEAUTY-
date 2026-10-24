import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLogs, domainEvents, inventory, productPricing, stockLots } from '@/db/schema';
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
const { receiveStock, adjustBatch } = await import('@/modules/inventory/stock-commands');

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
  await db.execute(
    sql`truncate product_pricing, inventory, stock_lots, audit_logs, domain_events restart identity cascade`
  );
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
  const NEXT_YEAR = `${new Date().getUTCFullYear() + 2}-06-30`;
  const receive = (over: Record<string, unknown> = {}, actor = manager) =>
    receiveStock({ ...SKU, batchCode: 'b-101', expiresOn: NEXT_YEAR, quantity: 10, ...over }, actor);
  const total = async () => (await db.select().from(inventory))[0]?.quantity;

  it('records a delivery as a batch and adds it to the total', async () => {
    expect(await receive()).toMatchObject({ ok: true, value: { quantity: 10 } });
    expect(await receive({ quantity: 4 })).toMatchObject({ ok: true, value: { quantity: 14 } });
    const lots = await db.select().from(stockLots);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ batchCode: 'B-101', quantity: 14, expiresOn: NEXT_YEAR });
  });

  it('refuses a batch already recorded with a different expiry', async () => {
    await receive();
    const result = await receive({ expiresOn: `${new Date().getUTCFullYear() + 3}-01-31` });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect(await total()).toBe(10);
  });

  it('refuses a delivery too close to expiry to sell', async () => {
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(await receive({ expiresOn: soon })).toMatchObject({ ok: false, code: 'conflict' });
    expect(await total()).toBeUndefined();
  });

  it('adds up simultaneous batch corrections without losing any', async () => {
    await receive();
    const [lot] = await db.select().from(stockLots);
    await Promise.all([
      adjustBatch({ lotId: lot.id, delta: 5 }, manager),
      adjustBatch({ lotId: lot.id, delta: 7 }, manager),
      adjustBatch({ lotId: lot.id, delta: -2, reason: 'Damaged' }, owner),
    ]);
    expect(await total()).toBe(20);
    expect((await db.select().from(stockLots))[0].quantity).toBe(20);
    expect(await db.select().from(auditLogs)).toHaveLength(4);
  });

  it('never takes a batch below zero, and moves the total by what was really removed', async () => {
    await receive({ quantity: 3 });
    await receive({ batchCode: 'B-102', quantity: 5 });
    const [lot] = await db.select().from(stockLots).where(eq(stockLots.batchCode, 'B-101'));
    await adjustBatch({ lotId: lot.id, delta: -10 }, manager);
    expect(await total()).toBe(5);
  });

  it('is for staff only', async () => {
    expect(await receive({}, { id: 'x', role: 'customer' })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

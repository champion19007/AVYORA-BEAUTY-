import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { and, eq } from 'drizzle-orm';
import { inventory } from '@/db/schema';

/**
 * Stock going back on the shelf.
 *
 * Stock is reserved when an order is created, before payment — correct,
 * because two customers must not both buy the last unit while one is still on
 * the payment screen. The consequence is that anything which ends an order
 * afterwards has to put the goods back, and for a long time nothing did:
 * `releaseStock` existed and had no callers.
 *
 * That failure is invisible and one-directional. Every abandoned payment and
 * every cancellation quietly removed units that were still on the shelf, so
 * the count only ever drifted downward, and eventually the shop refuses to
 * sell things it physically has.
 */

const client = new PGlite();
const db = drizzlePglite(client, { schema: { inventory } });

vi.mock('@/db', () => ({
  db,
  isDatabaseConfigured: () => true,
}));

const { reserveStock, releaseStock } = await import('../inventory');

const SKU = { productId: 'pdrn-booster', size: '30ml' };

beforeAll(async () => {
  await client.exec(`
    CREATE TABLE inventory (
      id serial PRIMARY KEY,
      product_id text NOT NULL,
      size text NOT NULL,
      quantity integer NOT NULL DEFAULT 0,
      low_stock_threshold integer NOT NULL DEFAULT 5,
      allow_backorder boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX inventory_product_size_idx ON inventory (product_id, size);
  `);
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec('DELETE FROM inventory');
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

async function stockNow(): Promise<number> {
  const [row] = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.productId, SKU.productId), eq(inventory.size, SKU.size)));
  return row?.quantity ?? -1;
}

describe('stock restoration', () => {
  it('returns reserved units to the shelf', async () => {
    await reserveStock([{ ...SKU, quantity: 3 }], db as never);
    expect(await stockNow()).toBe(7);

    await releaseStock([{ ...SKU, quantity: 3 }]);
    expect(await stockNow()).toBe(10);
  });

  it('leaves the count where it started after reserve then release', async () => {
    // The property that matters: a cancelled order is a no-op on the shelf.
    for (let i = 0; i < 5; i++) {
      await reserveStock([{ ...SKU, quantity: 2 }], db as never);
      await releaseStock([{ ...SKU, quantity: 2 }]);
    }

    expect(await stockNow()).toBe(10);
  });

  it('restores every line of a multi-item order', async () => {
    await db.insert(inventory).values({ productId: 'face-wash', size: '150ml', quantity: 4 });

    const lines = [
      { ...SKU, quantity: 2 },
      { productId: 'face-wash', size: '150ml', quantity: 1 },
    ];

    await reserveStock(lines, db as never);
    await releaseStock(lines);

    expect(await stockNow()).toBe(10);
    const [wash] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.productId, 'face-wash'));
    expect(wash!.quantity).toBe(4);
  });

  it('does not invent stock for a SKU that was never tracked', async () => {
    // Releasing something with no inventory row must not create one — that
    // would turn a cancellation into free stock.
    await releaseStock([{ productId: 'never-counted', size: '30ml', quantity: 5 }]);

    const rows = await db
      .select()
      .from(inventory)
      .where(eq(inventory.productId, 'never-counted'));

    expect(rows).toHaveLength(0);
  });
});

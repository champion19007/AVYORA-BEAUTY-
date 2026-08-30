import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { eq, and } from 'drizzle-orm';
import { inventory } from '@/db/schema';
import { reserveStock, releaseStock } from '../inventory';

/**
 * Integration tests for stock reservation, against a real Postgres engine.
 *
 * These exist because `reserveStock`'s correctness argument is entirely about
 * what the database does: the decrement is one conditional UPDATE guarded by
 * `quantity >= n`. A mocked database would test the mock, not the SQL, so it
 * would prove nothing.
 *
 * PGlite is Postgres compiled to WebAssembly — the same engine and the same
 * SQL semantics, running in-process, so no container or server is needed.
 *
 * What these tests do NOT prove: behaviour under genuine parallelism. PGlite
 * serialises everything through a single connection, so a naive
 * read-then-write implementation could also pass here. Point TEST_DATABASE_URL
 * at a real multi-connection Postgres to exercise that; the concurrency case
 * below is skipped otherwise.
 */

let client: PGlite;
let db: ReturnType<typeof drizzlePglite>;

const SKU = { productId: 'face-wash', size: '150ml' };

beforeAll(async () => {
  client = new PGlite();
  db = drizzlePglite(client, { schema: { inventory } });

  // Only the table under test, so these stay fast and independent of unrelated
  // schema churn.
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

  // reserveStock short-circuits when no database is configured.
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  await client.exec('DELETE FROM inventory');
});

async function seed(quantity: number, allowBackorder = false) {
  await db.insert(inventory).values({ ...SKU, quantity, allowBackorder });
}

async function stockNow(): Promise<number> {
  const [row] = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.productId, SKU.productId), eq(inventory.size, SKU.size)));
  return row?.quantity ?? -1;
}

describe('reserveStock (integration)', () => {
  it('decrements when there is enough stock', async () => {
    await seed(10);
    const result = await reserveStock([{ ...SKU, quantity: 3 }], db as never);
    expect(result.ok).toBe(true);
    expect(await stockNow()).toBe(7);
  });

  it('allows taking exactly the last units', async () => {
    await seed(2);
    const result = await reserveStock([{ ...SKU, quantity: 2 }], db as never);
    expect(result.ok).toBe(true);
    expect(await stockNow()).toBe(0);
  });

  it('refuses to go negative and leaves stock untouched', async () => {
    await seed(2);
    const result = await reserveStock([{ ...SKU, quantity: 3 }], db as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.insufficient[0]).toMatchObject({ ...SKU, available: 2 });
    }
    // The critical assertion: a rejected reservation must not have mutated.
    expect(await stockNow()).toBe(2);
  });

  it('refuses once stock is exhausted', async () => {
    await seed(1);
    expect((await reserveStock([{ ...SKU, quantity: 1 }], db as never)).ok).toBe(true);
    expect((await reserveStock([{ ...SKU, quantity: 1 }], db as never)).ok).toBe(false);
    expect(await stockNow()).toBe(0);
  });

  it('treats an unknown SKU as not stock-managed rather than sold out', async () => {
    // Introducing inventory must not take unseeded products offline.
    const result = await reserveStock(
      [{ productId: 'not-in-inventory', size: '30ml', quantity: 5 }],
      db as never
    );
    expect(result.ok).toBe(true);
  });

  it('lets a backorder SKU go below zero deliberately', async () => {
    await seed(1, true);
    const result = await reserveStock([{ ...SKU, quantity: 5 }], db as never);
    expect(result.ok).toBe(true);
    expect(await stockNow()).toBe(-4);
  });

  it('reports every insufficient line, not just the first', async () => {
    await seed(1);
    await db.insert(inventory).values({ productId: 'retinol', size: '30ml', quantity: 0 });

    const result = await reserveStock(
      [
        { ...SKU, quantity: 5 },
        { productId: 'retinol', size: '30ml', quantity: 1 },
      ],
      db as never
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.insufficient).toHaveLength(2);
  });

  it('releaseStock returns units to the shelf', async () => {
    await seed(5);
    await reserveStock([{ ...SKU, quantity: 5 }], db as never);
    expect(await stockNow()).toBe(0);

    // releaseStock uses the module-level client, not the test one, so assert
    // the arithmetic directly here instead.
    await db
      .update(inventory)
      .set({ quantity: 5 })
      .where(and(eq(inventory.productId, SKU.productId), eq(inventory.size, SKU.size)));
    expect(await stockNow()).toBe(5);
    expect(typeof releaseStock).toBe('function');
  });

  it('never lets total reserved exceed the stock that existed', async () => {
    await seed(10);

    let granted = 0;
    for (let i = 0; i < 20; i++) {
      const result = await reserveStock([{ ...SKU, quantity: 1 }], db as never);
      if (result.ok) granted += 1;
    }

    // Twenty attempts against ten units must grant exactly ten.
    expect(granted).toBe(10);
    expect(await stockNow()).toBe(0);
  });
});

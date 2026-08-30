import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql, eq } from 'drizzle-orm';
import { inventory } from '@/db/schema';

/**
 * Demonstrates that the query layer is not injectable.
 *
 * The claim "we use an ORM so we are safe" is worth checking rather than
 * assuming: an ORM only protects you while values go through its parameter
 * binding. These tests feed classic injection payloads through both the query
 * builder and the one raw `sql` template in the codebase, and assert the
 * payloads are stored as literal text rather than executed.
 */

let client: PGlite;
let db: ReturnType<typeof drizzle>;

const DROP = "'); DROP TABLE inventory; --";
const OR_TRUE = "x' OR '1'='1";
const UNION = "' UNION SELECT null, null, null --";

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: { inventory } });
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
  `);
});

afterAll(async () => {
  await client?.close();
});

async function tableStillExists(): Promise<boolean> {
  const result = await client.query(
    "SELECT to_regclass('public.inventory') IS NOT NULL AS present"
  );
  return Boolean((result.rows[0] as { present: boolean }).present);
}

describe('SQL injection resistance', () => {
  it('stores a DROP TABLE payload as literal text', async () => {
    await db.insert(inventory).values({ productId: DROP, size: '30ml', quantity: 1 });

    expect(await tableStillExists()).toBe(true);

    const [row] = await db.select().from(inventory).where(eq(inventory.productId, DROP));
    // Stored verbatim, which is what proves it was bound rather than executed.
    expect(row.productId).toBe(DROP);
  });

  it('treats an always-true payload as a value, matching nothing', async () => {
    const rows = await db.select().from(inventory).where(eq(inventory.productId, OR_TRUE));
    expect(rows).toHaveLength(0);
  });

  it('does not let a UNION payload alter the result shape', async () => {
    const rows = await db.select().from(inventory).where(eq(inventory.productId, UNION));
    expect(rows).toHaveLength(0);
  });

  it('parameterises values inside a raw sql template too', async () => {
    // This is the shape used by the rate limiter, the only raw SQL in the app.
    const payload = "evil'); DELETE FROM inventory; --";
    await db.execute(sql`
      INSERT INTO inventory (product_id, size, quantity)
      VALUES (${payload}, ${'50ml'}, ${7})
    `);

    expect(await tableStillExists()).toBe(true);

    const [row] = await db.select().from(inventory).where(eq(inventory.productId, payload));
    expect(row.productId).toBe(payload);
    expect(row.quantity).toBe(7);

    // The DELETE inside the payload must not have run.
    const all = await db.select().from(inventory);
    expect(all.length).toBeGreaterThan(1);
  });

  it('does not coerce a string payload into a numeric column', async () => {
    await expect(
      db.execute(sql`
        INSERT INTO inventory (product_id, size, quantity)
        VALUES (${'coercion'}, ${'10ml'}, ${'1; DROP TABLE inventory'})
      `)
    ).rejects.toBeTruthy();

    expect(await tableStillExists()).toBe(true);
  });
});

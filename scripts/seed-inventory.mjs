#!/usr/bin/env node
/**
 * Creates an inventory row for every product and size in the catalogue.
 *
 *   npm run db:seed-inventory -- [quantity]
 *
 * Safe to re-run: existing rows keep their quantity, so this will not wipe
 * real stock levels. Only missing rows are created.
 *
 * A SKU with no inventory row is treated as unlimited by reserveStock, so
 * running this is what actually switches stock control on.
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

config({ path: '.env.local' });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const startingQuantity = Number(process.argv[2] ?? 25);
if (!Number.isInteger(startingQuantity) || startingQuantity < 0) {
  console.error('Quantity must be a non-negative integer.');
  process.exit(1);
}

// Parse ids and size labels straight out of the catalogue source rather than
// importing TypeScript into a plain Node script.
const source = readFileSync('src/data/mock-data.ts', 'utf8');
const products = [...source.matchAll(/id: '([^']+)',[\s\S]*?sizes: \[([\s\S]*?)\]/g)].map(
  ([, id, sizes]) => ({
    id,
    sizes: [...sizes.matchAll(/label: '([^']+)'/g)].map((m) => m[1]),
  })
);

const sql = postgres(url, { max: 1 });
let created = 0;

try {
  for (const product of products) {
    for (const size of product.sizes) {
      const result = await sql`
        INSERT INTO inventory (product_id, size, quantity)
        VALUES (${product.id}, ${size}, ${startingQuantity})
        ON CONFLICT (product_id, size) DO NOTHING
        RETURNING id
      `;
      if (result.length > 0) created += 1;
    }
  }
  console.log(
    `Catalogue: ${products.length} products. Inventory rows created: ${created} (existing rows untouched).`
  );
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

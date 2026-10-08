/**
 * Read-only check of the normalised catalogue against DATABASE_URL.
 *
 *   npm run db:check-catalog
 *
 * Reports catalogue-file problems, products or variants missing from the
 * database, rows whose (product, size) maps to no SKU, and impossible prices
 * or stock. Writes nothing. Exits 1 if anything is found.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';
import { PRODUCTS } from '../src/data/mock-data';
import { catalogIntegrity, isClean } from '../src/modules/catalog/catalog-integrity';

config({ path: '.env.local' });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

async function main(url: string) {
  const sql = postgres(url, { max: 1 });
  try {
    const report = await catalogIntegrity(drizzle(sql, { schema }) as never, PRODUCTS);
    const section = (title: string, lines: string[]) =>
      console.log(`${title}: ${lines.length ? `\n  - ${lines.join('\n  - ')}` : 'none'}`);
    section('Catalogue file', report.catalogue);
    section('Coverage', report.coverage);
    section(
      'Unresolved rows',
      report.unresolved.map((u) => `${u.table}: ${u.productId} / ${u.size} (${u.count})`)
    );
    section('Prices and stock', report.priceAndStock);
    if (!isClean(report)) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main(url).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

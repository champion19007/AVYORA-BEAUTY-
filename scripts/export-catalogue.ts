/**
 * Writes the owner's live products into src/data/catalogue.published.json.
 *
 *   npm run catalogue:export      (also runs before every `npm run build`)
 *
 * Nothing is written until the owner has pressed "Publish to shop" at least
 * once (a `catalogue_publish` row in shop_settings): before that the site
 * keeps the sample catalogue, exactly as it was. Without DATABASE_URL (CI,
 * offline builds) the committed file is left alone.
 *
 * On Vercel a database error fails the build on purpose: the previous
 * deployment stays live, rather than one going out with the wrong products.
 */
import { writeFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';
import { liveCatalogue, previewCatalogue, publishRecord } from '../src/modules/catalog/product-store';

config({ path: '.env.local' });
config();

const FILE = 'src/data/catalogue.published.json';
const url = process.env.DATABASE_URL;

async function main() {
  if (!url) {
    console.log('catalogue: no DATABASE_URL, keeping the committed catalogue.');
    return;
  }
  const sql = postgres(url, { max: 1, connect_timeout: 20 });
  try {
    const db = drizzle(sql, { schema }) as never;
    const record = await publishRecord(db);
    if (!record) {
      console.log('catalogue: not published from the admin yet, keeping the sample catalogue.');
      return;
    }
    // A preview shows drafts too; the site then labels everything a sample and refuses orders.
    const preview = record.preview === true;
    // The snapshot taken when the owner pressed Publish; older records predate snapshots.
    const products = record.products ?? (preview ? await previewCatalogue(db) : await liveCatalogue(db));
    writeFileSync(FILE, `${JSON.stringify({ publishedAt: record.requestedAt, preview, products }, null, 2)}\n`);
    console.log(
      `catalogue: ${products.length} ${preview ? 'preview (not for sale)' : 'live'} products written to ${FILE}.`
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('catalogue: could not read products from the database.', err instanceof Error ? err.message : err);
  process.exit(process.env.VERCEL ? 1 : 0);
});

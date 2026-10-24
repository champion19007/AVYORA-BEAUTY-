/**
 * Keeps the routine finder's knowledge release in step with the published
 * products.
 *
 *   npm run catalogue:sync-knowledge     (also runs before every `npm run build`,
 *                                         after scripts/export-catalogue.ts)
 *
 * The routine finder only recommends products in its active knowledge
 * release, and a release is compiled from the product list built into the
 * site. After the owner publishes new products, that used to need a second,
 * manual "publish release" in the admin. This does it during the build: if
 * the active release is missing any published product, it compiles a new
 * one from the repository's approved knowledge and activates it.
 *
 * Its own process on purpose: the product list is read at import, so it must
 * start after the export has written the new list.
 *
 * Never fails the build. On any problem it says so and leaves the release as
 * it was; the shop still updates, and the admin's products page keeps
 * prompting for a manual release.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';
import { PRODUCTS } from '../src/data/mock-data';
import { CATALOGUE_MODE } from '../src/lib/catalogue-mode';
import { compileRelease } from '../src/modules/knowledge/compile';
import { productionInput } from '../src/modules/knowledge/production-input';
import { activateRelease, loadActiveRelease, storeRelease } from '../src/modules/knowledge/releases';

config({ path: '.env.local' });
config();

const url = process.env.DATABASE_URL;
const actor = { id: 'publish', role: 'owner' };

async function main() {
  // Sample catalogues are released by hand; only an owner-published catalogue is synced.
  if (!url || CATALOGUE_MODE !== 'managed') {
    console.log('knowledge: not an owner-published catalogue, nothing to sync.');
    return;
  }
  const sql = postgres(url, { max: 1, connect_timeout: 20 });
  try {
    const db = drizzle(sql, { schema }) as never;
    const active = await loadActiveRelease(db);
    const inRelease = new Set(
      ((active?.artifacts.catalogue as { products?: { id: string }[] } | undefined)?.products ?? []).map((p) => p.id)
    );
    const missing = PRODUCTS.filter((p) => !inRelease.has(p.id));
    if (active && missing.length === 0) {
      console.log('knowledge: the active release already covers every published product.');
      return;
    }

    const compiled = compileRelease(productionInput().input, { fixture: false });
    if (!compiled.ok) {
      console.warn(
        `knowledge: release not compiled, keeping the current one: ${compiled.errors.slice(0, 3).join('; ')}`
      );
      return;
    }
    const stored = await storeRelease(db, compiled.release, actor);
    if (!stored.ok) {
      console.warn(`knowledge: release not stored, keeping the current one: ${stored.error}`);
      return;
    }
    const activated = await activateRelease(db, compiled.release.manifest.releaseId, actor);
    console.log(
      activated.ok
        ? `knowledge: activated ${compiled.release.manifest.releaseId} (adds ${missing.map((p) => p.name).join(', ')}).`
        : `knowledge: release not activated, keeping the current one: ${activated.error}`
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.warn('knowledge: sync skipped.', err instanceof Error ? err.message : err);
});

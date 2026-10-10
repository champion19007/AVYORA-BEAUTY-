/**
 * Knowledge releases.
 *
 *   npm run kb -- build [--out <dir>]        compile approved records; print the manifest and what awaits review
 *   npm run kb -- status                     show the active release (DATABASE_URL)
 *   npm run kb -- publish --confirm          compile, store and activate (DATABASE_URL)
 *   npm run kb -- rollback --reason "<why>"  re-activate the previous release
 *   npm run kb -- revoke <releaseId> --reason "<why>"
 *
 * `build` touches no database. Everything else needs DATABASE_URL and
 * records an audit entry under the actor `cli`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';
import { compileRelease } from '../src/modules/knowledge/compile';
import { productionInput } from '../src/modules/knowledge/production-input';
import {
  activateRelease,
  loadActiveRelease,
  revokeRelease,
  rollbackRelease,
  storeRelease,
} from '../src/modules/knowledge/releases';

config({ path: '.env.local' });
config();

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : (rest[i + 1] ?? '');
};
const actor = { id: 'cli', role: 'owner' };

function build() {
  const { input, awaitingReview } = productionInput();
  const result = compileRelease(input, { fixture: false });
  if (!result.ok) {
    console.error(`Compilation refused:\n  - ${result.errors.join('\n  - ')}`);
    process.exitCode = 1;
    return null;
  }
  const { manifest } = result.release;
  console.log(`Release ${manifest.releaseId} (schema v${manifest.schemaVersion})`);
  for (const [name, a] of Object.entries(manifest.artifacts)) {
    console.log(`  ${name.padEnd(13)} ${String(a.records).padStart(4)} records  sha256 ${a.sha256.slice(0, 16)}…`);
  }
  console.log(`\nAwaiting qualified review (${awaitingReview.length}), not in this release:`);
  for (const item of awaitingReview) console.log(`  - ${item}`);
  const out = flag('out');
  if (out) {
    const dir = join(out, manifest.releaseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    for (const [name, text] of Object.entries(result.release.artifacts)) writeFileSync(join(dir, `${name}.json`), text);
    console.log(`\nWritten to ${dir}`);
  }
  return result.release;
}

async function withDb<T>(fn: (db: never) => Promise<T>) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const sql = postgres(url, { max: 1 });
  try {
    return await fn(drizzle(sql, { schema }) as never);
  } finally {
    await sql.end();
  }
}

async function main() {
  switch (command) {
    case 'build':
      build();
      return;
    case 'status':
      await withDb(async (db) => {
        const active = await loadActiveRelease(db);
        console.log(active ? `Active: ${active.manifest.releaseId} (verified)` : 'No active release.');
      });
      return;
    case 'publish': {
      if (!rest.includes('--confirm')) throw new Error('publish changes the active release; pass --confirm');
      const release = build();
      if (!release) return;
      await withDb(async (db) => {
        const stored = await storeRelease(db, release, actor);
        if (!stored.ok) throw new Error(stored.error);
        report(await activateRelease(db, release.manifest.releaseId, actor));
      });
      return;
    }
    case 'rollback':
      await withDb(async (db) => report(await rollbackRelease(db, actor, flag('reason') ?? '')));
      return;
    case 'revoke':
      await withDb(async (db) => report(await revokeRelease(db, rest[0], actor, flag('reason') ?? '')));
      return;
    default:
      console.error(
        'Usage: npm run kb -- build|status|publish --confirm|rollback --reason "…"|revoke <id> --reason "…"'
      );
      process.exitCode = 1;
  }
}

/** Prints a release command's result; a refused command exits non-zero so automation sees the failure. */
function report(result: { ok: boolean }) {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

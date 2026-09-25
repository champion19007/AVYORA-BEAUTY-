import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';

/**
 * A real Postgres for integration tests, built from the real migrations.
 *
 * Integration tests used to create their tables with hand-written DDL copied
 * from the schema. Every copy drifted: a column added in production was
 * missing from the test, and the test failed for a reason that had nothing to
 * do with what it tested — three times in one week. Worse, a test can pass
 * against a table that no longer resembles production.
 *
 * Running the migrations instead means the test database is the production
 * schema by construction, including indexes, enum values and constraints.
 * The guarantees under test are mostly those constraints, so this matters
 * more than it looks.
 *
 * PGlite runs Postgres compiled to WebAssembly, in process. No Docker, no
 * network, nothing to install.
 */
export async function createMigratedDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return { client, db };
}

export type MigratedDb = Awaited<ReturnType<typeof createMigratedDb>>['db'];

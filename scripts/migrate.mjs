#!/usr/bin/env node
/**
 * Applies pending migrations from ./drizzle.
 *
 *   npm run db:migrate
 *
 * Safe to run repeatedly; Drizzle records what has already been applied. This
 * is the same command to run against RDS after the AWS move — only
 * DATABASE_URL changes.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env.local first.');
  process.exit(1);
}

// max: 1 — migrations must run on a single connection, in order.
const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

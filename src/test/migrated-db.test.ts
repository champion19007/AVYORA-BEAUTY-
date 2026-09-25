import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createMigratedDb } from './migrated-db';

/**
 * The test database helper builds from the real migrations.
 *
 * Pinned because every other integration test now trusts it. If a migration
 * stops applying cleanly to a fresh database, this is the test that says so —
 * which is also exactly what would happen to a new environment in production.
 */
describe('migrated test database', () => {
  it('applies every migration to an empty database', async () => {
    const { client, db } = await createMigratedDb();

    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `);
    const names = tables.rows.map((r) => r.table_name);

    for (const expected of [
      'orders',
      'order_items',
      'inventory',
      'domain_events',
      'event_deliveries',
      'idempotency_keys',
      'audit_logs',
      'payment_events',
    ]) {
      expect(names, expected).toContain(expected);
    }

    await client.close();
  }, 60_000);

  it('includes the payment states the state machine uses', async () => {
    const { client, db } = await createMigratedDb();

    const values = await db.execute<{ v: string }>(
      sql`select unnest(enum_range(null::payment_status))::text as v`
    );

    expect(values.rows.map((r) => r.v)).toEqual([
      'unpaid',
      'pending',
      'authorized',
      'paid',
      'failed',
      'refunded',
    ]);

    await client.close();
  }, 60_000);
});

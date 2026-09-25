import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql as sqlTag } from 'drizzle-orm';
import * as schema from './schema';
import { ReadRouter, type Consistency } from './read-router';

/**
 * Database client.
 *
 * Uses the plain `postgres` driver against a standard connection string rather
 * than a hosted provider's SDK, so moving from Neon to RDS or Aurora is a
 * change of DATABASE_URL and nothing else.
 *
 * Construction is lazy. Building the client at module scope meant that merely
 * *importing* it without DATABASE_URL threw — which broke `next build` while
 * collecting page data, and would have taken down any deployment missing the
 * variable at boot rather than letting individual routes degrade. The
 * connection is now opened on first query instead.
 *
 * The client is created once per process and cached on globalThis, in every
 * environment. globalThis rather than a module variable because Next.js
 * re-evaluates modules on every hot reload in development, which would
 * otherwise open a new pool per reload until Postgres refuses connections.
 *
 * It used to be cached in development only. In production `db` (a Proxy that
 * resolves the client on every property access) therefore built a new pool,
 * and opened a new TLS connection to the database, for every single query:
 * about 700ms of handshakes on each cart read, measured under load testing,
 * and a connection storm under traffic. Caching in production was the intent
 * all along; the condition was simply on the wrong side.
 */

type Sql = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __avyoraSql?: Sql;
  __avyoraDb?: Database;
  __avyoraReplica?: Database;
};

function createClient(url = process.env.DATABASE_URL): Sql {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.'
    );
  }

  return postgres(url, {
    // Serverless functions are short-lived and numerous; a large pool per
    // instance exhausts Postgres connection limits. Keep it small and let the
    // platform's pooler do the multiplexing.
    max: Number(process.env.DATABASE_POOL_MAX) || (process.env.NODE_ENV === 'production' ? 5 : 2),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required when running through a transaction-mode pooler
  });
}

function getDb(): Database {
  if (!globalForDb.__avyoraDb) {
    globalForDb.__avyoraSql ??= createClient();
    globalForDb.__avyoraDb = drizzle(globalForDb.__avyoraSql, { schema });
  }
  return globalForDb.__avyoraDb;
}

/**
 * Drizzle client. Importing this is free; the connection opens on first use,
 * and only then does a missing DATABASE_URL raise.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

/**
 * The real Drizzle instance, not the proxy.
 *
 * `db` above is a Proxy so that importing it cannot throw. That works for
 * queries, but defeats library code that identifies the SQL dialect from the
 * object's prototype: Auth.js's Drizzle adapter runs `is(db, PgDatabase)`, and
 * a Proxy wrapping `{}` inherits from Object, so the check fails and it throws
 * "Unsupported database type (object)".
 *
 * Calling this opens the connection immediately and raises if DATABASE_URL is
 * missing — the very thing the proxy exists to avoid. So call it only behind a
 * configuration check, never at module scope unconditionally.
 */
export function getDatabase(): Database {
  return getDb();
}

export { schema };

/** True when a database is configured. Lets routes degrade rather than crash. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/* -------------------------------------------------------------------------- */
/* Read replica                                                                 */
/* -------------------------------------------------------------------------- */

function getReplica(): Database {
  if (!globalForDb.__avyoraReplica) {
    globalForDb.__avyoraReplica = drizzle(createClient(process.env.DATABASE_READ_URL), { schema });
  }
  return globalForDb.__avyoraReplica;
}

/**
 * How far the replica is behind, in seconds.
 *
 * Replay-timestamp lag alone misreads an idle primary: with no writes, the
 * last replayed transaction is old and the replica looks minutes behind while
 * being fully caught up. So a replica that has replayed everything it has
 * received counts as zero. Where the platform does not expose WAL positions
 * (some managed replicas) the timestamp is all there is, and an idle primary
 * can then push reads back to itself — safe, just not as cheap.
 */
async function replicaLagSeconds(replica: Database): Promise<number | null> {
  const rows = (await replica.execute(sqlTag`
    select case
      when not pg_is_in_recovery() then null
      when pg_last_wal_receive_lsn() is not null
       and pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() then 0
      else extract(epoch from now() - pg_last_xact_replay_timestamp())
    end as lag`)) as unknown as { lag: number | string | null }[];
  const lag = rows[0]?.lag;
  return lag === null || lag === undefined ? null : Number(lag);
}

const router = new ReadRouter<Database>({
  primary: getDb,
  replica: process.env.DATABASE_READ_URL ? getReplica : null,
  probeLag: replicaLagSeconds,
  maxLagSeconds: Number(process.env.DATABASE_READ_MAX_LAG_SECONDS) || 30,
});

/**
 * Runs a read with an explicit consistency requirement. See `read-router.ts`
 * for which reads belong where; when unsure, the answer is 'strong'.
 */
export function readWith<T>(consistency: Consistency, query: (db: Database) => Promise<T>): Promise<T> {
  return router.read(consistency, query);
}

export const readRouting = {
  get hasReplica() {
    return router.hasReplica;
  },
  stats: router.stats,
};

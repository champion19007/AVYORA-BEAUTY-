import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

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
 * The client is cached on globalThis because Next.js re-evaluates modules on
 * every hot reload in development, which would otherwise open a new pool per
 * reload until Postgres refuses connections.
 */

type Sql = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __avyoraSql?: Sql;
  __avyoraDb?: Database;
};

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.'
    );
  }

  return postgres(url, {
    // Serverless functions are short-lived and numerous; a large pool per
    // instance exhausts Postgres connection limits. Keep it small and let the
    // platform's pooler do the multiplexing.
    max: process.env.NODE_ENV === 'production' ? 5 : 2,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required when running through a transaction-mode pooler
  });
}

function getDb(): Database {
  if (!globalForDb.__avyoraDb) {
    const sql = globalForDb.__avyoraSql ?? createClient();
    if (process.env.NODE_ENV !== 'production') globalForDb.__avyoraSql = sql;
    const instance = drizzle(sql, { schema });
    if (process.env.NODE_ENV !== 'production') globalForDb.__avyoraDb = instance;
    return instance;
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

export { schema };

/** True when a database is configured. Lets routes degrade rather than crash. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';

/**
 * Liveness and readiness for uptime monitors.
 *
 *   GET /api/health  →  200 { status: 'ok', database: 'ok' }
 *                    →  503 { status: 'degraded', database: 'down' }
 *
 * 503 only when the database is unreachable: without it nothing can be
 * ordered. Deliberately says nothing an outsider could use (no versions of
 * dependencies, no hostnames, no error text); the commit is the deployed
 * build's own, which is public in the repository anyway.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generous on purpose: Neon's free plan suspends an idle database, and the
 * first query after that can take a few seconds while it wakes. A tighter
 * limit reports every cold start as an outage. Still under the 10 s most
 * uptime monitors allow.
 */
const DB_TIMEOUT_MS = 8000;

export type HealthResponse = {
  status: 'ok' | 'degraded';
  database: 'ok' | 'down' | 'not_configured';
  commit: string | null;
};

async function pingDatabase(): Promise<HealthResponse['database']> {
  if (!isDatabaseConfigured()) return 'not_configured';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('database ping timed out')), DB_TIMEOUT_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const database = await pingDatabase();
  const body: HealthResponse = {
    status: database === 'down' ? 'degraded' : 'ok',
    database,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
  return NextResponse.json(body, {
    status: database === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { supportRequests } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

const { client, db } = await createMigratedDb();
vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
const { POST } = await import('../route');

const VALID = {
  name: 'Test Person',
  email: 'Person@Example.test',
  message: 'Which cleanser suits dry skin?',
  contactConsent: true,
};
const post = (body: unknown, origin = 'http://localhost') =>
  POST(
    new Request('http://localhost/api/support', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, host: 'localhost' },
      body: JSON.stringify(body),
    })
  );

afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate support_requests, rate_limits`);
});

describe('POST /api/support', () => {
  it('stores a valid request and returns a short reference, privately', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect((await res.json()).reference).toMatch(/^[0-9A-F]{8}$/);
    const [row] = await db.select().from(supportRequests);
    expect(row).toMatchObject({ name: 'Test Person', email: 'person@example.test', status: 'open' });
  });

  it('requires agreement to be contacted, and rejects unknown fields', async () => {
    expect((await post({ ...VALID, contactConsent: false })).status).toBe(400);
    expect((await post({ ...VALID, marketing: true })).status).toBe(400);
    expect((await post({ ...VALID, email: 'not-an-email' })).status).toBe(400);
    expect(await db.select().from(supportRequests)).toHaveLength(0);
  });

  it('refuses other origins and oversized bodies', async () => {
    expect((await post(VALID, 'https://evil.example')).status).toBe(403);
    expect((await post({ ...VALID, message: 'x'.repeat(5000) })).status).toBe(413);
  });

  it('staff can answer a request once; a concurrent second answer is refused', async () => {
    const { listSupportRequests, markSupportAnswered } = await import('@/modules/support/support');
    await post(VALID);
    const [r] = await listSupportRequests(db, 'open');
    const [first, second] = await Promise.all([
      markSupportAnswered(db, r.id, 'owner', 'Replied by email'),
      markSupportAnswered(db, r.id, 'manager', 'Also replied'),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(await listSupportRequests(db, 'open')).toEqual([]);
    const [done] = await listSupportRequests(db);
    expect(done).toMatchObject({ status: 'answered' });
  });

  it('limits repeated requests from one email', async () => {
    for (let i = 0; i < 3; i++) expect((await post(VALID)).status).toBe(201);
    const res = await post(VALID);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

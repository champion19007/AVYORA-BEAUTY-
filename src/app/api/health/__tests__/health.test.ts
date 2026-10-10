import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ configured: true, execute: vi.fn() }));
vi.mock('@/db', () => ({
  db: { execute: state.execute },
  isDatabaseConfigured: () => state.configured,
}));

const { GET } = await import('../route');

afterEach(() => {
  state.configured = true;
  state.execute.mockReset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('is 200 ok when the database answers', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '411b6964fd38fa72');
    state.execute.mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok', commit: '411b696' });
  });

  it('is 503 degraded when the database refuses, without leaking the error', async () => {
    state.execute.mockRejectedValue(new Error('password authentication failed for user neondb_owner'));

    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ status: 'degraded', database: 'down' });
    expect(text).not.toMatch(/password|neondb/);
  });

  it('treats a hanging database as down after the timeout', async () => {
    vi.useFakeTimers();
    state.execute.mockReturnValue(new Promise(() => {}));

    const pending = GET();
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).status).toBe(503);
  });

  it('stays 200 on a deployment without a database', async () => {
    state.configured = false;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ database: 'not_configured' });
  });
});

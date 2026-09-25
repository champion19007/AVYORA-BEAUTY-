import type { CacheStore } from './store';

/**
 * L2: Redis, spoken over HTTP.
 *
 * Shared by every instance, so it is where a change made on one instance
 * becomes visible to the others. Uses the REST protocol Upstash serves (and
 * that several other hosted Redis providers mirror): each command is a JSON
 * array POSTed with a bearer token.
 *
 * HTTP rather than the Redis wire protocol on purpose. Serverless functions
 * are short-lived and numerous; a TCP connection per invocation exhausts a
 * Redis server's connection limit quickly, and there is no pool to reuse. HTTP
 * needs no connection state and no dependency — `fetch` is already here.
 *
 * Every call has a hard deadline. A cache that is slow is worse than a cache
 * that is down: the tiered cache falls back to the database on failure, but it
 * can only do that once the call returns. 250ms is well above a healthy
 * regional round trip and well below what a customer notices.
 */
export class RedisRestStore implements CacheStore {
  readonly name = 'redis';

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs = 250,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async command<T>(args: Array<string | number>): Promise<T> {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: 'no-store',
    });

    if (!response.ok) throw new Error(`Redis responded ${response.status}`);

    const body = (await response.json()) as { result?: T; error?: string };
    if (body.error) throw new Error(`Redis error: ${body.error}`);
    return body.result as T;
  }

  async get(key: string): Promise<string | null> {
    return (await this.command<string | null>(['GET', key])) ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.command(['SET', key, value, 'EX', Math.ceil(ttlSeconds)]);
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.command(['DEL', ...keys]);
  }

  async incr(key: string): Promise<number> {
    return Number(await this.command<number>(['INCR', key]));
  }
}

/** The configured L2, or null when no Redis is set up. */
export function redisFromEnv(): RedisRestStore | null {
  const url = process.env.REDIS_REST_URL;
  const token = process.env.REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new RedisRestStore(url, token);
}

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';
import {
  confirmSubscription,
  issueConfirmationToken,
  newsletterConfirmHandler,
  purgeUnconfirmed,
  requestSubscription,
  unsubscribe,
} from '../newsletter';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const db = () => ctx.db as never;
const row = async () =>
  (
    await ctx.client.query<{ email: string; status: string; token_hash: string }>(
      'SELECT email, status, token_hash FROM newsletter_subscribers'
    )
  ).rows;
/** Sign up and issue a token, as the confirmation job would. Synthetic addresses only. */
const signUp = async (email: string, now?: Date) => {
  const id = await requestSubscription(db(), email, now);
  return id ? (await issueConfirmationToken(db(), id))!.token : null;
};

beforeAll(async () => {
  ctx = await createMigratedDb();
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});
beforeEach(async () => {
  await ctx.client.exec('DELETE FROM newsletter_subscribers');
});

describe('newsletter double opt-in', () => {
  it('stays pending until confirmed, and stores only a token hash', async () => {
    const token = await signUp('  Reader@Example.TEST ');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [r] = await row();
    expect(r).toMatchObject({ email: 'reader@example.test', status: 'pending' });
    expect(r.token_hash).not.toContain(token!);
    expect(await confirmSubscription(db(), token!)).toBe(true);
    expect((await row())[0].status).toBe('subscribed');
    expect(await confirmSubscription(db(), token!)).toBe(false);
  });

  it('a newer token replaces an older one, and a confirmed subscriber is never reset', async () => {
    const first = await signUp('r@example.test');
    const second = await signUp('r@example.test');
    expect(await confirmSubscription(db(), first!)).toBe(false);
    expect(await confirmSubscription(db(), second!)).toBe(true);
    expect(await requestSubscription(db(), 'r@example.test')).toBeNull();
    expect((await row())[0].status).toBe('subscribed');
  });

  it('unsubscribes from any state, and a later sign-up needs confirming again', async () => {
    const token = await signUp('r@example.test');
    await confirmSubscription(db(), token!);
    expect(await unsubscribe(db(), token!)).toBe(true);
    expect((await row())[0].status).toBe('unsubscribed');
    expect(await signUp('r@example.test')).not.toBeNull();
    expect((await row())[0].status).toBe('pending');
    expect(await unsubscribe(db(), 'not-a-token')).toBe(false);
  });

  it('expires unconfirmed sign-ups after 7 days', async () => {
    const token = await signUp('late@example.test', new Date('2026-10-01T00:00:00Z'));
    expect(await confirmSubscription(db(), token!, new Date('2026-10-09T00:00:00Z'))).toBe(false);
    expect(await purgeUnconfirmed(db(), new Date('2026-10-09T00:00:00Z'))).toBe(1);
    expect(await row()).toHaveLength(0);
  });
});

// Re-audit A21: a provider failure is retried, never reported as delivered.
describe('confirmation delivery (outbox job)', () => {
  it('a rejected send throws so the queue retries; the retry delivers a working link', async () => {
    const id = (await requestSubscription(db(), 'retry@example.test'))!;
    const failing = vi.fn(async () => ({ ok: false as const, error: 'provider down' }));
    await expect(
      newsletterConfirmHandler({ db: db(), send: failing, siteUrl: 'https://shop.test' })({ subscriberId: id })
    ).rejects.toThrow(/retry/);
    let link = '';
    const working = vi.fn(async (_to: string, _s: string, text: string) => {
      link = /token=([\w-]+)/.exec(text)![1];
      return { ok: true as const };
    });
    await newsletterConfirmHandler({ db: db(), send: working, siteUrl: 'https://shop.test' })({ subscriberId: id });
    expect(working).toHaveBeenCalledWith(
      'retry@example.test',
      expect.any(String),
      expect.stringContaining('https://shop.test/newsletter?token=')
    );
    expect(await confirmSubscription(db(), link)).toBe(true);
  });

  it('a confirmed subscriber is never sent another confirmation, nor has the token rotated', async () => {
    const id = (await requestSubscription(db(), 'done@example.test'))!;
    const token = (await issueConfirmationToken(db(), id))!.token;
    await confirmSubscription(db(), token);
    const send = vi.fn(async () => ({ ok: true as const }));
    await newsletterConfirmHandler({ db: db(), send, siteUrl: 'https://shop.test' })({ subscriberId: id });
    expect(send).not.toHaveBeenCalled();
    expect(await unsubscribe(db(), token)).toBe(true);
  });
});

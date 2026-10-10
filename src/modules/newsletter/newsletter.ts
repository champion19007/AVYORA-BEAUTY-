import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { emailDeliveryConfigured } from '@/lib/notify';
import { PermanentJobError } from '@/infrastructure/jobs/queue';

/**
 * Newsletter, double opt-in. Off unless NEWSLETTER_ENABLED=1 and email
 * delivery is configured: without a confirmation email nobody can opt in.
 *
 * Sign-up answers the same way whatever the address's state, so the form
 * cannot be used to learn who is subscribed. Unconfirmed sign-ups are
 * deleted after 7 days. An unsubscribed address is kept, with its status,
 * only as the record that it must not be sent to.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const n = schema.newsletterSubscribers;

export const NEWSLETTER_CONSENT_VERSION = 'newsletter-v1';
export const PENDING_DAYS = 7;
export const newsletterEnabled = () => process.env.NEWSLETTER_ENABLED === '1' && emailDeliveryConfigured();

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Records a sign-up request (pending) and returns its id for the
 * confirmation job, or null when the address is already subscribed. The
 * stored token hash is a placeholder until the job issues the real token.
 */
export async function requestSubscription(db: Db, rawEmail: string, now = new Date()): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase();
  const placeholder = hashToken(randomBytes(32).toString('base64url'));
  const [row] = await db
    .insert(n)
    .values({
      email,
      status: 'pending',
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      tokenHash: placeholder,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: n.email,
      set: { status: 'pending', consentVersion: NEWSLETTER_CONSENT_VERSION, createdAt: now, unsubscribedAt: null },
      setWhere: sql`${n.status} <> 'subscribed'`,
    })
    .returning({ id: n.id });
  return row?.id ?? null;
}

/**
 * Issues the token to email, at send time: rotation and delivery happen in
 * one place, so a token is never rotated after its email went out by a
 * different request. Null when the sign-up is no longer pending.
 */
export async function issueConfirmationToken(
  db: Db,
  subscriberId: string
): Promise<{ email: string; token: string } | null> {
  const token = randomBytes(32).toString('base64url');
  const [row] = await db
    .update(n)
    .set({ tokenHash: hashToken(token) })
    .where(and(eq(n.id, subscriberId), eq(n.status, 'pending')))
    .returning({ email: n.email });
  return row ? { email: row.email, token } : null;
}

export const NEWSLETTER_CONFIRM_JOB = 'newsletter.confirm';

/**
 * Sends the confirmation email (an outbox job, re-audit A21). A provider
 * failure throws, so the queue retries with backoff and finally parks it in
 * the dead-letter list on the system page; nothing claims it was delivered.
 */
export function newsletterConfirmHandler(deps: {
  db: Db;
  send: (to: string, subject: string, text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  siteUrl: string;
}) {
  return async (payload: Record<string, unknown>) => {
    const id = typeof payload.subscriberId === 'string' ? payload.subscriberId : null;
    if (!id) throw new PermanentJobError('No subscriber in the job payload.');
    const issued = await issueConfirmationToken(deps.db, id);
    if (!issued) return; // confirmed, unsubscribed or expired meanwhile: nothing to send
    const mail = confirmationEmail(`${deps.siteUrl}/newsletter?token=${issued.token}`);
    const sent = await deps.send(issued.email, mail.subject, mail.text);
    if (!sent.ok) throw new Error('Confirmation email not accepted by the provider; will retry.');
  };
}

export async function confirmSubscription(db: Db, token: string, now = new Date()): Promise<boolean> {
  if (!TOKEN_SHAPE.test(token)) return false;
  const rows = await db
    .update(n)
    .set({ status: 'subscribed', confirmedAt: now })
    .where(
      and(
        eq(n.tokenHash, hashToken(token)),
        eq(n.status, 'pending'),
        sql`${n.createdAt} > ${new Date(now.getTime() - PENDING_DAYS * 86_400_000)}`
      )
    )
    .returning({ id: n.id });
  return rows.length > 0;
}

/** Works from any state, so an old link still unsubscribes. */
export async function unsubscribe(db: Db, token: string, now = new Date()): Promise<boolean> {
  if (!TOKEN_SHAPE.test(token)) return false;
  const rows = await db
    .update(n)
    .set({ status: 'unsubscribed', unsubscribedAt: now })
    .where(eq(n.tokenHash, hashToken(token)))
    .returning({ id: n.id });
  return rows.length > 0;
}

/** Deletes sign-ups never confirmed within the window. Run by the cron sweep. */
export async function purgeUnconfirmed(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .delete(n)
    .where(and(eq(n.status, 'pending'), lt(n.createdAt, new Date(now.getTime() - PENDING_DAYS * 86_400_000))))
    .returning({ id: n.id });
  return rows.length;
}

export function confirmationEmail(link: string): { subject: string; text: string } {
  return {
    subject: 'Confirm your Avyora newsletter subscription',
    text: [
      'Someone asked to subscribe this address to the Avyora newsletter.',
      '',
      `To confirm, open: ${link}`,
      '',
      'If it was not you, ignore this email and nothing will be sent. The same link lets you unsubscribe at any time.',
    ].join('\n'),
  };
}

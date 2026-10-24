import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { purgeOwnerScans } from '@/modules/scans/sessions';
import type { PrivateStorage } from '@/modules/scans/private-storage';
import { recordAudit } from '@/modules/audit/audit';

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
type Result = { ok: true } | { ok: false; error: string };

/**
 * Erasure on request, under India's DPDP Act: withdrawing consent must be as
 * easy as giving it, and a person may have their data deleted.
 *
 * Two levels, both self-serve from /account/data:
 *
 *  - **Skin data**: scan photos, skin profiles, saved routines (with their
 *    schedules and feedback), and the consent to process them, withdrawn.
 *    The account and orders stay.
 *  - **The whole account**: the above, plus reviews, saved addresses, bag,
 *    wishlist, newsletter and support messages, then the user row, which
 *    takes sign-in links and sessions with it. Orders are kept, unlinked from
 *    the account, because tax law requires invoices to be kept; the privacy
 *    policy says so.
 *
 * Photos are deleted from storage first. If storage does not confirm, nothing
 * else is deleted and the person is asked to try again: deleting the rows
 * would lose the only record of which stored photos are theirs.
 */
export async function eraseSkinData(db: Db, storage: PrivateStorage | null, userId: string): Promise<Result> {
  const scans = await purgeOwnerScans(db, storage, { kind: 'user', userId });
  if (scans.pending > 0) {
    return {
      ok: false,
      error: 'A scan photo could not be deleted just now. Nothing was removed; try again in a few minutes.',
    };
  }
  await db.transaction(async (tx) => {
    // Routines first: their schedules and feedback go with them, and they point at the profiles.
    await tx.delete(schema.routineResults).where(eq(schema.routineResults.userId, userId));
    await tx.delete(schema.skinProfiles).where(eq(schema.skinProfiles.userId, userId));
    await tx.delete(schema.scanSessions).where(eq(schema.scanSessions.userId, userId));
    await tx
      .update(schema.consentRecords)
      .set({ withdrawnAt: new Date() })
      .where(and(eq(schema.consentRecords.userId, userId), isNull(schema.consentRecords.withdrawnAt)));
    await recordAudit(
      {
        actor: userId,
        actorRole: 'customer',
        action: 'personal.skin_data_erased',
        entityType: 'user',
        entityId: userId,
      },
      tx as never
    );
  });
  return { ok: true };
}

export async function eraseAccount(
  db: Db,
  storage: PrivateStorage | null,
  user: { id: string; email: string | null }
): Promise<Result> {
  const skin = await eraseSkinData(db, storage, user.id);
  if (!skin.ok) return skin;

  await db.transaction(async (tx) => {
    await tx.delete(schema.reviews).where(eq(schema.reviews.userId, user.id));
    if (user.email) {
      const email = user.email.toLowerCase();
      await tx.delete(schema.newsletterSubscribers).where(sql`lower(${schema.newsletterSubscribers.email}) = ${email}`);
      await tx.delete(schema.supportRequests).where(sql`lower(${schema.supportRequests.email}) = ${email}`);
    }
    // Kept for tax law, but no longer tied to an account that no longer exists.
    await tx.update(schema.orders).set({ userId: null }).where(eq(schema.orders.userId, user.id));
    // Cascades: sign-in accounts, sessions, addresses, bag, wishlist, routine items, consents.
    await tx.delete(schema.users).where(eq(schema.users.id, user.id));
    await recordAudit(
      {
        actor: user.id,
        actorRole: 'customer',
        action: 'personal.account_erased',
        entityType: 'user',
        entityId: user.id,
      },
      tx as never
    );
  });
  return { ok: true };
}

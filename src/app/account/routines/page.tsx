import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db, isDatabaseConfigured } from '@/db';
import { activeConsent, ACCOUNT_RETENTION_DAYS } from '@/modules/personal/personal-records';
import { claimGuestRecords, routineHistory, type RoutineState } from '@/modules/personal/routines';
import { cookies } from 'next/headers';
import { GUEST_OWNER_COOKIE, hashGuestSecret } from '@/lib/guest-owner';
import { reportError } from '@/lib/observability';
import { RoutineActions, WeeklyFeedback, WithdrawSaving } from './routine-actions';

export const metadata: Metadata = { title: 'Saved routines', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATE: Record<RoutineState, { label: string; detail: string; openable: boolean }> = {
  current: { label: 'Up to date', detail: 'Built on the current guidance.', openable: true },
  outdated: { label: 'Guidance updated', detail: 'Still valid; recalculate for a current routine.', openable: true },
  revoked: {
    label: 'No longer valid',
    detail: 'The guidance it was built on was withdrawn. Open it to recalculate from your saved answers.',
    openable: true,
  },
  expired: {
    label: 'Expired',
    detail: 'Past its retention period. It is deleted at the next daily clean-up.',
    openable: false,
  },
  consent_withdrawn: {
    label: 'Permission withdrawn',
    detail: 'You withdrew permission to keep routines, so it is hidden and will be deleted when it expires.',
    openable: false,
  },
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The account's saved routines with their real state, read server-side
 * for this account only (never cached). Opening one goes through the
 * verified routine API (`/routine-finder?saved=<id>`).
 */
export default async function SavedRoutinesPage() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) redirect('/login?callbackUrl=/account/routines');
  const owner = { kind: 'user' as const, userId };
  // A routine saved as a guest before signing in belongs to this account now: claim it before listing.
  // Atomic and idempotent; the cookie itself is cleared by the next API request (a page cannot set cookies).
  const guestHash = hashGuestSecret((await cookies()).get(GUEST_OWNER_COOKIE)?.value);
  if (guestHash && isDatabaseConfigured())
    await claimGuestRecords(db, userId, guestHash).catch((err) =>
      reportError(err, { scope: 'routines.claimOnAccountPage' })
    );
  const [routines, consent, photoConsent] = isDatabaseConfigured()
    ? await Promise.all([
        routineHistory(db, owner),
        activeConsent(db, owner, 'routine_saving'),
        activeConsent(db, owner, 'photo_processing'),
      ])
    : [[], null, null];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/account" className="hover:text-foreground">
          Account
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <span className="text-foreground">Saved routines</span>
      </nav>
      <h1 className="mt-3 text-5xl font-medium tracking-tight">Saved routines</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Routines you chose to save are kept for {ACCOUNT_RETENTION_DAYS} days. You can delete any of them, or withdraw
        permission to keep them at all.
      </p>

      {routines.length === 0 ? (
        <div className="mt-10 rounded-[18px] border border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">You have no saved routines.</p>
          <Link
            href="/routine-finder"
            className="mt-6 inline-flex h-[49px] items-center rounded-full bg-primary px-6 text-primary-foreground"
          >
            Find your routine
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-3">
          {routines.map((r) => {
            const s = STATE[r.state];
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-6 rounded-[18px] border border-border bg-card p-6"
              >
                <div>
                  <p className="font-medium">Saved {date(r.createdAt)}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">{s.label}.</span>{' '}
                    <span className="text-muted-foreground">{s.detail}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Kept until {date(r.expiresAt)}</p>
                </div>
                <RoutineActions id={r.id} openable={s.openable} />
                {s.openable && r.kbRelease && <WeeklyFeedback id={r.id} kbRelease={r.kbRelease} week={r.week} />}
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-12 rounded-[18px] border border-border p-6" aria-labelledby="saving-heading">
        <h2 id="saving-heading" className="text-xl font-medium">
          Permission to save routines
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {consent
            ? `Granted ${date(consent.grantedAt.toISOString())}. Withdrawing hides every saved routine at once and stops new ones being saved.`
            : 'Not granted. Routines are only saved when you choose to save one.'}
        </p>
        {consent && <WithdrawSaving />}
      </section>

      {photoConsent && (
        <section className="mt-6 rounded-[18px] border border-border p-6" aria-labelledby="photo-heading">
          <h2 id="photo-heading" className="text-xl font-medium">
            Permission to process photos
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Granted {date(photoConsent.grantedAt.toISOString())}. Withdrawing stops any pending photo check and deletes
            your stored photos at once.
          </p>
          <WithdrawSaving purpose="photo_processing" />
        </section>
      )}
    </div>
  );
}

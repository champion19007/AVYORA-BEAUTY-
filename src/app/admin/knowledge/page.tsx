import type { Metadata } from 'next';
import { db, isDatabaseConfigured } from '@/db';
import { getStaffSession } from '@/lib/staff-auth';
import { listReleases, validateRepositoryKnowledge } from '@/modules/knowledge/admin';
import { KnowledgeForms } from './knowledge-forms';

export const metadata: Metadata = { title: 'Knowledge' };
export const dynamic = 'force-dynamic';

const when = (d: Date | null) => (d ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Knowledge releases: what the repository's approved knowledge compiles
 * to, every stored release with its status, and (owner only) publish,
 * roll back and revoke. Authoring is in the repository as reviewed data.
 */
export default async function KnowledgePage() {
  const session = await getStaffSession();
  const isOwner = session?.role === 'owner';
  const validation = validateRepositoryKnowledge();
  const state = isDatabaseConfigured() ? await listReleases(db) : null;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-medium tracking-tight">Knowledge</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-muted-foreground">
          Rules, directions, formulations, interactions and explanation templates are reviewed in the repository (every
          change is a reviewable diff). Here you validate them, publish an immutable release, roll back, or revoke one.{' '}
          {isOwner ? '' : 'Only the owner can publish, roll back or revoke.'}
        </p>
      </header>

      <section aria-labelledby="validation-heading" className="rounded-[18px] border border-border bg-card p-6">
        <h2 id="validation-heading" className="text-xl font-medium">
          Validation of the repository knowledge
        </h2>
        {validation.ok ? (
          <p className="mt-2 text-[15px]">
            Valid. It compiles to release{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{validation.release.manifest.releaseId}</code>
            {state?.activeId === validation.release.manifest.releaseId
              ? ', which is the active release.'
              : ', which is not active yet.'}
          </p>
        ) : (
          <div className="mt-2" role="alert">
            <p className="text-[15px] font-medium text-destructive">
              {validation.errors.length} problem{validation.errors.length === 1 ? '' : 's'} block publication:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer">
            {validation.awaitingReview.length} records awaiting review (not published)
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {validation.awaitingReview.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </section>

      {!state ? (
        <p className="text-muted-foreground">No database is configured on this deployment.</p>
      ) : (
        <section aria-labelledby="releases-heading">
          <h2 id="releases-heading" className="text-xl font-medium">
            Releases
          </h2>
          {state.releases.length === 0 ? (
            <p className="mt-2 text-muted-foreground">
              No release has been stored yet. The storefront shows a session-only preview until one is published.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-[18px] border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Release
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Stored
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Published
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Revoked
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.releases.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.id}
                        {r.id === state.activeId && (
                          <span className="ml-2 rounded-full bg-primary px-2 py-0.5 font-sans text-primary-foreground">
                            active
                          </span>
                        )}
                        {r.id === state.previousId && (
                          <span className="ml-2 rounded-full border border-border px-2 py-0.5 font-sans">previous</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">
                        {when(r.storedAt)} · {r.storedBy}
                      </td>
                      <td className="px-4 py-3">{when(r.publishedAt)}</td>
                      <td className="px-4 py-3">{r.revokedAt ? `${when(r.revokedAt)}: ${r.revokedReason}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isOwner && (
            <KnowledgeForms
              canPublish={validation.ok}
              hasPrevious={Boolean(state.previousId)}
              revocable={state.releases
                .filter((r) => r.status !== 'revoked' && r.id !== state.activeId)
                .map((r) => r.id)}
            />
          )}
        </section>
      )}
    </div>
  );
}

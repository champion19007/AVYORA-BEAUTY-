'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { publishKnowledge, revokeKnowledgeAction, rollbackKnowledgeAction, type KnowledgeActionState } from './actions';

function Result({ state }: { state: KnowledgeActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${state.ok ? '' : 'text-destructive'}`}>
      {state.message}
    </p>
  );
}

const input = 'h-10 rounded-full border border-border bg-background px-4 text-sm';

/** Owner-only knowledge actions, each with an explicit confirmation field. */
export function KnowledgeForms({ canPublish, hasPrevious, revocable }: { canPublish: boolean; hasPrevious: boolean; revocable: string[] }) {
  const [publishState, publish, publishing] = useActionState(publishKnowledge, {});
  const [rollbackState, rollback, rollingBack] = useActionState(rollbackKnowledgeAction, {});
  const [revokeState, revoke, revoking] = useActionState(revokeKnowledgeAction, {});
  return (
    <div className="mt-6 grid grid-cols-3 gap-4">
      <form action={publish} className="rounded-[18px] border border-border bg-card p-5">
        <h3 className="font-medium">Publish</h3>
        <p className="mt-1 text-sm text-muted-foreground">Stores the validated release and makes it active. Saved routines on older releases are marked outdated.</p>
        <label className="mt-3 block text-sm">
          Type PUBLISH to confirm
          <input name="confirm" autoComplete="off" className={`${input} mt-1 w-full`} />
        </label>
        <Button type="submit" className="mt-3 rounded-full" disabled={!canPublish || publishing}>
          {publishing ? 'Publishing…' : 'Publish'}
        </Button>
        {!canPublish && <p className="mt-2 text-sm text-destructive">Fix the validation problems first.</p>}
        <Result state={publishState} />
      </form>

      <form action={rollback} className="rounded-[18px] border border-border bg-card p-5">
        <h3 className="font-medium">Roll back</h3>
        <p className="mt-1 text-sm text-muted-foreground">Re-activates the previous release.</p>
        <label className="mt-3 block text-sm">
          Reason
          <input name="reason" required className={`${input} mt-1 w-full`} />
        </label>
        <Button type="submit" variant="outline" className="mt-3 rounded-full" disabled={!hasPrevious || rollingBack}>
          {rollingBack ? 'Rolling back…' : 'Roll back'}
        </Button>
        <Result state={rollbackState} />
      </form>

      <form action={revoke} className="rounded-[18px] border border-border bg-card p-5">
        <h3 className="font-medium">Revoke</h3>
        <p className="mt-1 text-sm text-muted-foreground">Permanently withdraws a release that is not active. Routines built on it stop being shown as recommendations.</p>
        <label className="mt-3 block text-sm">
          Release
          <select name="releaseId" className={`${input} mt-1 w-full`} disabled={revocable.length === 0}>
            {revocable.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          Reason
          <input name="reason" required className={`${input} mt-1 w-full`} />
        </label>
        <Button type="submit" variant="destructive" className="mt-3 rounded-full" disabled={revocable.length === 0 || revoking}>
          {revoking ? 'Revoking…' : 'Revoke'}
        </Button>
        <Result state={revokeState} />
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Step = 'idle' | 'confirm' | 'busy' | 'failed';

/** Open (through the verified routine API) and delete one saved routine, with a confirmation step. */
export function RoutineActions({ id, openable }: { id: string; openable: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const remove = async () => {
    setStep('busy');
    const res = await fetch(`/api/routines/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    if (res?.status === 204) router.refresh();
    else setStep('failed');
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {openable && (
        <Link href={`/routine-finder?saved=${encodeURIComponent(id)}`} className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm hover:border-foreground">
          Open
        </Link>
      )}
      {step === 'confirm' ? (
        <>
          <Button variant="destructive" className="rounded-full" onClick={remove}>
            Delete permanently
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={() => setStep('idle')}>
            Keep
          </Button>
        </>
      ) : (
        <Button variant="ghost" className="rounded-full" disabled={step === 'busy'} onClick={() => setStep('confirm')}>
          {step === 'busy' ? 'Deleting…' : 'Delete'}
        </Button>
      )}
      {step === 'failed' && (
        <p role="alert" className="w-full text-sm text-destructive">
          Could not delete it. Try again.
        </p>
      )}
    </div>
  );
}

/** Withdraws a permission (DELETE /api/consent?purpose=), after a confirmation step. */
export function WithdrawSaving({ purpose = 'routine_saving' }: { purpose?: 'routine_saving' | 'photo_processing' }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const withdraw = async () => {
    setStep('busy');
    const res = await fetch(`/api/consent?purpose=${purpose}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return setStep('failed');
    const body = (await res.json().catch(() => ({}))) as { photoDeletionsPending?: number };
    // A photo whose deletion storage has not confirmed is not described as deleted.
    if (body.photoDeletionsPending) {
      setPendingPhotos(body.photoDeletionsPending);
      return setStep('idle');
    }
    router.refresh();
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {step === 'confirm' ? (
        <>
          <Button variant="destructive" className="rounded-full" onClick={withdraw}>
            Withdraw permission
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={() => setStep('idle')}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="outline" className="rounded-full" disabled={step === 'busy'} onClick={() => setStep('confirm')}>
          {step === 'busy' ? 'Withdrawing…' : 'Withdraw permission'}
        </Button>
      )}
      {step === 'failed' && (
        <p role="alert" className="w-full text-sm text-destructive">
          Could not withdraw permission. Try again.
        </p>
      )}
      {pendingPhotos > 0 && (
        <p role="status" className="w-full text-sm">
          Permission withdrawn. {pendingPhotos === 1 ? 'One photo' : `${pendingPhotos} photos`} could not be deleted yet; deletion is retried
          automatically, and pressing the button again retries it now.
        </p>
      )}
    </div>
  );
}

const FEEDBACK = {
  adherence: { label: 'How often did you follow it?', options: { every_day: 'Every day', most_days: 'Most days', some_days: 'Some days', not_at_all: 'Not at all' } },
  tolerability: { label: 'How did your skin feel?', options: { comfortable: 'Comfortable', mild_discomfort: 'Mild discomfort', irritated: 'Irritated', stopped: 'I stopped using it' } },
  reportedChange: { label: 'Any change?', options: { better: 'Better', same: 'The same', worse: 'Worse', unsure: 'Not sure' } },
} as const;
type FeedbackField = keyof typeof FEEDBACK;

/**
 * This week's feedback on a saved routine: three bounded choices, once per
 * week. It informs follow-up only; it is not a medical record and never
 * changes the routine by itself.
 */
export function WeeklyFeedback({ id, kbRelease, week }: { id: string; kbRelease: string; week: number }) {
  const [values, setValues] = useState<Partial<Record<FeedbackField, string>>>({});
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'sent' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const complete = (Object.keys(FEEDBACK) as FeedbackField[]).every((f) => values[f]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: 'busy' });
    const res = await fetch(`/api/routines/${encodeURIComponent(id)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week, kbRelease, ...values }),
    }).catch(() => null);
    if (res?.status === 201) return setState({ kind: 'sent' });
    const body = await res?.json().catch(() => null);
    setState({ kind: 'error', message: body?.error?.message ?? 'Could not send it. Try again.' });
  };
  if (state.kind === 'sent') return <p className="text-sm">Thanks. Week {week} feedback is saved.</p>;
  return (
    <details className="w-full">
      <summary className="cursor-pointer text-sm underline underline-offset-4">How is week {week} going?</summary>
      <form onSubmit={send} className="mt-4 grid gap-4 sm:grid-cols-3">
        {(Object.keys(FEEDBACK) as FeedbackField[]).map((field) => (
          <fieldset key={field}>
            <legend className="text-sm font-medium">{FEEDBACK[field].label}</legend>
            {Object.entries(FEEDBACK[field].options).map(([value, text]) => (
              <label key={value} className="mt-2 flex items-center gap-2 text-sm">
                <input type="radio" name={`${id}-${field}`} value={value} autoComplete="off" checked={values[field] === value} onChange={() => setValues((v) => ({ ...v, [field]: value }))} />
                {text}
              </label>
            ))}
          </fieldset>
        ))}
        <div className="sm:col-span-3">
          <Button type="submit" className="rounded-full" disabled={!complete || state.kind === 'busy'}>
            {state.kind === 'busy' ? 'Sending…' : 'Send'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">If your skin is irritated, stop the new products. For a reaction that does not settle, see a doctor or pharmacist.</p>
          {state.kind === 'error' && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {state.message}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}

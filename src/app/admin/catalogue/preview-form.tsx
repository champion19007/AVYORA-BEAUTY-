'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { previewRecords, type PreviewState } from './actions';

export function PreviewForm() {
  const [state, action, pending] = useActionState<PreviewState, FormData>(previewRecords, {});
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-3">
        <label htmlFor="records" className="block text-sm font-medium">
          Product records (JSON array)
        </label>
        <textarea
          id="records"
          name="records"
          rows={14}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
          required
        />
        <Button type="submit" disabled={pending} className="rounded-md">
          {pending ? 'Checking…' : 'Preview'}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.preview && (
        <section aria-live="polite" className="space-y-4">
          <p className="text-sm">
            {state.preview.records.filter((r) => r.publishable).length} of {state.preview.records.length} publishable,{' '}
            {state.preview.records.filter((r) => r.recommendable).length} recommendable. Nothing has been saved.
          </p>
          {state.preview.problems.map((p) => (
            <p key={p} className="text-sm text-destructive">
              {p}
            </p>
          ))}
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {state.preview.records.map((r) => (
              <li key={r.id} className="space-y-1 p-4 text-sm">
                <p className="font-medium">
                  {r.id} · {!r.publishable ? 'Blocked' : r.recommendable ? 'Ready' : 'Publishable, not recommendable'}
                </p>
                {r.problems.map((p) => (
                  <p key={p} className="text-destructive">
                    {p}
                  </p>
                ))}
                {r.unresolved.map((u) => (
                  <p key={u} className="text-muted-foreground">
                    Unresolved: {u}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

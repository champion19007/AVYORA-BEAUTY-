'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { uploadContentMedia, type UploadFormState } from '../actions';

export function UploadForm() {
  const [state, action, pending] = useActionState<UploadFormState, FormData>(uploadContentMedia, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Image
        <Input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required className="mt-1" />
      </label>
      <label className="min-w-[220px] flex-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Description (for screen readers)
        <Input name="alt" maxLength={300} className="mt-1" placeholder="Amber bottle on a stone shelf" />
      </label>
      <Button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md px-5 text-[11px] font-semibold uppercase tracking-[0.14em]"
      >
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
      {state.error && (
        <p className="w-full text-[13px] text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.uploaded && (
        <p className="w-full text-[13px] text-muted-foreground">
          Uploaded. Id: <code className="select-all">{state.uploaded.id}</code>
        </p>
      )}
    </form>
  );
}

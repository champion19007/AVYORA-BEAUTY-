'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { publishCatalogueAction, type PublishState } from './actions';

export function PublishPanel({
  publishedAt,
  unpublished,
  liveCount,
  draftCount,
  showingSamples,
}: {
  publishedAt: string | null;
  unpublished: number;
  liveCount: number;
  draftCount: number;
  showingSamples: boolean;
}) {
  const [state, publish, pending] = useActionState<PublishState, FormData>(publishCatalogueAction, {});
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {publishedAt
            ? `Last published ${new Date(publishedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
            : 'Not published yet'}
        </p>
        <p className="text-muted-foreground">
          {showingSamples ? 'The shop is still showing the sample products. ' : ''}
          {unpublished > 0
            ? `${unpublished} ${unpublished === 1 ? 'product has' : 'products have'} changes not on the shop yet.`
            : 'The shop matches what is here.'}{' '}
          Publishing puts the {liveCount} live {liveCount === 1 ? 'product' : 'products'} on the shop.
        </p>
        {state.message && <p className="mt-2 text-emerald-700">{state.message}</p>}
        {state.error && (
          <p role="alert" className="mt-2 text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Shows drafts too, labelled as samples, with ordering off: for before the real details are in. */}
        <form action={publish}>
          <input type="hidden" name="mode" value="preview" />
          <Button type="submit" variant="outline" disabled={pending || draftCount + liveCount === 0}>
            Publish as preview (not for sale)
          </Button>
        </form>
        <form action={publish}>
          <Button type="submit" disabled={pending || liveCount === 0}>
            {pending ? 'Publishing…' : 'Publish to shop'}
          </Button>
        </form>
      </div>
    </section>
  );
}

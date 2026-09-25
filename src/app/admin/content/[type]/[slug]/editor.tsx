'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { saveContent, type ContentFormState } from '../../actions';

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';
const hintClass = 'mt-1 text-[12px] normal-case tracking-normal text-muted-foreground';

/**
 * The draft editor for either content type.
 *
 * The version this form loaded travels back with the save, so a save made
 * after someone else's is refused with an explanation rather than quietly
 * replacing their work.
 */
export function ContentEditor({
  type,
  slug,
  version,
  initial,
}: {
  type: 'product_copy' | 'article';
  slug: string;
  version: number;
  initial: Record<string, unknown>;
}) {
  const [state, action, pending] = useActionState<ContentFormState, FormData>(saveContent, {});
  const text = (key: string) => String(initial[key] ?? '');

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-card p-5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="version" value={version} />

      {type === 'article' && (
        <>
          {slug ? (
            <input type="hidden" name="slug" value={slug} />
          ) : (
            <label className={labelClass}>
              Address
              <Input name="slug" placeholder="monsoon-skin-routine" required className="mt-1" />
              <input type="hidden" name="isNew" value="1" />
              <span className={hintClass}>
                Lower-case words and hyphens. The article will live at /journal/this-address.
              </span>
            </label>
          )}
          <label className={labelClass}>
            Title
            <Input name="title" defaultValue={text('title')} maxLength={140} required className="mt-1" />
          </label>
          <label className={labelClass}>
            Excerpt
            <Textarea name="excerpt" defaultValue={text('excerpt')} maxLength={300} rows={2} className="mt-1" />
          </label>
          <label className={labelClass}>
            Body
            <Textarea name="body" defaultValue={text('body')} rows={16} required className="mt-1 font-mono text-[13px]" />
            <span className={hintClass}>
              Leave a blank line between paragraphs. Start a line with “## ” for a subheading.
            </span>
          </label>
          <label className={labelClass}>
            Hero image id
            <Input name="heroAssetId" defaultValue={text('heroAssetId')} className="mt-1" placeholder="optional" />
            <span className={hintClass}>Copy an id from the media library.</span>
          </label>
        </>
      )}

      {type === 'product_copy' && (
        <>
          <input type="hidden" name="slug" value={slug} />
          <label className={labelClass}>
            Tagline
            <Input name="tagline" defaultValue={text('tagline')} maxLength={160} required className="mt-1" />
          </label>
          <label className={labelClass}>
            Description
            <Textarea name="description" defaultValue={text('description')} rows={5} required className="mt-1" />
          </label>
          <label className={labelClass}>
            How to use
            <Textarea name="howToUse" defaultValue={text('howToUse')} rows={3} className="mt-1" />
          </label>
          <label className={labelClass}>
            Highlights
            <Textarea
              name="highlights"
              defaultValue={((initial.highlights as string[] | undefined) ?? []).join('\n')}
              rows={4}
              className="mt-1"
            />
            <span className={hintClass}>One per line, six at most.</span>
          </label>
        </>
      )}

      <div className="flex items-center gap-4">
        <Button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md px-5 text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
        {state.saved && <span className="text-[13px] text-muted-foreground">Draft saved.</span>}
        {state.error && (
          <span className="text-[13px] text-destructive" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

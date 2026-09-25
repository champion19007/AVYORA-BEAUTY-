import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isDatabaseConfigured } from '@/db';
import { getProductBySlug } from '@/lib/catalogue';
import { documentBySlug, revisionsOf } from '@/modules/cms/content-read';
import { isContentType } from '@/modules/cms/content-types';
import { publishContent, restoreContent, unpublishContent } from '../../actions';
import { StatusLabel } from '../../status-label';
import { ContentEditor } from './editor';

export const metadata: Metadata = { title: 'Edit content' };
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ type: string; slug: string }>;
  searchParams: Promise<{ error?: string }>;
};

const buttonClass =
  'rounded-md border border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-muted';

export default async function EditContentPage({ params, searchParams }: Props) {
  const { type, slug } = await params;
  const { error } = await searchParams;
  if (!isContentType(type) || !isDatabaseConfigured()) notFound();

  const isNew = type === 'article' && slug === 'new';
  const product = type === 'product_copy' ? getProductBySlug(slug) : undefined;
  if (type === 'product_copy' && !product) notFound();

  const doc = isNew ? null : await documentBySlug(type, slug);
  if (type === 'article' && !isNew && !doc) notFound();

  const revisions = doc ? await revisionsOf(doc.id) : [];

  // A product's first draft starts from the catalogue's own text.
  const initial =
    (doc?.draft as Record<string, unknown> | undefined) ??
    (product
      ? { tagline: product.tagline, description: product.description, howToUse: '', highlights: [] }
      : { title: '', excerpt: '', body: '', heroAssetId: '' });

  const hidden = (
    <>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      {doc && <input type="hidden" name="documentId" value={doc.id} />}
      {doc && <input type="hidden" name="version" value={doc.version} />}
    </>
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/content"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-primary"
        >
          ← Content
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-headline text-3xl font-normal tracking-tight">
            {product?.name ?? (isNew ? 'New article' : slug)}
          </h1>
          <StatusLabel doc={doc} />
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 p-3 text-[14px] text-destructive" role="alert">
          {error}
        </p>
      )}

      <ContentEditor type={type} slug={isNew ? '' : slug} version={doc?.version ?? 0} initial={initial} />

      {doc && (
        <div className="flex flex-wrap gap-3 border-t border-border pt-6">
          {(doc.status !== 'published' || doc.publishedVersion !== doc.version) && (
            <form action={publishContent}>
              {hidden}
              <button type="submit" className={`${buttonClass} bg-primary text-primary-foreground hover:bg-primary/90`}>
                Publish version {doc.version}
              </button>
            </form>
          )}
          {doc.status === 'published' && (
            <form action={unpublishContent}>
              {hidden}
              <button type="submit" className={buttonClass}>
                Take down
              </button>
            </form>
          )}
          {doc.status === 'published' && type === 'article' && (
            <Link href={`/journal/${slug}`} className={buttonClass}>
              View live
            </Link>
          )}
          {type === 'product_copy' && (
            <Link href={`/products/${slug}`} className={buttonClass}>
              View product page
            </Link>
          )}
        </div>
      )}

      {revisions.length > 0 && (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            History
          </h2>
          <ul className="mt-3 rounded-xl border border-border bg-card">
            {revisions.map((rev) => (
              <li
                key={rev.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 text-[14px] last:border-0"
              >
                <span>
                  v{rev.version} · {rev.action} · {rev.actor} ·{' '}
                  <span className="text-muted-foreground">
                    {rev.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </span>
                {rev.action !== 'unpublish' && rev.version !== doc?.version && (
                  <form action={restoreContent}>
                    {hidden}
                    <input type="hidden" name="revisionId" value={rev.id} />
                    <button type="submit" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary hover:opacity-70">
                      Restore as draft
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

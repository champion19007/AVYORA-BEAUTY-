import type { Metadata } from 'next';
import Link from 'next/link';
import { isDatabaseConfigured } from '@/db';
import { allProducts } from '@/lib/catalogue';
import { documentsOfType } from '@/modules/cms/content-read';
import { StatusLabel, type Doc } from './status-label';

export const metadata: Metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';


/**
 * Everything editable, and where each piece stands.
 *
 * Every product appears whether or not its copy has been edited: until it
 * is, the storefront shows the catalogue's text, and the first save here
 * starts a draft from that text.
 */
export default async function AdminContentPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const [copies, articles] = await Promise.all([
    documentsOfType('product_copy'),
    documentsOfType('article'),
  ]);
  const copyBySlug = new Map(copies.map((d) => [d.slug, d]));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-normal tracking-tight">Content</h1>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
            Edits are saved as drafts. Nothing reaches the shop until you publish it.
          </p>
        </div>
        <Link
          href="/admin/content/media"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary hover:opacity-70"
        >
          Media library
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Journal
          </h2>
          <Link
            href="/admin/content/article/new"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary hover:opacity-70"
          >
            New article
          </Link>
        </div>
        <ul className="mt-3 rounded-xl border border-border bg-card">
          {articles.length === 0 && (
            <li className="p-4 text-[14px] text-muted-foreground">No articles yet.</li>
          )}
          {articles.map((doc) => (
            <Row
              key={doc.id}
              href={`/admin/content/article/${doc.slug}`}
              title={(doc.draft as { title?: string }).title ?? doc.slug}
              doc={doc}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Product copy
        </h2>
        <ul className="mt-3 rounded-xl border border-border bg-card">
          {allProducts().map((product) => (
            <Row
              key={product.id}
              href={`/admin/content/product_copy/${product.slug}`}
              title={product.name}
              doc={copyBySlug.get(product.slug) ?? null}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ href, title, doc }: { href: string; title: string; doc: Doc | null }) {
  return (
    <li className="border-b border-border last:border-0">
      <Link href={href} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40">
        <span className="text-[15px]">{title}</span>
        <StatusLabel doc={doc} />
      </Link>
    </li>
  );
}

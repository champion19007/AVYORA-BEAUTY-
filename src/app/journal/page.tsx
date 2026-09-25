import type { Metadata } from 'next';
import Link from 'next/link';
import { publishedArticles } from '@/modules/cms/content-read';

export const metadata: Metadata = {
  title: 'Journal',
  description: 'Notes on ingredients, routines and caring for skin through the Indian seasons.',
};

/**
 * Regenerated on publish (the content event revalidates this path) and, as a
 * backstop, every five minutes.
 */
export const revalidate = 300;

export default async function JournalPage() {
  const articles = await publishedArticles();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
      <span className="eyebrow">Journal</span>
      <h1 className="mt-3 font-headline text-4xl font-normal tracking-tight md:text-5xl">
        Notes from the lab bench
      </h1>

      {articles.length === 0 ? (
        <p className="mt-10 text-base leading-relaxed text-muted-foreground">
          Nothing published yet. The first articles are being written.
        </p>
      ) : (
        <ul className="mt-12 divide-y divide-border border-y border-border">
          {articles.map((article) => (
            <li key={article.slug}>
              <Link href={`/journal/${article.slug}`} className="group block py-8">
                <time
                  dateTime={article.publishedAt}
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {new Date(article.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
                </time>
                <h2 className="mt-2 font-headline text-2xl font-normal tracking-tight group-hover:text-primary">
                  {article.title}
                </h2>
                {article.excerpt && (
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{article.excerpt}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

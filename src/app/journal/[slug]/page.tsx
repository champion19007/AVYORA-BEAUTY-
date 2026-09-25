import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publishedArticle } from '@/modules/cms/content-read';
import { articleBlocks } from '@/modules/cms/content-types';
import { mediaUrl } from '@/modules/cms/media';

type Props = { params: Promise<{ slug: string }> };

/**
 * Articles are rendered on first request and then cached (no build-time list:
 * the build has no reason to reach the database). A publish revalidates the
 * page at once; the timer is only a backstop.
 */
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await publishedArticle(slug);
  if (!article) return { title: 'Not found' };
  return {
    title: article.title,
    description: article.excerpt || undefined,
    openGraph: { title: `${article.title} | Avyora`, description: article.excerpt || undefined },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await publishedArticle(slug);
  if (!article) notFound();

  const hero = await mediaUrl(article.heroAssetId);

  return (
    <article className="container mx-auto max-w-2xl px-4 py-12 md:py-20">
      <Link
        href="/journal"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-primary"
      >
        ← Journal
      </Link>
      <time
        dateTime={article.publishedAt}
        className="mt-8 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {new Date(article.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
      </time>
      <h1 className="mt-3 font-headline text-4xl font-normal leading-tight tracking-tight md:text-5xl">
        {article.title}
      </h1>

      {hero && (
        // eslint-disable-next-line @next/next/no-img-element -- storage hosts vary; no loader configured for them
        <img src={hero.url} alt={hero.alt} className="mt-10 w-full rounded-xl object-cover" />
      )}

      {/* Plain text, split into blocks. Nothing here is parsed as HTML. */}
      <div className="mt-10 space-y-6 text-[17px] leading-[1.75] text-foreground/85">
        {articleBlocks(article.body).map((block, i) =>
          block.kind === 'heading' ? (
            <h2 key={i} className="pt-4 font-headline text-2xl font-normal tracking-tight text-foreground">
              {block.text}
            </h2>
          ) : (
            <p key={i}>{block.text}</p>
          )
        )}
      </div>
    </article>
  );
}

import { and, asc, desc, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { cmsDocuments, cmsRevisions } from '@/db/schema';
import { cache, POLICIES } from '@/infrastructure/cache';
import { reportError } from '@/lib/observability';
import {
  articleSchema,
  productCopySchema,
  type Article,
  type ContentType,
  type ProductCopy,
} from './content-types';

/**
 * Reading content.
 *
 * Two audiences, two paths. The storefront reads only published bodies, and
 * reads them through the content cache: content changes when someone presses
 * publish, and the publish invalidates it. The admin reads drafts, versions
 * and revisions straight from Postgres, never cached, because an editor must
 * see exactly what is saved.
 *
 * Published bodies are parsed again on the way out. A body that no longer
 * fits its schema (a field renamed in code, say) is treated as absent and
 * reported, so the page falls back to catalogue text instead of rendering
 * undefined.
 */

const listKey = (type: ContentType) => `${type}:__list`;
const docKey = (type: ContentType, slug: string) => `${type}:${slug}`;

async function loadPublished(type: ContentType, slug: string): Promise<unknown | null> {
  const [row] = await db
    .select({ published: cmsDocuments.published })
    .from(cmsDocuments)
    .where(
      and(
        eq(cmsDocuments.type, type),
        eq(cmsDocuments.slug, slug),
        eq(cmsDocuments.status, 'published')
      )
    )
    .limit(1);
  return row?.published ?? null;
}

/**
 * The published copy for a product, or null to use the catalogue's text.
 *
 * Never throws. Product copy is an enhancement over text that always exists,
 * so a database or cache failure here costs the edited wording, not the page.
 */
export async function productCopy(slug: string): Promise<ProductCopy | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const body = await cache.getOrSet(POLICIES.content, docKey('product_copy', slug), () =>
      loadPublished('product_copy', slug)
    );
    if (body === null) return null;
    const parsed = productCopySchema.safeParse(body);
    if (!parsed.success) {
      reportError(new Error('Published product copy does not match its schema'), {
        scope: 'cms.read',
        extra: { slug },
      });
      return null;
    }
    return parsed.data;
  } catch (err) {
    reportError(err, { scope: 'cms.read', extra: { slug } });
    return null;
  }
}

export type PublishedArticle = Article & { slug: string; publishedAt: string };

/**
 * One published article, or null when there is none at that slug.
 *
 * Unlike product copy this does throw on a database failure: there is no
 * fallback text for an article, and answering "not found" for a page that
 * exists would get cached by ISR as a 404.
 */
export async function publishedArticle(slug: string): Promise<PublishedArticle | null> {
  if (!isDatabaseConfigured()) return null;
  return cache.getOrSet(POLICIES.content, docKey('article', slug), async () => {
    const [row] = await db
      .select({ published: cmsDocuments.published, publishedAt: cmsDocuments.publishedAt })
      .from(cmsDocuments)
      .where(
        and(
          eq(cmsDocuments.type, 'article'),
          eq(cmsDocuments.slug, slug),
          eq(cmsDocuments.status, 'published')
        )
      )
      .limit(1);
    if (!row?.published) return null;
    const parsed = articleSchema.safeParse(row.published);
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      slug,
      publishedAt: (row.publishedAt ?? new Date()).toISOString(),
    };
  });
}

/** Every published article, newest first. */
export async function publishedArticles(): Promise<PublishedArticle[]> {
  if (!isDatabaseConfigured()) return [];
  return cache.getOrSet(POLICIES.content, listKey('article'), async () => {
    const rows = await db
      .select({
        slug: cmsDocuments.slug,
        published: cmsDocuments.published,
        publishedAt: cmsDocuments.publishedAt,
      })
      .from(cmsDocuments)
      .where(and(eq(cmsDocuments.type, 'article'), eq(cmsDocuments.status, 'published')))
      .orderBy(desc(cmsDocuments.publishedAt))
      .limit(100);

    return rows.flatMap((row) => {
      const parsed = articleSchema.safeParse(row.published);
      if (!parsed.success) return [];
      return [
        {
          ...parsed.data,
          slug: row.slug,
          publishedAt: (row.publishedAt ?? new Date()).toISOString(),
        },
      ];
    });
  });
}

/**
 * Forgets cached content for one document, and any list it appears in.
 * Called after a publish or unpublish commits, and again by the event
 * consumer as a backstop.
 */
export async function invalidateContent(type: string, slug: string): Promise<void> {
  await Promise.all([
    cache.invalidate(POLICIES.content, `${type}:${slug}`),
    cache.invalidate(POLICIES.content, `${type}:__list`),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Admin reads — never cached                                                   */
/* -------------------------------------------------------------------------- */

export async function documentsOfType(type: ContentType) {
  return db
    .select()
    .from(cmsDocuments)
    .where(eq(cmsDocuments.type, type))
    .orderBy(asc(cmsDocuments.slug));
}

export async function documentBySlug(type: ContentType, slug: string) {
  const [doc] = await db
    .select()
    .from(cmsDocuments)
    .where(and(eq(cmsDocuments.type, type), eq(cmsDocuments.slug, slug)))
    .limit(1);
  return doc ?? null;
}

export async function revisionsOf(documentId: string, limit = 30) {
  return db
    .select({
      id: cmsRevisions.id,
      version: cmsRevisions.version,
      action: cmsRevisions.action,
      actor: cmsRevisions.actor,
      createdAt: cmsRevisions.createdAt,
    })
    .from(cmsRevisions)
    .where(eq(cmsRevisions.documentId, documentId))
    .orderBy(desc(cmsRevisions.id))
    .limit(limit);
}

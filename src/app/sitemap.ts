import type { MetadataRoute } from 'next';
import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { publishedArticles } from '@/modules/cms/content-read';
import { reportError } from '@/lib/observability';

const BASE_URL = 'https://avyora.com';

/**
 * Emits /sitemap.xml covering the marketing pages, every product detail
 * page and each filtered collection view.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/collections`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/routine-finder`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/track-order`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/journal`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
  ];

  // Published articles. A database hiccup costs the sitemap its articles,
  // not the whole sitemap.
  let articleRoutes: MetadataRoute.Sitemap = [];
  try {
    articleRoutes = (await publishedArticles()).map((a) => ({
      url: `${BASE_URL}/journal/${a.slug}`,
      lastModified: new Date(a.publishedAt),
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  } catch (err) {
    reportError(err, { scope: 'sitemap.articles' });
  }

  const productRoutes: MetadataRoute.Sitemap = PRODUCTS.map((p) => ({
    url: `${BASE_URL}/products/${p.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${BASE_URL}/collections?category=${c.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const concernRoutes: MetadataRoute.Sitemap = CONCERNS.map((c) => ({
    url: `${BASE_URL}/collections?concern=${c.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes, ...articleRoutes, ...categoryRoutes, ...concernRoutes];
}

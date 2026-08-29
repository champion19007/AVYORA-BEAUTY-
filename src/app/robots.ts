import type { MetadataRoute } from 'next';

/**
 * Keeps the authenticated and administrative areas out of search results
 * while leaving the storefront fully crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/dashboard', '/settings', '/payment', '/history', '/goals', '/subscriptions', '/login', '/signup'],
    },
    sitemap: 'https://avyora.com/sitemap.xml',
  };
}

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
      // The finance-app routes these used to cover have been deleted.
      disallow: ['/admin', '/api', '/checkout', '/orders', '/login', '/signup'],
    },
    sitemap: 'https://avyora.com/sitemap.xml',
  };
}

/**
 * Business details shown to customers.
 *
 * Only what the owner has supplied goes here; nothing is invented. Anything
 * still unconfirmed is listed in `UNCONFIRMED_BUSINESS_DETAILS`, which the
 * launch check (`npm run check:launch`) reports as a blocker.
 */

/** Used on the footer and every policy page. Mailbox not yet confirmed to exist. */
export const SUPPORT_EMAIL = 'support@avyora.com';

/** What the owner must confirm before launch. Remove an entry once confirmed. */
export const UNCONFIRMED_BUSINESS_DETAILS: readonly string[] = [
  `Support mailbox ${SUPPORT_EMAIL} exists and is monitored (the site runs on a vercel.app domain; no custom domain is verified)`,
  'WhatsApp support number (the previous dummy number has been removed)',
  'Social profile links (Instagram, Facebook, YouTube are hidden until set)',
];

/**
 * The site's public origin. `avyora.com` was hardcoded into canonical URLs,
 * the sitemap and structured data, but no custom domain is verified; search
 * engines were told to index a domain this deployment does not serve.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://avyora-beauty.vercel.app').replace(/\/$/, '');

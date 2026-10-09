import type { Product } from './mock-data';

/**
 * Products onboarded from validated records: verified SKU ids, integer-paise
 * prices, licensed images and reviewed descriptions. Shown only when
 * `NEXT_PUBLIC_CATALOGUE_MODE=verified`.
 *
 * Empty: no product has completed onboarding. Do not copy entries from the
 * sample catalogue. Add one only after `npm run catalogue:validate` accepts
 * its record (see docs/product-onboarding.md); prices and stock remain
 * authoritative in the database, not here.
 */
export const VERIFIED_PRODUCTS: readonly Product[] = [];

import { revalidatePath } from 'next/cache';
import { getProductById } from '@/lib/catalogue';
import { invalidateStorefrontData } from '@/modules/catalog/storefront-data';

/**
 * Refreshes the customer-facing pages that show availability or price.
 *
 * Product pages are statically regenerated on a 60-second timer, which is
 * right for prose and wrong for stock. Every path that can change what a
 * customer may buy has to call this, and until now only one did: an order
 * taking the last unit invalidated the page, while the stockroom counting a
 * SKU down to zero did not. So the shop kept selling something the shelf no
 * longer had, and every one of those orders failed at checkout after the
 * customer had typed a full address.
 *
 * Restocking had the mirror problem and cost more: the page said sold out for
 * up to a minute after the goods were back, and nobody ever finds out about
 * the sale they did not make.
 *
 * Lives here rather than being repeated at each call site so the set of paths
 * stays correct in one place. The previous copy revalidated `/products`, which
 * is not a route — the listing is `/collections` — so half the invalidation
 * was quietly doing nothing.
 */
export async function revalidateProduct(productId: string): Promise<void> {
  // The data cache first: a page rebuilt from a stale cache would just
  // render the old price again.
  await invalidateStorefrontData();

  const product = getProductById(productId);

  // The detail page is keyed by slug, not id.
  if (product) revalidatePath(`/products/${product.slug}`);

  // Listing and home both render product cards.
  revalidatePath('/collections');
  revalidatePath('/');
}

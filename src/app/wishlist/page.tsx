import type { Metadata } from 'next';
import { WishlistClient } from './wishlist-client';

export const metadata: Metadata = {
  title: 'Your wishlist',
  description: 'Formulations you have saved.',
  robots: { index: false, follow: false },
};

/**
 * Saved items.
 *
 * The wishlist itself already worked — the hearts on product cards and the
 * product page toggled it and wrote to localStorage — but nothing could read
 * it back. The header's heart looked like the way in and was a button with no
 * handler, so saved items were unreachable from anywhere in the interface.
 *
 * The list lives in the browser, so the page renders on the client.
 */
export default function WishlistPage() {
  return <WishlistClient />;
}

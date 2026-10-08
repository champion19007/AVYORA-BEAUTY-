/**
 * The redesign's navigation, one list for the menu overlay and the footer.
 * Every entry is an existing route; nothing links to a page that does not
 * exist. The reference's "Careers" has no Avyora counterpart and is dropped.
 */
export const PRIMARY_NAV = [
  { label: 'Shop', href: '/collections' },
  { label: 'Routine finder', href: '/routine-finder' },
  { label: 'Ask Avyora', href: '/assistant' },
  { label: 'Journal', href: '/journal' },
  { label: 'Track order', href: '/track-order' },
] as const;

export const ACCOUNT_NAV = [
  { label: 'Account', href: '/account' },
  { label: 'Orders', href: '/account/orders' },
  { label: 'Wishlist', href: '/wishlist' },
] as const;

export const LEGAL_NAV = [
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refunds', href: '/refund-policy' },
  { label: 'Shipping', href: '/shipping-policy' },
  { label: 'Contact', href: '/contact' },
] as const;

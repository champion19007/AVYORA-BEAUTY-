/**
 * What may be cached, where, and for how long.
 *
 * The hierarchy is L1 (this process) → L2 (Redis, shared) → L3 (Postgres,
 * authoritative). L1 and L2 may vanish at any moment and correctness must not
 * notice; only speed may.
 *
 * Every cached read names one of these policies. There is no way to cache
 * something without choosing one, which is the point: the choice of TTLs is a
 * statement about how stale that data may safely be, and it should be made
 * once, here, with the reasoning next to it.
 *
 * ── Never cached ────────────────────────────────────────────────────────────
 *
 * Deliberately absent from this file, so there is no policy to reach for:
 *
 *   checkout pricing        computed from Postgres on every order
 *   stock reservation       an atomic UPDATE with a quantity guard
 *   payment state           row-locked, state-machine governed
 *   refunds, order creation
 *   permissions             re-read from the environment per request
 *
 * A display cache may say ₹599 while checkout charges ₹649 for the seconds
 * after an offer ends. Checkout is right; the display is merely stale, and the
 * short TTLs below bound for how long.
 */

export type CachePolicy = {
  /** Key prefix, and the unit of invalidation. */
  namespace: string;
  /**
   * Seconds in this process's memory. Also the worst-case staleness *between
   * instances*, since nothing tells another instance's L1 that data changed.
   * Zero means never hold in L1.
   */
  l1Seconds: number;
  /** Seconds in Redis. Explicit invalidation normally ends this early. */
  l2Seconds: number;
};

export const POLICIES = {
  /*
   * Highly cacheable. Changes when someone publishes, and a publish
   * invalidates it explicitly; the TTLs are only a backstop.
   */
  content: { namespace: 'content', l1Seconds: 60, l2Seconds: 3_600 },
  ingredients: { namespace: 'ingredients', l1Seconds: 300, l2Seconds: 86_400 },

  /*
   * Commerce state, for display only. Short L1, because a price or a
   * sold-out badge five seconds stale on one instance is tolerable and a
   * minute is not. Invalidated by `pricing.changed` and `inventory.*` events.
   */
  pricingDisplay: { namespace: 'pricing-display', l1Seconds: 5, l2Seconds: 60 },
  availability: { namespace: 'availability', l1Seconds: 5, l2Seconds: 30 },

  /*
   * Per-person state. Never in L1: a customer who adds to their bag on one
   * instance and reads it back on another would see the old bag for as long
   * as the L1 entry lived. L2 is shared, so an invalidation on write is seen
   * by every instance at once.
   */
  cart: { namespace: 'cart', l1Seconds: 0, l2Seconds: 1_800 },
  wishlist: { namespace: 'wishlist', l1Seconds: 0, l2Seconds: 1_800 },

  /* Derived from a public weather feed; already rate-limited upstream. */
  conditions: { namespace: 'conditions', l1Seconds: 300, l2Seconds: 1_800 },
} as const satisfies Record<string, CachePolicy>;

export type PolicyName = keyof typeof POLICIES;

import { describe, expect, it } from 'vitest';
import { resolvePrice, type PricingRow } from '@/lib/pricing';
import { allProducts } from '@/lib/catalogue';
import { toPaise } from '@/lib/money';

/**
 * Price has two sources of truth, and that is a permanent risk.
 *
 * The catalogue file is compiled into the bundle; `product_pricing` overrides
 * it in the database. That split already produced one real defect: checkout
 * read the file directly and ignored overrides entirely, so an offer could be
 * created, saved, and displayed while every customer was charged the old
 * price. Nothing failed. Nothing logged.
 *
 * A fix alone does not stop that returning — the two sources still exist, and
 * the next person to touch order creation can reach for the catalogue again.
 * These tests state the rule the checkout path must obey, so the regression
 * has to break something visible.
 */

const row = (over: Partial<PricingRow>): PricingRow => ({
  id: 'x',
  productId: 'p',
  size: '30ml',
  price: 100000,
  salePrice: null,
  offerLabel: null,
  offerStartsAt: null,
  offerEndsAt: null,
  updatedBy: 'owner',
  updatedAt: new Date(),
  ...over,
});

describe('price resolution is the single answer', () => {
  it('an override always beats the catalogue', () => {
    const catalogue = toPaise(649);
    const resolved = resolvePrice(catalogue, row({ price: toPaise(799) }));

    expect(resolved.price).toBe(toPaise(799));
    expect(resolved.price).not.toBe(catalogue);
  });

  it('a live offer beats the override, which beats the catalogue', () => {
    const resolved = resolvePrice(
      toPaise(649),
      row({ price: toPaise(799), salePrice: toPaise(599) })
    );

    // Three candidate prices; exactly one may be charged.
    expect(resolved.price).toBe(toPaise(599));
    expect(resolved.wasPrice).toBe(toPaise(799));
  });

  it('falls back to the catalogue only when no override exists', () => {
    const resolved = resolvePrice(toPaise(649), undefined);

    expect(resolved.price).toBe(toPaise(649));
    expect(resolved.overridden).toBe(false);
  });

  it('resolves a real catalogue SKU without an override unchanged', () => {
    // Guards against a fallback that silently rounds or rescales: every
    // catalogue price must survive the resolver untouched.
    for (const product of allProducts().slice(0, 8)) {
      for (const size of product.sizes) {
        const catalogue = toPaise(size.price);
        expect(resolvePrice(catalogue, undefined).price).toBe(catalogue);
      }
    }
  });

  it('never returns a price of zero or below', () => {
    // A zero here would be free goods. Belt and braces around the one number
    // that decides what a customer is charged.
    for (const candidate of [
      resolvePrice(toPaise(649), undefined),
      resolvePrice(toPaise(649), row({})),
      resolvePrice(toPaise(649), row({ salePrice: 1 })),
    ]) {
      expect(candidate.price).toBeGreaterThan(0);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { getProductById } from '@/lib/catalogue';
import { skuKey, skuPrice, type SkuPrice } from '@/modules/catalog/sku-price';
import {
  addLine,
  MAX_QUANTITY_PER_SKU,
  normaliseLines,
  serialiseLines,
  setLineQuantity,
  stockProblems,
  subtotal,
  unitPrice,
  type CartLine,
} from '../cart';

/**
 * The bag as data: which SKU, how many, at what price.
 *
 * The audited defect (#04, #05): on the retinal product page, choosing 90ml at
 * quantity 3 put one unit in the bag, priced at the 30ml amount. The line kept
 * a copy of the product and priced it from the base `price`; Add to Cart
 * passed no quantity. Prices here are derived from the catalogue and the
 * shared pricing rule at test time, never written in, so the test stays true
 * when the catalogue is repriced.
 */

const retinal = getProductById('retinol')!;
const variant = retinal.sizes.find((s) => s.label === '90ml')!;
const KEY = skuKey('retinol', '90ml');

/** A current quote as the availability endpoint would return it, without overrides. */
function catalogueQuote(): Record<string, SkuPrice> {
  return { [KEY]: skuPrice(retinal, '90ml', undefined) };
}

describe('the audited case: 90ml at quantity 3', () => {
  it('needs a variant whose price differs from the base price to mean anything', () => {
    expect(variant).toBeDefined();
    expect(variant.price).not.toBe(retinal.price);
  });

  it('keeps that variant, with all three units', () => {
    const { lines, added } = addLine([], 'retinol', '90ml', 3);
    expect(added).toBe(3);
    expect(lines).toEqual([{ productId: 'retinol', size: '90ml', quantity: 3 }]);
  });

  it('prices it at the variant unit price times three, not the base price', () => {
    const { lines } = addLine([], 'retinol', '90ml', 3);
    const quote = catalogueQuote();
    const unit = quote[KEY].price;

    expect(unitPrice(lines[0], quote)).toMatchObject({ price: unit, confirmed: true });
    expect(subtotal(lines, quote).paise).toBe(unit * 3);
    expect(subtotal(lines, quote).paise).not.toBe(retinal.price * 100 * 3);
  });

  it('uses the variant catalogue price, unconfirmed, before a quote arrives', () => {
    const { lines } = addLine([], 'retinol', '90ml', 3);
    const expected = skuPrice(retinal, '90ml', undefined).price;
    expect(unitPrice(lines[0])).toMatchObject({ price: expected, confirmed: false });
    expect(subtotal(lines)).toEqual({ paise: expected * 3, confirmed: false });
  });
});

describe('price changes', () => {
  it('follows the current quote, not the price when the item was added', () => {
    const { lines } = addLine([], 'retinol', '90ml', 3);
    const before = catalogueQuote()[KEY].price;
    // An owner raises the price after the item went in the bag.
    const raised: Record<string, SkuPrice> = { [KEY]: { price: before + 5_000, wasPrice: null, offerLabel: null } };

    expect(subtotal(lines, raised).paise).toBe((before + 5_000) * 3);
  });

  it('applies an offer to the line it belongs to only', () => {
    const lines: CartLine[] = [
      { productId: 'retinol', size: '30ml', quantity: 1 },
      { productId: 'retinol', size: '90ml', quantity: 1 },
    ];
    const base30 = skuPrice(retinal, '30ml', undefined).price;
    const base90 = skuPrice(retinal, '90ml', undefined).price;
    const quote: Record<string, SkuPrice> = {
      [skuKey('retinol', '30ml')]: { price: base30, wasPrice: null, offerLabel: null },
      [KEY]: { price: base90 - 10_000, wasPrice: base90, offerLabel: 'Offer' },
    };
    expect(subtotal(lines, quote).paise).toBe(base30 + base90 - 10_000);
  });
});

describe('stock and quantity limits', () => {
  it('adds no more than the stock available', () => {
    const result = addLine([], 'retinol', '90ml', 3, 2);
    expect(result).toMatchObject({ added: 2, limitedBy: 'stock' });
    expect(result.lines[0].quantity).toBe(2);
  });

  it('counts what is already in the bag against the stock', () => {
    const first = addLine([], 'retinol', '90ml', 2, 3);
    const second = addLine(first.lines, 'retinol', '90ml', 3, 3);
    expect(second).toMatchObject({ added: 1, limitedBy: 'stock' });
    expect(second.lines[0].quantity).toBe(3);
  });

  it('adds nothing when the size is sold out', () => {
    expect(addLine([], 'retinol', '90ml', 1, 0)).toMatchObject({ added: 0, limitedBy: 'stock', lines: [] });
  });

  it('caps one SKU per order', () => {
    const result = addLine([], 'retinol', '90ml', MAX_QUANTITY_PER_SKU + 5);
    expect(result).toMatchObject({ added: MAX_QUANTITY_PER_SKU, limitedBy: 'per_sku_cap' });
    expect(setLineQuantity(result.lines, 'retinol', '90ml', 99)[0].quantity).toBe(MAX_QUANTITY_PER_SKU);
  });

  it('reports lines over the stock available, treating uncounted SKUs as unavailable', () => {
    const lines: CartLine[] = [
      { productId: 'retinol', size: '90ml', quantity: 3 },
      { productId: 'retinol', size: '30ml', quantity: 1 },
    ];
    expect(stockProblems(lines, { [KEY]: 2 })).toEqual([
      { productId: 'retinol', size: '90ml', quantity: 3, requested: 3, available: 2 },
      { productId: 'retinol', size: '30ml', quantity: 1, requested: 1, available: 0 },
    ]);
  });
});

describe('the default variant and unknown SKUs', () => {
  it('a card adding the first size adds exactly that size', () => {
    const first = retinal.sizes[0].label;
    expect(addLine([], 'retinol', first, 1).lines).toEqual([{ productId: 'retinol', size: first, quantity: 1 }]);
  });

  it('never substitutes another size for an unknown one', () => {
    expect(addLine([], 'retinol', '999ml', 1)).toMatchObject({ added: 0, lines: [] });
    expect(() => skuPrice(retinal, '999ml', undefined)).toThrow('Unknown size');
  });
});

describe('stored bags', () => {
  it('round-trips the current format', () => {
    const lines: CartLine[] = [{ productId: 'retinol', size: '90ml', quantity: 3 }];
    expect(normaliseLines(JSON.parse(serialiseLines(lines)))).toEqual(lines);
  });

  it('migrates the legacy whole-product format, keeping the chosen size', () => {
    const legacy = [{ ...retinal, selectedSize: '90ml', quantity: 3 }];
    expect(normaliseLines(legacy)).toEqual([{ productId: 'retinol', size: '90ml', quantity: 3 }]);
  });

  it('drops what cannot be trusted instead of crashing', () => {
    for (const junk of [null, 42, 'cart', {}, { version: 3, lines: [] }, { version: 2, lines: 'x' }]) {
      expect(normaliseLines(junk)).toEqual([]);
    }
    expect(
      normaliseLines({
        version: 2,
        lines: [
          null,
          { productId: 'no-such-product', size: '30ml', quantity: 1 },
          { productId: 'retinol', size: '999ml', quantity: 1 },
          { productId: 'retinol', size: '90ml', quantity: 0 },
          { productId: 'retinol', size: '90ml', quantity: 1.5 },
          { productId: 'retinol', size: '90ml', quantity: '3' },
          { productId: 'retinol', size: '90ml', quantity: 2 },
        ],
      })
    ).toEqual([{ productId: 'retinol', size: '90ml', quantity: 2 }]);
  });

  it('merges repeated SKUs and caps the total', () => {
    expect(
      normaliseLines([
        { productId: 'retinol', size: '90ml', quantity: 7 },
        { productId: 'retinol', size: '90ml', quantity: 7 },
      ])
    ).toEqual([{ productId: 'retinol', size: '90ml', quantity: MAX_QUANTITY_PER_SKU }]);
  });
});

describe('the pricing rule per size', () => {
  it('applies a catalogue sale only to the size it was set on', () => {
    const onSale = { ...retinal, salePrice: retinal.price - 50 };
    expect(skuPrice(onSale, retinal.sizes[0].label, undefined)).toMatchObject({
      price: (retinal.price - 50) * 100,
      wasPrice: retinal.price * 100,
    });
    expect(skuPrice(onSale, '90ml', undefined)).toMatchObject({ price: variant.price * 100, wasPrice: null });
  });
});

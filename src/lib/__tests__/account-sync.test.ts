import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideSync, type LocalState } from '../account-sync';
import { describeAdjustment, mergeCartLines, mergeWishlists } from '../cart-merge';
import { MAX_QUANTITY_PER_SKU } from '../cart';
import { parseJson, readStorage, writeStorage } from '../safe-storage';

const L = (productId: string, size: string, quantity: number) => ({ productId, size, quantity });

describe('merge policy', () => {
  it('keeps lines from both bags, and the larger quantity where both have a SKU', () => {
    const { lines, adjustments } = mergeCartLines(
      [L('retinol', '90ml', 2), L('face-wash', '150ml', 1)],
      [L('retinol', '90ml', 3), L('retinol', '30ml', 1)]
    );
    expect(lines).toEqual([L('retinol', '90ml', 3), L('face-wash', '150ml', 1), L('retinol', '30ml', 1)]);
    expect(adjustments).toEqual([{ productId: 'retinol', size: '90ml', from: 2, to: 3, reason: 'kept_larger' }]);
  });

  it('is idempotent: merging the same guest bag again changes nothing', () => {
    const account = [L('retinol', '90ml', 2)];
    const guest = [L('retinol', '90ml', 3), L('face-wash', '150ml', 2)];
    const once = mergeCartLines(account, guest).lines;
    const twice = mergeCartLines(once, guest).lines;
    const thrice = mergeCartLines(twice, guest).lines;
    expect(twice).toEqual(once);
    expect(thrice).toEqual(once);
  });

  it('caps at the purchase limit and at counted stock, and says so', () => {
    const { lines, adjustments } = mergeCartLines([], [L('retinol', '90ml', 15), L('face-wash', '150ml', 4), L('retinol', '30ml', 2)], {
      'face-wash::150ml': 1,
      'retinol::30ml': 0,
    });
    expect(lines).toEqual([L('retinol', '90ml', MAX_QUANTITY_PER_SKU), L('face-wash', '150ml', 1)]);
    expect(adjustments.map((a) => [a.productId, a.reason, a.to])).toEqual([
      ['retinol', 'purchase_limit', MAX_QUANTITY_PER_SKU],
      ['face-wash', 'stock', 1],
      ['retinol', 'sold_out', 0],
    ]);
  });

  it('does not cap a SKU whose stock is not counted', () => {
    expect(mergeCartLines([], [L('retinol', '90ml', 4)], {}).lines).toEqual([L('retinol', '90ml', 4)]);
  });

  it('drops SKUs no longer sold, and nonsense quantities', () => {
    const { lines, adjustments } = mergeCartLines([], [L('retinol', '60ml', 1), L('discontinued', '30ml', 1), L('face-wash', '150ml', -2), L('face-wash', '150ml', 1.5)]);
    expect(lines).toEqual([]);
    expect(adjustments.map((a) => a.reason)).toEqual(['unavailable', 'unavailable']);
  });

  it('describes every adjustment in plain words', () => {
    expect(describeAdjustment({ productId: 'retinol', size: '90ml', from: 4, to: 1, reason: 'stock' })).toBe(
      'Only 1 of Encapsulated Retinal Ampoule (90ml) is in stock, so your bag has 1.'
    );
  });

  it('unions wishlists, account first, dropping unknown products', () => {
    expect(mergeWishlists(['retinol', 'face-wash'], ['face-wash', 'nonsense', 'ha-toner'])).toEqual(['retinol', 'face-wash', 'ha-toner']);
  });
});

describe('what the browser does when it learns who is signed in', () => {
  const guest = (over: Partial<LocalState> = {}): LocalState => ({ owner: null, lines: [], wishlist: [], pendingChanges: false, ...over });
  const server = (accountKey: string | null, cart = [L('face-wash', '150ml', 1)], wishlist = ['retinol']) => ({
    accountKey,
    cart: accountKey ? cart : null,
    wishlist: accountKey ? wishlist : null,
  });

  it('a guest stays a guest', () => {
    expect(decideSync(guest({ lines: [L('retinol', '90ml', 1)] }), server(null))).toEqual({ kind: 'keep' });
  });

  it('signing out clears the account’s private bag and wishlist', () => {
    expect(decideSync(guest({ owner: 'acct-A', lines: [L('retinol', '90ml', 1)] }), server(null))).toEqual({ kind: 'clear' });
  });

  it('signing in with a guest bag merges it', () => {
    expect(decideSync(guest({ lines: [L('retinol', '90ml', 1)] }), server('acct-A'))).toEqual({ kind: 'merge', owner: 'acct-A' });
    expect(decideSync(guest({ wishlist: ['retinol'] }), server('acct-A'))).toEqual({ kind: 'merge', owner: 'acct-A' });
  });

  it('signing in with nothing as a guest adopts the account’s saved state', () => {
    expect(decideSync(guest(), server('acct-A'))).toMatchObject({ kind: 'adopt', owner: 'acct-A', lines: [L('face-wash', '150ml', 1)] });
  });

  it('the same account adopts the server copy (another device may have changed it)...', () => {
    expect(decideSync(guest({ owner: 'acct-A', lines: [L('retinol', '90ml', 1)] }), server('acct-A'))).toMatchObject({ kind: 'adopt' });
  });

  it('...unless it has unsent changes of its own', () => {
    expect(decideSync(guest({ owner: 'acct-A', pendingChanges: true }), server('acct-A'))).toEqual({ kind: 'keep' });
  });

  it('a different account on the same page never inherits the previous one’s bag', () => {
    const decision = decideSync(guest({ owner: 'acct-A', lines: [L('retinol', '90ml', 5)], wishlist: ['ha-toner'] }), server('acct-B'));
    expect(decision).toEqual({ kind: 'adopt', owner: 'acct-B', lines: [L('face-wash', '150ml', 1)], wishlist: ['retinol'] });
  });
});

describe('storage that is disabled or throws', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads nothing and writes nothing, without throwing, so the bag works in memory', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(readStorage('avyora.cart.v2')).toBeNull();
    expect(() => writeStorage('avyora.cart.v2', '{}')).not.toThrow();
    expect(() => writeStorage('avyora.cart.v2', null)).not.toThrow();
  });

  it('treats corrupt saved JSON as nothing saved', () => {
    expect(parseJson('{"version":2,"lines":[')).toBeNull();
    expect(parseJson(null)).toBeNull();
  });
});

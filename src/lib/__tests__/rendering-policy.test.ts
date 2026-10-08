import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isPrivatePath, PRIVATE_CACHE_CONTROL } from '../cache-policy';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('@/modules/catalog/storefront-data', () => ({ invalidateStorefrontData: vi.fn(async () => {}) }));
vi.mock('@/modules/cms/content-read', () => ({ invalidateContent: vi.fn(async () => {}) }));
const { revalidateContent, revalidateProduct } = await import('../storefront-cache');

describe('private cache isolation', () => {
  it.each([
    '/account', '/account/orders', '/checkout', '/orders/AVY-ABC123', '/orders/AVY-ABC123/invoice',
    '/login', '/signup', '/track-order', '/admin', '/admin/pricing', '/admin-login', '/manager/stock',
    '/api/cart', '/api/wishlist', '/api/account/deliver-to', '/api/auth/session', '/api/payments/razorpay/create',
  ])('%s is never stored by a shared cache', (path) => {
    expect(isPrivatePath(path)).toBe(true);
  });

  it.each(['/', '/collections', '/products/retinol', '/journal', '/journal/some-article', '/privacy', '/routine-finder', '/api/catalog/availability', '/accounting'])(
    '%s stays cacheable',
    (path) => {
      expect(isPrivatePath(path)).toBe(false);
    }
  );

  it('uses a header no shared cache may store', () => {
    expect(PRIVATE_CACHE_CONTROL).toMatch(/private/);
    expect(PRIVATE_CACHE_CONTROL).toMatch(/no-store/);
  });
});

describe('publication invalidates the public pages that show it', () => {
  beforeEach(() => revalidatePath.mockClear());

  it('product copy: its product page', async () => {
    await revalidateContent('product_copy', 'retinol');
    expect(revalidatePath.mock.calls.flat()).toEqual(['/products/retinol']);
  });

  it('an article: its page, the journal and the sitemap', async () => {
    await revalidateContent('article', 'how-to-patch-test');
    expect(revalidatePath.mock.calls.flat().sort()).toEqual(['/journal', '/journal/how-to-patch-test', '/sitemap.xml']);
  });

  it('a price or stock change: the product page, the listing and home', async () => {
    await revalidateProduct('retinol');
    expect(revalidatePath.mock.calls.flat().sort()).toEqual(['/', '/collections', '/products/retinol']);
  });
});

describe('vision libraries load only on entering a scan', () => {
  const VISION = /['"](@tensorflow\/[^'"]+|@mediapipe\/[^'"]+|onnxruntime-web|@huggingface\/transformers|face-api\.js|opencv\.js)['"]/;

  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = join(dir, n);
      return statSync(full).isDirectory() ? (n === '__tests__' ? [] : files(full)) : /\.tsx?$/.test(n) ? [full] : [];
    });

  it('no source file imports one statically; only `await import(...)` inside scan code is allowed', () => {
    const offenders = files('src').filter((f) => {
      const src = readFileSync(f, 'utf8');
      return src.split('\n').some((line) => VISION.test(line) && /^\s*import\s/.test(line));
    });
    expect(offenders).toEqual([]);
  });

  it('none is a dependency today', () => {
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toMatch(VISION);
  });
});

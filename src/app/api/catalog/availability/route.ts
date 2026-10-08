import { NextResponse } from 'next/server';
import { limit, limitResponse } from '@/lib/rate-limit';
import { trustedClientIp } from '@/lib/client-ip';
import { createHash } from 'node:crypto';
import { isDatabaseConfigured } from '@/db';
import { isKnownSku } from '@/lib/cart';
import { catalogueStock, displayPrices } from '@/modules/catalog/storefront-data';
import type { SkuPrice } from '@/modules/catalog/sku-price';

/**
 * Current display prices and stock for the SKUs in a bag.
 *
 *   GET /api/catalog/availability?skus=retinol::90ml,ha-toner::200ml
 *
 * Public and short-cached: it carries catalogue facts, nothing personal. It is
 * a quote for display, not a promise — checkout recomputes prices from
 * Postgres and reserves stock in its own transaction, and refuses an order
 * whose prices moved since the customer saw them.
 *
 * `stock` is null when the shop has no inventory to report (no database);
 * clients must then not treat every SKU as sold out.
 */
export const runtime = 'nodejs';

const MAX_SKUS = 50;
const QUOTE_SECONDS = 60;

export type AvailabilityResponse = {
  prices: Record<string, SkuPrice>;
  stock: Record<string, number> | null;
  quoteVersion: string;
  validUntil: string;
};

export async function GET(request: Request) {
  // Reached only on a CDN miss. IP plus the cart session; fails open, since
  // this is a cached, cheap read and refusing it on an outage helps no one.
  const session = /(?:^|;\s*)avyora_cart_id=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
  const limited = await limit([
    { policy: 'catalogBatch', subject: { kind: 'ip', address: trustedClientIp(request.headers) } },
    ...(session ? [{ policy: 'catalogBatch' as const, subject: { kind: 'identifier' as const, value: `cart:${session}` } }] : []),
  ]);
  if (!limited.allowed) return limitResponse(limited);

  const param = new URL(request.url).searchParams.get('skus') ?? '';
  const requested = [...new Set(param.split(',').map((s) => s.trim()).filter(Boolean))];

  if (requested.length > MAX_SKUS) {
    return NextResponse.json({ error: `At most ${MAX_SKUS} SKUs per request.` }, { status: 413 });
  }

  const keys = requested.filter((key) => {
    const [productId, size] = key.split('::');
    return Boolean(productId && size && isKnownSku(productId, size));
  });

  const [allPrices, allStock] = await Promise.all([displayPrices(), catalogueStock()]);

  const prices: Record<string, SkuPrice> = {};
  for (const key of keys) prices[key] = allPrices[key];

  let stock: Record<string, number> | null = null;
  if (isDatabaseConfigured()) {
    stock = {};
    // Uncounted SKUs are 0: checkout refuses them, so the bag should say so.
    for (const key of keys) stock[key] = allStock[key] ?? 0;
  }

  const quoteVersion = createHash('sha256').update(JSON.stringify({ prices, stock })).digest('hex').slice(0, 16);
  const body: AvailabilityResponse = {
    prices,
    stock,
    quoteVersion,
    validUntil: new Date(Date.now() + QUOTE_SECONDS * 1000).toISOString(),
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' },
  });
}

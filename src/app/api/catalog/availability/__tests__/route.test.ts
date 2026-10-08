import { describe, it, expect, vi } from 'vitest';

// No database: catalogue prices, and no stock to report.
vi.mock('@/db', () => ({ db: {}, isDatabaseConfigured: () => false }));

const { GET } = await import('../route');
const { getProductById } = await import('@/lib/catalogue');
const { skuPrice } = await import('@/modules/catalog/sku-price');

const get = (skus: string) => GET(new Request(`http://test/api/catalog/availability?skus=${encodeURIComponent(skus)}`));

describe('GET /api/catalog/availability', () => {
  it('quotes each requested SKU at its own size price', async () => {
    const res = await get('retinol::90ml,retinol::30ml');
    const body = await res.json();
    const retinal = getProductById('retinol')!;
    expect(body.prices['retinol::90ml']).toEqual(skuPrice(retinal, '90ml', undefined));
    expect(body.prices['retinol::30ml']).toEqual(skuPrice(retinal, '30ml', undefined));
    expect(body.quoteVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(new Date(body.validUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('reports no stock, rather than everything sold out, with no inventory to read', async () => {
    expect((await (await get('retinol::90ml')).json()).stock).toBeNull();
  });

  it('ignores SKUs that do not exist', async () => {
    const body = await (await get('retinol::999ml,nothing::30ml,retinol')).json();
    expect(body.prices).toEqual({});
  });

  it('refuses more than 50 SKUs', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `p${i}::30ml`).join(',');
    expect((await get(many)).status).toBe(413);
  });
});

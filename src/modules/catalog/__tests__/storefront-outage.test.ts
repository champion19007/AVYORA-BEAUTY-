import { describe, expect, it, vi } from 'vitest';

// The database is "configured" but every query fails, as when Postgres is down.
vi.mock('@/db', () => ({ isDatabaseConfigured: () => true, db: {} }));
vi.mock('@/lib/inventory', () => ({ getStockMap: vi.fn(async () => Promise.reject(new Error('connection refused'))) }));
vi.mock('@/lib/pricing', () => ({ pricingMap: vi.fn(async () => Promise.reject(new Error('connection refused'))) }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn(), logEvent: vi.fn() }));

const { catalogueStock, displayPrices } = await import('../storefront-data');
const { reportError } = await import('@/lib/observability');

describe('storefront during a database outage', () => {
  it('still renders: list prices, nothing in stock, and the failure reported', async () => {
    const prices = await displayPrices();
    expect(Object.keys(prices).length).toBeGreaterThan(0);
    expect(await catalogueStock()).toEqual({});
    expect(vi.mocked(reportError)).toHaveBeenCalledTimes(2);
  });

  it('checkout (fresh) still fails loudly rather than guessing', async () => {
    await expect(catalogueStock({ fresh: true })).rejects.toThrow('connection refused');
    await expect(displayPrices({ fresh: true })).rejects.toThrow('connection refused');
  });
});

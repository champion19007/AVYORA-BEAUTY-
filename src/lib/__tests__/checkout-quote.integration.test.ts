import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { inventory, orderItems, orders } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * Checkout charges the selected SKU, at its current price, for every unit —
 * and refuses rather than surprises.
 *
 * Expected amounts are computed from the catalogue and the pricing command at
 * test time, never written in.
 */

const { client, db } = await createMigratedDb();

vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/background', () => ({ runBackgroundQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));

const { createOrder } = await import('@/lib/orders');
const { setPrice } = await import('@/modules/catalog/pricing-commands');
const { displayPrices } = await import('@/modules/catalog/storefront-data');
const { getProductById } = await import('@/lib/catalogue');
const { skuPrice } = await import('@/modules/catalog/sku-price');

const owner = { id: 'owner', role: 'owner' };
const SKU = { productId: 'retinol', size: '90ml' };
const KEY = `${SKU.productId}::${SKU.size}`;
const retinal = getProductById('retinol')!;
const cataloguePaise = skuPrice(retinal, '90ml', undefined).price;

const CHECKOUT = {
  email: 'priya@example.com',
  paymentMethod: 'cod' as const,
  address: {
    fullName: 'Priya Sharma',
    line1: 'Flat 402, Sunrise Residency',
    line2: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400059',
    country: 'IN',
    phone: '9876543210',
  },
};

/** What the checkout page shows for the SKU right now. */
async function shownUnitPaise() {
  return (await displayPrices({ fresh: true }))[KEY].price;
}

async function stock() {
  const [row] = await db.select().from(inventory).where(sql`${inventory.productId} = ${SKU.productId} and ${inventory.size} = ${SKU.size}`);
  return row.quantity;
}

async function raisePriceBy(paise: number) {
  const result = await setPrice(
    { ...SKU, price: cataloguePaise + paise, salePrice: null, offerLabel: null, offerEndsAt: null, expectedVersion: 0 },
    owner
  );
  if (!result.ok) throw new Error(result.message);
}

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate product_pricing, orders, order_items, addresses, inventory, domain_events, audit_logs restart identity cascade`);
  await db.insert(inventory).values({ ...SKU, quantity: 10 });
});

describe('the audited case at checkout', () => {
  it('orders 90ml x3 at the current 90ml price, with all three units', async () => {
    await raisePriceBy(1_000); // an owner override, so "current" is not the catalogue figure
    const unit = await shownUnitPaise();
    expect(unit).toBe(cataloguePaise + 1_000);

    const result = await createOrder({ ...CHECKOUT, items: [{ ...SKU, quantity: 3, expectedUnitPaise: unit }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, result.orderId));
    expect(line).toMatchObject({ size: '90ml', variantId: 'retinol-90ml', quantity: 3, unitPrice: unit, lineTotal: unit * 3 });
    expect(line.unitPrice).not.toBe(retinal.price * 100);
    expect(await stock()).toBe(7);
  });
});

describe('price changes before submission', () => {
  it('refuses an order whose price moved since it was shown, and reserves nothing', async () => {
    const shown = await shownUnitPaise();
    await raisePriceBy(5_000);

    const result = await createOrder({ ...CHECKOUT, items: [{ ...SKU, quantity: 3, expectedUnitPaise: shown }] });

    expect(result).toMatchObject({ ok: false, code: 'price_changed' });
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await stock()).toBe(10);
  });

  it('accepts the order once the customer has seen the new price', async () => {
    await raisePriceBy(5_000);
    const result = await createOrder({
      ...CHECKOUT,
      items: [{ ...SKU, quantity: 3, expectedUnitPaise: await shownUnitPaise() }],
    });
    expect(result.ok).toBe(true);
  });

  it('still accepts a client that sends no quoted price', async () => {
    const result = await createOrder({ ...CHECKOUT, items: [{ ...SKU, quantity: 1 }] });
    expect(result.ok).toBe(true);
  });
});

describe('stock limits', () => {
  it('refuses more than is in stock, by name, and reserves nothing', async () => {
    await db.update(inventory).set({ quantity: 2 }).where(sql`${inventory.productId} = ${SKU.productId}`);

    const result = await createOrder({
      ...CHECKOUT,
      items: [{ ...SKU, quantity: 3, expectedUnitPaise: await shownUnitPaise() }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Only 2 left');
    expect(result.error).toContain('90ml');
    expect(await stock()).toBe(2);
  });
});

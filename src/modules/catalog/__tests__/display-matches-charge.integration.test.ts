import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { inventory, orderItems } from '@/db/schema';
import { createMigratedDb } from '@/test/migrated-db';

/**
 * What a customer is shown equals what they are charged.
 *
 * The defect this pins: every storefront price came from the compiled
 * catalogue while checkout charged the owner's override. A raised price was
 * shown low and charged high; an offer was charged and never shown.
 *
 * Also pins the cache contract: the display may be cached, but an owner's edit
 * invalidates it, and checkout never reads the cache at all.
 */

const { client, db } = await createMigratedDb();

vi.mock('@/db', () => ({ db, getDatabase: () => db, isDatabaseConfigured: () => true }));
vi.mock('@/lib/activity', () => ({ recordEvent: async () => {} }));
vi.mock('@/lib/event-consumers', () => ({ drainQuietly: async () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { displayPrices, invalidateStorefrontData } = await import('../storefront-data');
const { setPrice } = await import('../pricing-commands');
const { createOrder } = await import('@/lib/orders');
const { cache } = await import('@/infrastructure/cache');

const owner = { id: 'owner', role: 'owner' };
const SKU = { productId: 'rice-bran-cleansing-oil', size: '150ml' };
const KEY = `${SKU.productId}::${SKU.size}`;

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
  items: [{ ...SKU, quantity: 1 }],
};

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pglite/test';
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.execute(sql`truncate product_pricing, orders, order_items, addresses, inventory, domain_events, audit_logs restart identity cascade`);
  await db.insert(inventory).values({ ...SKU, quantity: 50 });
  cache.clearLocal();
});

async function charged(): Promise<number> {
  const order = await createOrder(CHECKOUT);
  if (!order.ok) throw new Error(order.error);
  const [line] = await db.select().from(orderItems).where(sql`${orderItems.orderId} = ${order.orderId}`);
  return line.unitPrice;
}

describe('display matches charge', () => {
  it('shows the catalogue price and charges it when nothing is overridden', async () => {
    const shown = (await displayPrices())[KEY].price;
    expect(await charged()).toBe(shown);
  });

  it('shows a raised price, not the catalogue one, and charges the same', async () => {
    await setPrice(
      { ...SKU, price: 79_900, salePrice: null, offerLabel: null, offerEndsAt: null, expectedVersion: 0 },
      owner
    );
    await invalidateStorefrontData();

    const shown = (await displayPrices())[KEY];
    expect(shown.price).toBe(79_900);
    expect(await charged()).toBe(79_900);
  });

  it('shows an offer with its struck-out price and label, and charges the offer', async () => {
    await setPrice(
      {
        ...SKU,
        price: 64_900,
        salePrice: 54_900,
        offerLabel: 'Festive',
        offerEndsAt: new Date(Date.now() + 86_400_000),
        expectedVersion: 0,
      },
      owner
    );
    await invalidateStorefrontData();

    const shown = (await displayPrices())[KEY];
    expect(shown).toEqual({ price: 54_900, wasPrice: 64_900, offerLabel: 'Festive' });
    expect(await charged()).toBe(54_900);
  });

  it('serves the cached display until the edit invalidates it', async () => {
    const before = (await displayPrices())[KEY].price;

    await setPrice(
      { ...SKU, price: before + 10_000, salePrice: null, offerLabel: null, offerEndsAt: null, expectedVersion: 0 },
      owner
    );

    // Still cached: display is allowed to lag an edit it has not been told about.
    expect((await displayPrices())[KEY].price).toBe(before);
    // Checkout does not read the cache, so the charge is already correct.
    expect(await charged()).toBe(before + 10_000);

    await invalidateStorefrontData();
    expect((await displayPrices())[KEY].price).toBe(before + 10_000);
  });

  it('bypasses the cache when asked for fresh prices, as the checkout page does', async () => {
    const before = (await displayPrices())[KEY].price;
    await setPrice(
      { ...SKU, price: before + 5_000, salePrice: null, offerLabel: null, offerEndsAt: null, expectedVersion: 0 },
      owner
    );
    expect((await displayPrices({ fresh: true }))[KEY].price).toBe(before + 5_000);
  });

  it('records why the line cost what it did', async () => {
    await setPrice(
      {
        ...SKU,
        price: 64_900,
        salePrice: 54_900,
        offerLabel: 'Festive',
        offerEndsAt: new Date(Date.now() + 86_400_000),
        expectedVersion: 0,
      },
      owner
    );
    const order = await createOrder(CHECKOUT);
    if (!order.ok) throw new Error(order.error);
    const [line] = await db.select().from(orderItems);
    expect(line.pricingSnapshot).toMatchObject({
      chargedPaise: 54_900,
      wasPaise: 64_900,
      source: 'offer',
      offerLabel: 'Festive',
      pricingVersion: 1,
    });
  });
});

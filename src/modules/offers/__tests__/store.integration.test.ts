import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';

// pricingMap reads the app's db; point it at no overrides so catalogue prices apply.
vi.mock('@/lib/pricing', () => ({ pricingMap: async () => new Map() }));

const { quoteBag, saveOffer, setOfferActive, listOffers, offerInputSchema } = await import('../store');

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const db = () => ctx.db as never;
// The sample gel cleanser: ₹349 for 150ml.
const wash = { productId: 'face-wash', size: '150ml', unitPrice: 34900, quantity: 2 };

const offer = (over: Record<string, unknown> = {}) =>
  offerInputSchema.parse({
    name: 'Launch 10%',
    kind: 'percent_off',
    percentOff: 10,
    amountRupees: null,
    buyQty: null,
    getQty: null,
    productIds: ['face-wash'],
    minSubtotalRupees: 0,
    minQuantity: 1,
    couponCode: '',
    firstOrderOnly: false,
    maxUses: null,
    startsAt: null,
    endsAt: null,
    active: true,
    ...over,
  });

beforeAll(async () => {
  ctx = await createMigratedDb();
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});
beforeEach(async () => {
  await ctx.client.exec(`DELETE FROM offers; DELETE FROM orders; UPDATE catalog_variants SET cost_paise = NULL;`);
});
const setCost = (paise: number) =>
  ctx.client.exec(`UPDATE catalog_variants SET cost_paise = ${paise} WHERE legacy_stock_key = 'face-wash::150ml'`);

describe('offers store', () => {
  it('refuses to start an offer on a product without a cost price', async () => {
    const r = await saveOffer(db(), offer(), 'owner');
    expect(r).toMatchObject({ ok: false, errors: [expect.stringContaining('Add a cost price')] });
  });

  it('refuses an offer below the floor, accepts one above it, and quotes it', async () => {
    await setCost(10000); // floor ₹144.49
    expect((await saveOffer(db(), offer({ percentOff: 70 }), 'owner')).ok).toBe(false);
    expect((await saveOffer(db(), offer(), 'owner')).ok).toBe(true);
    const q = await quoteBag(db(), [wash], { email: 'a@example.test' });
    expect(q.applied).toMatchObject({ name: 'Launch 10%', itemDiscount: 6980 });
  });

  it('a coupon needs its code; first-order offers skip returning customers', async () => {
    await setCost(10000);
    await saveOffer(db(), offer({ couponCode: 'welcome', firstOrderOnly: true }), 'owner');
    expect((await quoteBag(db(), [wash], { email: 'a@example.test' })).applied).toBeNull();
    expect((await quoteBag(db(), [wash], { email: 'a@example.test', code: 'WELCOME' })).applied).not.toBeNull();
    await ctx.client.exec(
      `INSERT INTO orders (id, order_number, email, subtotal, total) VALUES ('o1', 'AVY-OLD001', 'a@example.test', 1, 1)`
    );
    const back = await quoteBag(db(), [wash], { email: 'a@example.test', code: 'WELCOME' });
    expect(back).toMatchObject({ applied: null, codeProblem: 'That code is for a first order only.' });
  });

  it('stops after its use limit, counting orders placed with it', async () => {
    await setCost(10000);
    const saved = await saveOffer(db(), offer({ maxUses: 1 }), 'owner');
    if (!saved.ok) throw new Error('setup');
    await ctx.client.exec(
      `INSERT INTO orders (id, order_number, email, subtotal, total, offer_id) VALUES ('o2', 'AVY-USE001', 'b@example.test', 1, 1, '${saved.id}')`
    );
    expect((await listOffers(db()))[0].used).toBe(1);
    expect((await quoteBag(db(), [wash], { email: 'c@example.test' })).applied).toBeNull();
  });

  it('switching an offer back on re-checks profit against today’s costs', async () => {
    await setCost(10000);
    const saved = await saveOffer(db(), offer({ percentOff: 50 }), 'owner');
    if (!saved.ok) throw new Error('setup');
    await setOfferActive(db(), saved.id, false, 'owner');
    await setCost(20000); // the cost went up: 50% off would now lose money
    expect((await setOfferActive(db(), saved.id, true, 'owner')).ok).toBe(false);
  });
});

describe('promotions shown on the shop', () => {
  it('shows running automatic offers only: no coupons, nothing switched off or used up', async () => {
    await setCost(10000);
    const { activePromotions } = await import('../store');
    await saveOffer(
      db(),
      offer({ name: 'Buy 2, get 1 free', kind: 'buy_x_get_y', percentOff: null, buyQty: 2, getQty: 1 }),
      'owner'
    );
    await saveOffer(db(), offer({ name: 'Secret', couponCode: 'VIP' }), 'owner');
    await saveOffer(db(), offer({ name: 'Paused', active: false }), 'owner');
    const shown = await activePromotions(db());
    expect(shown.map((p) => p.name)).toEqual(['Buy 2, get 1 free']);
    expect(shown[0]).toMatchObject({ buyQty: 2, getQty: 1, productIds: ['face-wash'] });
  });
});

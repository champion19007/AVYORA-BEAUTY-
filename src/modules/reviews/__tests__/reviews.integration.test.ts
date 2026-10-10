import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDb } from '@/test/migrated-db';
import { moderateReview, pendingReviews, productReviews, reviewInputSchema, submitReview } from '../reviews';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
const db = () => ctx.db as never;
const P = 'rice-bran-cleansing-oil';
const review = { productId: P, rating: 4, body: 'Gentle, rinses clean, no tightness after a month.' };

beforeAll(async () => {
  ctx = await createMigratedDb();
  await ctx.client.exec(`
    INSERT INTO users (id, email) VALUES ('u-buyer', 'buyer@example.test'), ('u-pending', 'p@example.test'), ('u-none', 'n@example.test');
    INSERT INTO orders (id, order_number, email, subtotal, total, user_id, status) VALUES
      ('o-delivered', 'AVY-DLV001', 'buyer@example.test', 100, 100, 'u-buyer', 'delivered'),
      ('o-shipped', 'AVY-SHP001', 'p@example.test', 100, 100, 'u-pending', 'shipped');
    INSERT INTO order_items (order_id, product_id, product_name, size, unit_price, quantity, line_total) VALUES
      ('o-delivered', '${P}', 'Oil', '150ml', 100, 1, 100),
      ('o-shipped', '${P}', 'Oil', '150ml', 100, 1, 100);
  `);
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});
beforeEach(async () => {
  await ctx.client.exec('DELETE FROM reviews');
});

describe('verified-purchase reviews', () => {
  it('accepts only an account with a delivered order of the product', async () => {
    expect(await submitReview(db(), 'u-none', review)).toEqual({ ok: false, code: 'not_verified' });
    expect(await submitReview(db(), 'u-pending', review)).toEqual({ ok: false, code: 'not_verified' });
    expect(await submitReview(db(), 'u-buyer', { ...review, productId: 'retinal-ampoule' })).toEqual({
      ok: false,
      code: 'not_verified',
    });
    const ok = await submitReview(db(), 'u-buyer', review);
    expect(ok.ok).toBe(true);
    const [row] = (
      await ctx.client.query<{ order_id: string; published: boolean }>('SELECT order_id, published FROM reviews')
    ).rows;
    expect(row).toEqual({ order_id: 'o-delivered', published: false });
  });

  it('allows one review per product and shows nothing until published', async () => {
    const first = await submitReview(db(), 'u-buyer', review);
    expect(await submitReview(db(), 'u-buyer', review)).toEqual({ ok: false, code: 'exists' });
    expect(await productReviews(db(), P)).toEqual({ count: 0, average: null, items: [] });
    if (!first.ok) throw new Error('setup');
    expect(await pendingReviews(db())).toHaveLength(1);
    expect(await moderateReview(db(), first.id, 'publish')).toBe(true);
    expect(await moderateReview(db(), first.id, 'publish')).toBe(false);
    expect(await productReviews(db(), P)).toMatchObject({ count: 1, average: 4 });
  });

  it('rejecting deletes the review so the customer may write again', async () => {
    const first = await submitReview(db(), 'u-buyer', review);
    if (!first.ok) throw new Error('setup');
    expect(await moderateReview(db(), first.id, 'reject')).toBe(true);
    expect(await pendingReviews(db())).toHaveLength(0);
    expect((await submitReview(db(), 'u-buyer', review)).ok).toBe(true);
  });

  it('bounds the input', () => {
    expect(reviewInputSchema.safeParse({ ...review, rating: 6 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, body: 'short' }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, orderId: 'o-delivered' }).success).toBe(false);
  });
});

describe('listing aggregates (re-audit A19)', () => {
  it('count only published reviews, per product', async () => {
    const { reviewAggregates } = await import('../reviews');
    expect(await reviewAggregates(db())).toEqual({});
    const first = await submitReview(db(), 'u-buyer', review);
    expect(await reviewAggregates(db())).toEqual({});
    if (!first.ok) throw new Error('setup');
    await moderateReview(db(), first.id, 'publish');
    expect(await reviewAggregates(db())).toEqual({ [P]: { count: 1, average: 4 } });
  });
});

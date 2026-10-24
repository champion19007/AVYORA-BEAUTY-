import { and, avg, count, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as schema from '@/db/schema';

/**
 * Customer reviews: any signed-in customer, moderated before publication.
 *
 * A review is linked to the reviewer's delivered order of the product when
 * there is one, and then shown as a verified purchase. It is stored
 * unpublished; the owner publishes or rejects it, and can hide a published
 * one again. Only published reviews are shown or counted, so the product
 * rating is never seeded or invented.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const r = schema.reviews;

export const reviewInputSchema = z
  .object({
    productId: z.string().regex(/^[a-z0-9-]{1,80}$/),
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().min(20).max(2000),
  })
  .strict();
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** The user's most recent delivered order containing the product, or null. */
export async function verifiedOrder(db: Db, userId: string, productId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orders.userId, userId),
        eq(schema.orders.status, 'delivered'),
        eq(schema.orderItems.productId, productId)
      )
    )
    .orderBy(desc(schema.orders.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function submitReview(
  db: Db,
  userId: string,
  input: ReviewInput
): Promise<{ ok: true; id: string; verified: boolean } | { ok: false; code: 'exists' }> {
  const orderId = await verifiedOrder(db, userId, input.productId);
  const [row] = await db
    .insert(r)
    .values({
      productId: input.productId,
      userId,
      orderId,
      rating: input.rating,
      title: input.title || null,
      body: input.body,
      published: false,
    })
    .onConflictDoNothing()
    .returning({ id: r.id });
  return row ? { ok: true, id: row.id, verified: orderId !== null } : { ok: false, code: 'exists' };
}

/** Awaiting moderation, oldest first. Shows the text only; no reviewer contact details. */
export async function pendingReviews(db: Db) {
  return db
    .select({
      id: r.id,
      productId: r.productId,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verified: sql<boolean>`${r.orderId} IS NOT NULL`,
      createdAt: r.createdAt,
    })
    .from(r)
    .where(eq(r.published, false))
    .orderBy(r.createdAt)
    .limit(100);
}

/**
 * Publish shows the review; hide takes a published one down again (it goes
 * back to waiting); reject deletes an unpublished one, so the customer may
 * write a new one.
 */
export async function moderateReview(db: Db, id: string, decision: 'publish' | 'hide' | 'reject'): Promise<boolean> {
  const rows =
    decision === 'publish'
      ? await db
          .update(r)
          .set({ published: true })
          .where(and(eq(r.id, id), eq(r.published, false)))
          .returning({ id: r.id })
      : decision === 'hide'
        ? await db
            .update(r)
            .set({ published: false })
            .where(and(eq(r.id, id), eq(r.published, true)))
            .returning({ id: r.id })
        : await db
            .delete(r)
            .where(and(eq(r.id, id), eq(r.published, false)))
            .returning({ id: r.id });
  return rows.length > 0;
}

/** Published reviews across all products, newest first, for the owner to manage. */
export async function publishedReviews(db: Db) {
  return db
    .select({
      id: r.id,
      productId: r.productId,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verified: sql<boolean>`${r.orderId} IS NOT NULL`,
      createdAt: r.createdAt,
    })
    .from(r)
    .where(eq(r.published, true))
    .orderBy(desc(r.createdAt))
    .limit(200);
}

/** Published reviews and the aggregate derived from them alone. */
export async function productReviews(db: Db, productId: string) {
  const where = and(eq(r.productId, productId), eq(r.published, true));
  const [[agg], items] = await Promise.all([
    db
      .select({ n: count(), mean: avg(r.rating) })
      .from(r)
      .where(where),
    db
      .select({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verified: sql<boolean>`${r.orderId} IS NOT NULL`,
        // First name only: enough to read as a real person, not enough to identify one.
        author: sql<string | null>`nullif(split_part(trim(${schema.users.name}), ' ', 1), '')`,
        createdAt: r.createdAt,
      })
      .from(r)
      .leftJoin(schema.users, eq(schema.users.id, r.userId))
      .where(where)
      .orderBy(desc(r.createdAt))
      .limit(20),
  ]);
  const n = Number(agg?.n ?? 0);
  return { count: n, average: n ? Math.round(Number(agg.mean) * 10) / 10 : null, items };
}

export type ReviewAggregate = { count: number; average: number };

/** Published-review count and average per product, in one query, for listings and sorting (re-audit A19). */
export async function reviewAggregates(db: Db): Promise<Record<string, ReviewAggregate>> {
  const rows = await db
    .select({ productId: r.productId, n: count(), mean: avg(r.rating) })
    .from(r)
    .where(eq(r.published, true))
    .groupBy(r.productId);
  return Object.fromEntries(
    rows
      .filter((x) => Number(x.n) > 0)
      .map((x) => [x.productId, { count: Number(x.n), average: Math.round(Number(x.mean) * 10) / 10 }])
  );
}

import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as schema from '@/db/schema';
import { PRODUCTS } from '@/data/mock-data';
import { pricingMap } from '@/lib/pricing';
import { skuKey, skuPrice } from '@/modules/catalog/sku-price';
import {
  bestOffer,
  normaliseCode,
  offerLive,
  offerProblems,
  OFFER_KINDS,
  type Offer,
  type QuoteLine,
  type QuoteResult,
} from './engine';
import { getProfitSettings } from './settings';
import { toPromotion, type Promotion } from './promotions';

/**
 * Offers in the database: saving them (with the profit check), and quoting
 * a bag at checkout with authoritative prices and costs.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const O = schema.offers;

const toOffer = (r: typeof O.$inferSelect): Offer => ({
  id: r.id,
  name: r.name,
  kind: r.kind as Offer['kind'],
  percentOff: r.percentOff,
  amountPaise: r.amountPaise,
  buyQty: r.buyQty,
  getQty: r.getQty,
  productIds: r.productIds,
  minSubtotalPaise: r.minSubtotalPaise,
  minQuantity: r.minQuantity,
  couponCode: r.couponCode,
  firstOrderOnly: r.firstOrderOnly,
  maxUses: r.maxUses,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  active: r.active,
});

/** Orders placed with each offer (cancelled ones do not count). */
async function usageCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ offerId: schema.orders.offerId, n: count() })
    .from(schema.orders)
    .where(ne(schema.orders.status, 'cancelled'))
    .groupBy(schema.orders.offerId);
  return Object.fromEntries(rows.filter((r) => r.offerId).map((r) => [r.offerId!, Number(r.n)]));
}

export type OfferRow = Offer & { used: number; createdAt: Date };

export async function listOffers(db: Db): Promise<OfferRow[]> {
  const [rows, usage] = await Promise.all([db.select().from(O).orderBy(desc(O.createdAt)), usageCounts(db)]);
  return rows.map((r) => ({ ...toOffer(r), used: usage[r.id] ?? 0, createdAt: r.createdAt }));
}

/** Cost per unit for every SKU that has one, by `product::size`. */
async function costMap(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ key: schema.catalogVariants.legacyStockKey, cost: schema.catalogVariants.costPaise })
    .from(schema.catalogVariants);
  return new Map(rows.filter((r) => r.cost !== null).map((r) => [r.key, r.cost!]));
}

/** Whether this customer has ordered before (by account, email or phone). */
async function isFirstOrder(db: Db, who: { userId?: string | null; email: string; phone?: string }): Promise<boolean> {
  const conditions = [eq(schema.orders.email, who.email.trim().toLowerCase())];
  if (who.userId) conditions.push(eq(schema.orders.userId, who.userId));
  const [row] = await db
    .select({ n: count() })
    .from(schema.orders)
    .where(and(or(...conditions), ne(schema.orders.status, 'cancelled')));
  return Number(row?.n ?? 0) === 0;
}

export type BagLine = { productId: string; size: string; unitPrice: number; quantity: number };

/** The best offer for a bag whose prices were already resolved from the database. */
export async function quoteBag(
  db: Db,
  lines: BagLine[],
  opts: { code?: string | null; email?: string; userId?: string | null }
): Promise<QuoteResult> {
  const [rows, usage, costs, settings] = await Promise.all([
    db.select().from(O).where(eq(O.active, true)),
    usageCounts(db),
    costMap(db),
    getProfitSettings(db),
  ]);
  if (rows.length === 0) {
    return { applied: null, codeProblem: opts.code?.trim() ? 'That code is not valid right now.' : null };
  }
  const quoteLines: QuoteLine[] = lines.map((l) => ({
    ...l,
    costPaise: costs.get(skuKey(l.productId, l.size)) ?? null,
  }));
  // Without an email yet (the bag, before checkout), first-order offers are shown as if it were a first order.
  const firstOrder = opts.email ? await isFirstOrder(db, { userId: opts.userId, email: opts.email }) : true;
  return bestOffer({
    lines: quoteLines,
    offers: rows.map(toOffer),
    code: opts.code,
    isFirstOrder: firstOrder,
    usage,
    settings,
  });
}

/** Resolves bag items to authoritative prices, then quotes them. For the checkout page's preview. */
export async function quoteItems(
  db: Db,
  items: { productId: string; size: string; quantity: number }[],
  opts: { code?: string | null; email?: string; userId?: string | null }
) {
  const prices = await pricingMap();
  const lines: BagLine[] = [];
  for (const item of items) {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    if (!product?.sizes.some((s) => s.label === item.size)) continue;
    const price = skuPrice(product, item.size, prices.get(skuKey(item.productId, item.size))).price;
    lines.push({ productId: item.productId, size: item.size, unitPrice: price, quantity: item.quantity });
  }
  return quoteBag(db, lines, opts);
}

/* -------------------------------------------------------------------------- */
/* Saving                                                                      */
/* -------------------------------------------------------------------------- */

const rupees = z.coerce.number().min(0).max(1_000_000);

export const offerInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, 'Give the offer a name customers will see.').max(80),
    kind: z.enum(OFFER_KINDS),
    percentOff: z.coerce.number().int().min(1).max(90).nullable(),
    amountRupees: rupees.nullable(),
    buyQty: z.coerce.number().int().min(1).max(10).nullable(),
    getQty: z.coerce.number().int().min(1).max(10).nullable(),
    productIds: z.array(z.string().max(100)).max(200),
    minSubtotalRupees: rupees,
    minQuantity: z.coerce.number().int().min(1).max(50),
    couponCode: z
      .string()
      .trim()
      .max(30)
      .regex(/^[A-Za-z0-9-]*$/, 'Codes use letters, numbers and dashes only.'),
    firstOrderOnly: z.boolean(),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    active: z.boolean(),
  })
  .superRefine((o, ctx) => {
    if (o.kind === 'percent_off' && !o.percentOff)
      ctx.addIssue({ code: 'custom', message: 'Enter the percentage off.' });
    if (o.kind === 'amount_off' && !o.amountRupees) ctx.addIssue({ code: 'custom', message: 'Enter the amount off.' });
    if (o.kind === 'buy_x_get_y' && (!o.buyQty || !o.getQty))
      ctx.addIssue({ code: 'custom', message: 'Enter how many to buy and how many are free.' });
    if (o.startsAt && o.endsAt && new Date(o.endsAt) <= new Date(o.startsAt))
      ctx.addIssue({ code: 'custom', message: 'The offer must end after it starts.' });
  });
export type OfferInput = z.infer<typeof offerInputSchema>;

/** Every SKU on sale now, with its current price and cost, for the profit check. */
export async function skusForCheck(db: Db) {
  const [prices, costs] = await Promise.all([pricingMap(), costMap(db)]);
  return PRODUCTS.flatMap((p) =>
    p.sizes.map((s) => ({
      productId: p.id,
      productName: p.name,
      size: s.label,
      price: skuPrice(p, s.label, prices.get(skuKey(p.id, s.label))).price,
      costPaise: costs.get(skuKey(p.id, s.label)) ?? null,
    }))
  );
}

export type SaveOfferResult = { ok: true; id: string } | { ok: false; errors: string[] };

export async function saveOffer(db: Db, input: OfferInput, actor: string): Promise<SaveOfferResult> {
  const code = normaliseCode(input.couponCode) || null;
  const values = {
    name: input.name,
    kind: input.kind,
    percentOff: input.kind === 'percent_off' ? input.percentOff : null,
    amountPaise:
      input.kind === 'amount_off' && input.amountRupees !== null ? Math.round(input.amountRupees * 100) : null,
    buyQty: input.kind === 'buy_x_get_y' ? input.buyQty : null,
    getQty: input.kind === 'buy_x_get_y' ? input.getQty : null,
    productIds: input.productIds.length ? input.productIds : null,
    minSubtotalPaise: Math.round(input.minSubtotalRupees * 100),
    minQuantity: input.minQuantity,
    couponCode: code,
    firstOrderOnly: input.firstOrderOnly,
    maxUses: input.maxUses,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    active: input.active,
  };

  // A switched-off offer can be saved as a draft; one that can run must pass the profit check.
  if (values.active) {
    const settings = await getProfitSettings(db);
    const problems = offerProblems({ id: input.id ?? 'new', ...values }, await skusForCheck(db), settings);
    if (problems.length) return { ok: false, errors: problems };
  }
  if (code) {
    const [clash] = await db.select({ id: O.id }).from(O).where(eq(O.couponCode, code)).limit(1);
    if (clash && clash.id !== input.id) return { ok: false, errors: [`Another offer already uses the code ${code}.`] };
  }

  const id = await db.transaction(async (tx) => {
    let id = input.id;
    if (id)
      await tx
        .update(O)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(O.id, id));
    else
      [{ id }] = await tx
        .insert(O)
        .values({ ...values, createdBy: actor })
        .returning({ id: O.id });
    await tx.insert(schema.auditLogs).values({
      actor,
      actorRole: 'owner',
      action: input.id ? 'offer.update' : 'offer.create',
      entityType: 'offer',
      entityId: id!,
      newValue: values as unknown,
    });
    return id!;
  });
  return { ok: true, id };
}

/** Switches an offer on or off. Switching on re-runs the profit check, since prices or costs may have moved. */
export async function setOfferActive(db: Db, id: string, active: boolean, actor: string): Promise<SaveOfferResult> {
  const [row] = await db
    .select()
    .from(O)
    .where(inArray(O.id, [id]))
    .limit(1);
  if (!row) return { ok: false, errors: ['That offer no longer exists.'] };
  if (active) {
    const problems = offerProblems(
      toOffer({ ...row, active: true }),
      await skusForCheck(db),
      await getProfitSettings(db)
    );
    if (problems.length) return { ok: false, errors: problems };
  }
  await db.update(O).set({ active, updatedAt: new Date() }).where(eq(O.id, id));
  await db.insert(schema.auditLogs).values({
    actor,
    actorRole: 'owner',
    action: active ? 'offer.start' : 'offer.stop',
    entityType: 'offer',
    entityId: id,
  });
  return { ok: true, id };
}

/**
 * Automatic offers running now, for the shop to show. Coupon offers are
 * left out (the owner hands those codes out), as are offers that are used
 * up or cover nothing on sale.
 */
export async function activePromotions(db: Db, now = new Date()): Promise<Promotion[]> {
  const [rows, usage] = await Promise.all([
    db
      .select()
      .from(O)
      .where(and(eq(O.active, true), isNull(O.couponCode))),
    usageCounts(db),
  ]);
  const onSale = new Set(PRODUCTS.map((p) => p.id));
  return rows
    .map(toOffer)
    .filter((o) => offerLive(o, now, usage[o.id] ?? 0))
    .map((o) => ({ ...o, productIds: o.productIds?.filter((id) => onSale.has(id)) ?? null }))
    .filter((o) => o.productIds === null || o.productIds.length > 0)
    .map(toPromotion);
}

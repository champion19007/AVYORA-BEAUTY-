import { and, eq, gt, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db';
import { inventory, orderItems, orders, restockRequests } from '@/db/schema';
import { getProductById, getVariant } from '@/lib/catalogue';
import { formatPaise } from '@/lib/money';
import { realSale } from '@/lib/analytics';
import { emailDeliveryConfigured, sendEmail, sendWhatsApp, whatsappConfigured } from '@/lib/notify';
import { reportError } from '@/lib/observability';

/**
 * Stock autopilot: runs every morning with the daily sweep.
 *
 * Works out how fast each SKU really sells, raises a restock request for
 * anything that will run out before a delivery could arrive, and sends the
 * owner one short summary. The owner still decides what is actually bought
 * (closing a request means "ordered"); the system just never lets a SKU run
 * dry unnoticed.
 */

/** Sales history the rate is measured over. */
export const SALES_WINDOW_DAYS = 28;
/** Days between placing an order with the supplier and the stock arriving. */
export const LEAD_DAYS = 7;
/** How many days of sales one restock should cover. */
export const COVER_DAYS = 30;

export type SkuPlan = {
  dailyRate: number;
  reorderPoint: number;
  /** Days until it runs out at the current rate; null when it is not selling. */
  daysLeft: number | null;
  /** Units to ask for now, or 0 when no restock is needed. */
  suggest: number;
};

/**
 * The rule, kept pure so it can be read and tested on its own.
 *
 * Reorder when stock would not last the supplier's lead time, and never below
 * the owner's own low-stock threshold. Ask for enough to cover the lead time
 * plus a month, and at least twice the threshold so a slow seller is not
 * restocked one unit at a time.
 */
export function planSku(input: { soldInWindow: number; quantity: number; lowStockThreshold: number }): SkuPlan {
  const dailyRate = input.soldInWindow / SALES_WINDOW_DAYS;
  const reorderPoint = Math.max(input.lowStockThreshold, Math.ceil(dailyRate * LEAD_DAYS));
  const daysLeft = dailyRate > 0 ? Math.floor(input.quantity / dailyRate) : null;
  const target = Math.max(Math.ceil(dailyRate * (LEAD_DAYS + COVER_DAYS)), input.lowStockThreshold * 2);
  const suggest = input.quantity <= reorderPoint ? Math.max(target - input.quantity, 1) : 0;
  return { dailyRate, reorderPoint, daysLeft, suggest };
}

type Db = typeof defaultDb;

/** The same definition of a real sale as the owner's analytics. */
const realOrder = realSale;

export type AutopilotResult = {
  raised: { productId: string; size: string; quantity: number }[];
  low: { name: string; quantity: number; daysLeft: number | null }[];
  ordersLastDay: number;
  salesLastDayPaise: number;
  summarySent: boolean;
};

export async function runStockAutopilot(db: Db = defaultDb, now = new Date()): Promise<AutopilotResult> {
  const since = new Date(now.getTime() - SALES_WINDOW_DAYS * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [stock, sold, open, lastDay] = await Promise.all([
    db.select().from(inventory),
    db
      .select({
        productId: orderItems.productId,
        size: orderItems.size,
        units: sql<number>`sum(${orderItems.quantity})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(gt(orders.createdAt, since), realOrder()))
      .groupBy(orderItems.productId, orderItems.size),
    db
      .select({ productId: restockRequests.productId, size: restockRequests.size })
      .from(restockRequests)
      .where(eq(restockRequests.status, 'open')),
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
      .from(orders)
      .where(and(gt(orders.createdAt, dayAgo), realOrder())),
  ]);

  const key = (p: string, s: string) => `${p}::${s}`;
  const soldBy = new Map(sold.map((r) => [key(r.productId, r.size), Number(r.units)]));
  const alreadyOpen = new Set(open.map((r) => key(r.productId, r.size)));

  const raised: AutopilotResult['raised'] = [];
  const low: AutopilotResult['low'] = [];

  for (const row of stock) {
    // Made-to-order SKUs are sold past zero on purpose; nothing to reorder.
    if (row.allowBackorder) continue;
    const plan = planSku({
      soldInWindow: soldBy.get(key(row.productId, row.size)) ?? 0,
      quantity: row.quantity,
      lowStockThreshold: row.lowStockThreshold,
    });
    if (plan.suggest === 0) continue;

    const name = `${getProductById(row.productId)?.name ?? row.productId} (${row.size})`;
    low.push({ name, quantity: row.quantity, daysLeft: plan.daysLeft });
    if (alreadyOpen.has(key(row.productId, row.size))) continue;

    const pace =
      plan.dailyRate > 0
        ? `Sells about ${plan.dailyRate.toFixed(1)} a day, so about ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'} left.`
        : 'Not selling lately, but below its low-stock level.';
    await db.insert(restockRequests).values({
      productId: row.productId,
      size: row.size,
      variantId: getVariant(row.productId, row.size)?.id ?? null,
      requestedQuantity: plan.suggest,
      quantityAtRequest: row.quantity,
      note: `Raised automatically. ${pace} Enough for ${LEAD_DAYS} days' delivery plus ${COVER_DAYS} days of sales.`,
      requestedBy: 'autopilot',
    });
    raised.push({ productId: row.productId, size: row.size, quantity: plan.suggest });
  }

  const ordersLastDay = Number(lastDay[0]?.count ?? 0);
  const salesLastDayPaise = Number(lastDay[0]?.total ?? 0);
  const summarySent = await sendSummary({ ordersLastDay, salesLastDayPaise, low, raisedCount: raised.length });
  return { raised, low, ordersLastDay, salesLastDayPaise, summarySent };
}

/** One morning message for the owner. Short on WhatsApp, the full list by email. */
export function summaryText(input: {
  ordersLastDay: number;
  salesLastDayPaise: number;
  low: AutopilotResult['low'];
  raisedCount: number;
}): { short: string; long: string } {
  const head = `Avyora, last 24 hours: ${input.ordersLastDay} order${input.ordersLastDay === 1 ? '' : 's'}, ${formatPaise(input.salesLastDayPaise)}.`;
  const lowLine =
    input.low.length === 0
      ? 'Stock: everything is above its reorder level.'
      : `Running low: ${input.low.length} item${input.low.length === 1 ? '' : 's'}. ${input.raisedCount} new restock request${input.raisedCount === 1 ? '' : 's'} raised for you to approve.`;
  const list = input.low.map(
    (l) => `- ${l.name}: ${l.quantity} left${l.daysLeft !== null ? `, about ${l.daysLeft} days` : ''}`
  );
  return {
    short: `${head} ${lowLine}`,
    long: [head, '', lowLine, ...list, '', 'Approve or decline requests in the owner console under Requests.'].join(
      '\n'
    ),
  };
}

async function sendSummary(input: Parameters<typeof summaryText>[0]): Promise<boolean> {
  const text = summaryText(input);
  const sends: Promise<{ ok: boolean }>[] = [];
  if (whatsappConfigured()) sends.push(sendWhatsApp(text.short));
  const owner = process.env.OWNER_EMAIL;
  if (owner && emailDeliveryConfigured()) sends.push(sendEmail(owner, 'Avyora morning summary', text.long));
  if (sends.length === 0) return false;
  const results = await Promise.allSettled(sends);
  const ok = results.some((r) => r.status === 'fulfilled' && r.value.ok);
  if (!ok) reportError(new Error('Morning summary was not delivered'), { scope: 'inventory.autopilot' });
  return ok;
}

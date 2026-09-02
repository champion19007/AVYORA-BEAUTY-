import { and, desc, eq, gte, ne, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, inventory } from '@/db/schema';
import { getProductById } from '@/lib/catalogue';

/**
 * Sales analysis for the owner.
 *
 * Cancelled and refunded orders are excluded everywhere. Counting them would
 * flatter every figure and, worse, would drive the reorder forecast on parcels
 * that came straight back.
 *
 * The forecast here is a plain moving average, not a model. That is a
 * deliberate ceiling: with a few weeks of data anything cleverer produces
 * confident-looking numbers built on noise, and a shop owner ordering stock
 * against a fabricated trend loses real money. The honest version is a recent
 * average with its own sample size printed next to it.
 */

/** Orders that count as real sales. */
const SOLD = and(ne(orders.status, 'cancelled'), ne(orders.status, 'refunded'));

export type ProductSales = {
  productId: string;
  productName: string;
  size: string;
  unitsSold: number;
  revenue: number;
  /** Units per day over the window, used for the reorder estimate. */
  dailyRate: number;
  stockOnHand: number | null;
  /** Days until stock runs out at the recent rate, or null if not estimable. */
  daysOfCover: number | null;
};

/**
 * Units and revenue per SKU over a window.
 *
 * Ordered by units rather than revenue: the question this answers is "what do
 * I need to reorder", and that is driven by how many left the shelf, not by
 * which ones were expensive.
 */
export async function productSales(days = 30): Promise<ProductSales[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      productId: orderItems.productId,
      size: orderItems.size,
      productName: sql<string>`max(${orderItems.productName})`,
      units: sum(orderItems.quantity),
      revenue: sum(orderItems.lineTotal),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(gte(orders.createdAt, since), SOLD))
    .groupBy(orderItems.productId, orderItems.size)
    .orderBy(desc(sum(orderItems.quantity)));

  const stock = await db.select().from(inventory);
  const stockBySku = new Map(stock.map((s) => [`${s.productId}::${s.size}`, s.quantity]));

  return rows.map((row) => {
    const unitsSold = Number(row.units ?? 0);
    const dailyRate = unitsSold / days;
    const onHand = stockBySku.get(`${row.productId}::${row.size}`) ?? null;

    return {
      productId: row.productId,
      size: row.size,
      productName: getProductById(row.productId)?.name ?? row.productName ?? row.productId,
      unitsSold,
      revenue: Number(row.revenue ?? 0),
      dailyRate,
      stockOnHand: onHand,
      // Only meaningful if something actually sold; dividing by zero would
      // otherwise report Infinity days of cover for a product nobody buys.
      daysOfCover: onHand !== null && dailyRate > 0 ? Math.floor(onHand / dailyRate) : null,
    };
  });
}

export type DailyPoint = { date: string; orders: number; revenue: number };

/** Orders and revenue per day, oldest first, with empty days filled in. */
export async function dailySales(days = 30): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
      revenue: sum(orders.total),
    })
    .from(orders)
    .where(and(gte(orders.createdAt, since), SOLD))
    .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

  const byDay = new Map(
    rows.map((r) => [r.day, { orders: Number(r.count ?? 0), revenue: Number(r.revenue ?? 0) }])
  );

  // Days with no orders must appear as zero, not vanish — a gap in a series
  // reads as "no data" when it means "no sales", and they are different.
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    points.push({ date: key, orders: entry?.orders ?? 0, revenue: entry?.revenue ?? 0 });
  }

  return points;
}

export type Trend = {
  /** Mean daily revenue over the recent half of the window. */
  recentAverage: number;
  /** Mean daily revenue over the earlier half. */
  priorAverage: number;
  /** Percentage change, or null when the earlier half sold nothing. */
  changePercent: number | null;
  /** Projected revenue for the next 7 days at the recent rate. */
  next7Days: number;
  /** How many days the estimate is based on — its own health warning. */
  sampleDays: number;
};

/**
 * A trend, stated as plainly as the data supports.
 *
 * Two halves of the window compared, and a straight-line projection from the
 * recent half. No seasonality, no regression: with a short history those
 * produce a confident line through noise, and stock bought against it is real
 * money spent on a guess dressed up as arithmetic.
 *
 * `changePercent` is null rather than infinite when the earlier half sold
 * nothing — "up ∞%" from zero is not information.
 */
export function computeTrend(points: DailyPoint[]): Trend {
  const half = Math.floor(points.length / 2);
  const prior = points.slice(0, half);
  const recent = points.slice(half);

  const mean = (list: DailyPoint[]) =>
    list.length === 0 ? 0 : list.reduce((sum, p) => sum + p.revenue, 0) / list.length;

  const recentAverage = mean(recent);
  const priorAverage = mean(prior);

  return {
    recentAverage,
    priorAverage,
    changePercent:
      priorAverage > 0 ? ((recentAverage - priorAverage) / priorAverage) * 100 : null,
    next7Days: Math.round(recentAverage * 7),
    sampleDays: recent.length,
  };
}

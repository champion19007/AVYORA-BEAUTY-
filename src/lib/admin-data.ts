import { and, count, desc, eq, gte, inArray, sum } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, inventory, users } from '@/db/schema';
import { allProducts, getProductById } from '@/lib/catalogue';

/**
 * Read models for the operations dashboard.
 *
 * The admin screens previously ran off the static catalogue and a seeded
 * random-number generator, which meant the "analytics" moved when you reloaded
 * and no order was ever visible. These read the database instead.
 *
 * Every query here is aggregate or paged. An operator's order list is the one
 * screen that grows without limit, and a `select *` over it is fine on day one
 * and a timeout on day four hundred.
 */

export type OrderSummary = {
  id: string;
  orderNumber: string;
  email: string;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  total: number;
  itemCount: number;
  createdAt: Date;
  shippingCity: string | null;
  shippingState: string | null;
};

/** Orders newest first, with the line count and destination for the list view. */
export async function listOrders(limit = 50, offset = 0): Promise<OrderSummary[]> {
  const rows = await db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  /*
   * Item counts come from one grouped query over just this page of orders.
   *
   * The obvious version is a correlated subquery in the select list, and it
   * was wrong: Drizzle rendered the columns unqualified, so `where "order_id"
   * = "id"` resolved "id" to order_items.id — an integer — rather than
   * orders.id, and Postgres rejected it with `operator does not exist: text =
   * integer`. Two plain queries avoid the ambiguity entirely and still avoid
   * the N+1.
   */
  const counts = await db
    .select({
      orderId: orderItems.orderId,
      quantity: sum(orderItems.quantity),
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .groupBy(orderItems.orderId);

  const countByOrder = new Map(counts.map((c) => [c.orderId, Number(c.quantity ?? 0)]));

  return rows.map((row) => {
    const address = row.shippingAddress as Record<string, string> | null;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      email: row.email,
      status: row.status,
      paymentStatus: row.paymentStatus,
      paymentProvider: row.paymentProvider,
      total: row.total,
      itemCount: countByOrder.get(row.id) ?? 0,
      createdAt: row.createdAt,
      shippingCity: address?.city ?? null,
      shippingState: address?.state ?? null,
    };
  });
}

/** One order with its lines, for the detail view. */
export async function getOrderDetail(orderNumber: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

export type DashboardStats = {
  ordersToday: number;
  ordersTotal: number;
  revenuePaid: number;
  awaitingPayment: number;
  awaitingFulfilment: number;
  customers: number;
  lowStock: number;
  outOfStock: number;
};

/**
 * The numbers on the dashboard.
 *
 * Revenue counts only orders actually marked paid. Including unpaid ones would
 * flatter the figure with baskets that were abandoned at the payment step, and
 * an operator making stock decisions on that number would over-order.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [[today], [total], [paid], [unpaid], [unfulfilled], [customerCount], stock] =
    await Promise.all([
      db.select({ n: count() }).from(orders).where(gte(orders.createdAt, startOfToday)),
      db.select({ n: count() }).from(orders),
      db
        .select({ n: count(), amount: sum(orders.total) })
        .from(orders)
        .where(eq(orders.paymentStatus, 'paid')),
      db.select({ n: count() }).from(orders).where(eq(orders.paymentStatus, 'unpaid')),
      db
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.paymentStatus, 'paid'), eq(orders.status, 'paid'))),
      db.select({ n: count() }).from(users),
      db.select().from(inventory),
    ]);

  return {
    ordersToday: today?.n ?? 0,
    ordersTotal: total?.n ?? 0,
    // `sum` comes back as a numeric string, and Number(null) is 0, not NaN.
    revenuePaid: Number(paid?.amount ?? 0),
    awaitingPayment: unpaid?.n ?? 0,
    awaitingFulfilment: unfulfilled?.n ?? 0,
    customers: customerCount?.n ?? 0,
    lowStock: stock.filter((s) => s.quantity > 0 && s.quantity <= s.lowStockThreshold).length,
    outOfStock: stock.filter((s) => s.quantity <= 0 && !s.allowBackorder).length,
  };
}

export type InventoryRow = {
  id: number;
  productId: string;
  productName: string;
  size: string;
  quantity: number;
  lowStockThreshold: number;
  allowBackorder: boolean;
  /** True when the catalogue has no such product — a row that sells nothing. */
  orphaned: boolean;
};

/**
 * Stock levels, joined against the catalogue for readable names.
 *
 * Rows whose product is no longer in the catalogue are kept and flagged rather
 * than hidden. A stock row for a withdrawn SKU is a real thing an operator
 * needs to see and clear; silently filtering it would leave counts that never
 * reconcile against the shelf.
 */
export async function listInventory(): Promise<InventoryRow[]> {
  const rows = await db
    .select()
    .from(inventory)
    .orderBy(inventory.productId, inventory.size);

  return rows.map((row) => {
    const product = getProductById(row.productId);
    return {
      id: row.id,
      productId: row.productId,
      productName: product?.name ?? row.productId,
      size: row.size,
      quantity: row.quantity,
      lowStockThreshold: row.lowStockThreshold,
      allowBackorder: row.allowBackorder,
      orphaned: !product,
    };
  });
}

/**
 * Catalogue entries with no inventory row at all.
 *
 * These are not out of stock — `reserveStock` treats a missing row as
 * unlimited, so they sell forever. That is the safe default for launch and a
 * silent hole once stock control matters, so the operator is shown which SKUs
 * are still uncounted.
 */
export async function listUntrackedSkus(): Promise<{ productId: string; productName: string; size: string }[]> {
  const tracked = new Set(
    (await db.select({ productId: inventory.productId, size: inventory.size }).from(inventory)).map(
      (r) => `${r.productId}::${r.size}`
    )
  );

  const missing: { productId: string; productName: string; size: string }[] = [];

  for (const product of allProducts()) {
    for (const size of product.sizes) {
      if (!tracked.has(`${product.id}::${size.label}`)) {
        missing.push({ productId: product.id, productName: product.name, size: size.label });
      }
    }
  }

  return missing;
}

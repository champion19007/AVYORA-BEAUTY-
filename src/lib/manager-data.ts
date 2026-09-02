import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, inventory, restockRequests } from '@/db/schema';
import { allProducts, getProductById } from '@/lib/catalogue';

/**
 * Read models for the inventory manager's console.
 *
 * Deliberately a different shape from the owner's. The manager works a queue —
 * what has to leave the building today — so these queries are ordered by
 * urgency rather than by recency, and none of them return money totals the
 * manager has no use for.
 */

export type DispatchOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  createdAt: Date;
  customerName: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  items: { name: string; size: string; quantity: number }[];
};

/**
 * Orders still to be dealt with, oldest first.
 *
 * Oldest first is the whole point: a queue worked newest-first leaves the
 * earliest order waiting longest, which is exactly backwards for the person
 * who has been waiting most.
 *
 * Cancelled, refunded and delivered orders are excluded — they need nothing
 * doing, and a queue that never empties stops being a queue.
 */
export async function listDispatchQueue(): Promise<DispatchOrder[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        ne(orders.status, 'delivered'),
        ne(orders.status, 'cancelled'),
        ne(orders.status, 'refunded')
      )
    )
    .orderBy(orders.createdAt)
    .limit(100);

  if (rows.length === 0) return [];

  const lines = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));

  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const bucket = linesByOrder.get(line.orderId);
    if (bucket) bucket.push(line);
    else linesByOrder.set(line.orderId, [line]);
  }

  return rows.map((row) => {
    const address = (row.shippingAddress ?? {}) as Record<string, string>;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      paymentStatus: row.paymentStatus,
      paymentProvider: row.paymentProvider,
      createdAt: row.createdAt,
      customerName: address.fullName ?? '—',
      city: address.city ?? '—',
      state: address.state ?? '',
      postalCode: address.postalCode ?? '',
      phone: address.phone ?? '',
      items: (linesByOrder.get(row.id) ?? []).map((l) => ({
        name: l.productName,
        size: l.size,
        quantity: l.quantity,
      })),
    };
  });
}

export type ManagerStockRow = {
  productId: string;
  productName: string;
  size: string;
  quantity: number;
  lowStockThreshold: number;
  tracked: boolean;
  /** An open restock request already exists for this SKU. */
  requested: boolean;
};

/**
 * Every catalogue SKU with its count, tracked or not.
 *
 * Untracked SKUs are shown with a count of zero rather than omitted, because
 * from the manager's side "we have never counted this" and "we have none" look
 * the same on the shelf, and both mean a customer cannot buy it.
 */
export async function listManagerStock(): Promise<ManagerStockRow[]> {
  const [stock, openRequests] = await Promise.all([
    db.select().from(inventory),
    db
      .select({ productId: restockRequests.productId, size: restockRequests.size })
      .from(restockRequests)
      .where(eq(restockRequests.status, 'open')),
  ]);

  const stockBySku = new Map(stock.map((s) => [`${s.productId}::${s.size}`, s]));
  const requestedSkus = new Set(openRequests.map((r) => `${r.productId}::${r.size}`));

  const rows: ManagerStockRow[] = [];

  // Driven by the catalogue, so a product with no inventory row still appears.
  for (const product of allProducts()) {
    for (const size of product.sizes) {
      const key = `${product.id}::${size.label}`;
      const row = stockBySku.get(key);

      rows.push({
        productId: product.id,
        productName: product.name,
        size: size.label,
        quantity: row?.quantity ?? 0,
        lowStockThreshold: row?.lowStockThreshold ?? 5,
        tracked: Boolean(row),
        requested: requestedSkus.has(key),
      });
    }
  }

  return rows.sort((a, b) => a.productName.localeCompare(b.productName));
}

export type RestockRequestRow = {
  id: string;
  productId: string;
  productName: string;
  size: string;
  requestedQuantity: number;
  quantityAtRequest: number;
  note: string | null;
  status: string;
  requestedBy: string;
  createdAt: Date;
};

/** Restock requests, open ones first. */
export async function listRestockRequests(onlyOpen = false): Promise<RestockRequestRow[]> {
  const rows = await db
    .select()
    .from(restockRequests)
    .where(onlyOpen ? eq(restockRequests.status, 'open') : undefined)
    .orderBy(sql`case when ${restockRequests.status} = 'open' then 0 else 1 end`, desc(restockRequests.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: getProductById(row.productId)?.name ?? row.productId,
    size: row.size,
    requestedQuantity: row.requestedQuantity,
    quantityAtRequest: row.quantityAtRequest,
    note: row.note,
    status: row.status,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt,
  }));
}

/** How many restock requests are waiting on the owner. */
export async function countOpenRestockRequests(): Promise<number> {
  const rows = await db
    .select({ id: restockRequests.id })
    .from(restockRequests)
    .where(and(eq(restockRequests.status, 'open'), isNull(restockRequests.resolvedAt)));

  return rows.length;
}

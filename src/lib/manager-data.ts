import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { orders, orderItems, inventory, restockRequests, stockLots, orderItemLots } from '@/db/schema';
import { allProducts, getProductById } from '@/lib/catalogue';
import { packingHold } from '@/modules/shipping/cod-policy';

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
  /**
   * `approved`, `pending` or `review` from the cash-on-delivery risk gate.
   *
   * Carried through to the dispatch card because a gate the picking list
   * ignores is not a gate. Held orders stay visible rather than being filtered
   * out — an order that silently vanishes from the queue is one nobody ever
   * resolves.
   */
  fraudStatus: string;
  /** Set when the owner must decide before this ships. See `orders.attention_reason`. */
  attentionReason: string | null;
  /** Why it may not be packed yet (lib cod-policy), or null. */
  hold: string | null;
  /** Cash on delivery not yet confirmed by the customer: staff may confirm by phone. */
  awaitingCodConfirmation: boolean;
  createdAt: Date;
  customerName: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  /** `batches` says which batch to pick each line's units from, earliest expiry first. */
  items: {
    name: string;
    size: string;
    quantity: number;
    batches: { code: string; expiresOn: string | null; quantity: number }[];
  }[];
  /** Set once a courier is booked. */
  courier: { awb: string; name: string; labelUrl: string | null; status: string | null } | null;
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
        ne(orders.status, 'refunded'),
        // Back with us: the stock is already on the shelf, nothing left to send.
        ne(orders.status, 'returned')
      )
    )
    .orderBy(orders.createdAt)
    .limit(100);

  if (rows.length === 0) return [];

  const lines = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id)
      )
    );

  const picks = lines.length
    ? await db
        .select({
          orderItemId: orderItemLots.orderItemId,
          quantity: orderItemLots.quantity,
          code: stockLots.batchCode,
          expiresOn: stockLots.expiresOn,
        })
        .from(orderItemLots)
        .innerJoin(stockLots, eq(stockLots.id, orderItemLots.lotId))
        .where(
          inArray(
            orderItemLots.orderItemId,
            lines.map((l) => l.id)
          )
        )
    : [];

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
      fraudStatus: row.fraudStatus,
      attentionReason: row.attentionReason,
      hold: ['pending', 'paid'].includes(row.status) ? packingHold(row) : null,
      awaitingCodConfirmation: row.paymentProvider === 'cod' && row.codConfirmedAt === null,
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
        batches: picks
          .filter((p) => p.orderItemId === l.id)
          .map((p) => ({ code: p.code, expiresOn: p.expiresOn, quantity: p.quantity })),
      })),
      courier: row.awb
        ? (() => {
            const s = (row.shipment ?? {}) as { courierName?: string; labelUrl?: string | null; statusLabel?: string };
            return {
              awb: row.awb,
              name: s.courierName ?? 'Courier',
              labelUrl: s.labelUrl ?? null,
              status: s.statusLabel ?? null,
            };
          })()
        : null,
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

export type BatchRow = {
  id: number;
  batchCode: string;
  expiresOn: string | null;
  quantity: number;
  expiredUnits: number;
};

/** Every batch still holding units, keyed `productId::size`, earliest expiry first. */
export async function listBatches(): Promise<Map<string, BatchRow[]>> {
  const rows = await db
    .select()
    .from(stockLots)
    .where(sql`${stockLots.quantity} > 0 OR ${stockLots.expiredUnits} > 0`)
    .orderBy(sql`${stockLots.expiresOn} asc nulls last`, stockLots.id);
  const map = new Map<string, BatchRow[]>();
  for (const r of rows) {
    const key = `${r.productId}::${r.size}`;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return map;
}

export type BatchOrderRow = {
  orderNumber: string;
  status: string;
  createdAt: Date;
  customerName: string;
  email: string;
  phone: string | null;
  productName: string;
  size: string;
  quantity: number;
  expiresOn: string | null;
};

/**
 * Who received a batch: for a complaint or a recall.
 *
 * Only orders still holding the batch are listed; a cancelled order's units
 * went back on the shelf and its link to the batch was removed.
 */
export async function ordersForBatch(batchCode: string): Promise<BatchOrderRow[]> {
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      createdAt: orders.createdAt,
      email: orders.email,
      shippingAddress: orders.shippingAddress,
      productName: orderItems.productName,
      size: stockLots.size,
      quantity: orderItemLots.quantity,
      expiresOn: stockLots.expiresOn,
    })
    .from(orderItemLots)
    .innerJoin(stockLots, eq(stockLots.id, orderItemLots.lotId))
    .innerJoin(orderItems, eq(orderItems.id, orderItemLots.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(stockLots.batchCode, batchCode.trim().toUpperCase()))
    .orderBy(desc(orders.createdAt))
    .limit(500);

  return rows.map((r) => {
    const address = (r.shippingAddress ?? {}) as { fullName?: string; phone?: string };
    return {
      orderNumber: r.orderNumber,
      status: r.status,
      createdAt: r.createdAt,
      email: r.email,
      customerName: address.fullName ?? '',
      phone: address.phone ?? null,
      productName: r.productName,
      size: r.size,
      quantity: r.quantity,
      expiresOn: r.expiresOn,
    };
  });
}

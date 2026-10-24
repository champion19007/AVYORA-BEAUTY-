import { and, asc, eq, gt, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { inventory, orderItemLots, orderItems, stockLots } from '@/db/schema';
import { emitEvent } from '@/lib/events';

/**
 * Stock control.
 *
 * Nothing tracked stock before, so the shop would happily sell the same last
 * unit to any number of customers. Overselling costs real money: refunds,
 * apology discounts, and the support time to handle both.
 *
 * The important property here is that the decrement is *conditional*. Reading
 * stock, deciding there is enough, then writing the new value is a classic
 * race: two orders for the last unit both read 1, both decide yes, and both
 * write 0. `reserveStock` instead issues a single UPDATE with a
 * `quantity >= n` guard and checks how many rows it actually changed, so at
 * most one of those two orders can win.
 */

export type StockLine = { productId: string; size: string; quantity: number };

/** Units taken from one batch for one order line. */
export type Allocation = { productId: string; size: string; lotId: number; quantity: number };

/**
 * A batch closer than this to its expiry date is not sent to customers.
 *
 * ponytail: one shop-wide figure; make it per product if a short-dated line
 * (a preservative-free serum, say) ever needs a different one.
 */
export const MIN_SHELF_LIFE_DAYS = 90;

/** The earliest expiry date still sellable on `now`, as YYYY-MM-DD in India time. */
export function shippingCutoff(now = new Date()): string {
  const IST_OFFSET_MS = 5.5 * 3_600_000;
  return new Date(now.getTime() + IST_OFFSET_MS + MIN_SHELF_LIFE_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** Whether a batch may still be sent to a customer. */
export const isSellableBatch = (expiresOn: string | null, cutoff = shippingCutoff()) =>
  expiresOn === null || expiresOn >= cutoff;

export type ReserveResult =
  /**
   * `depleted` lists the SKUs this reservation took to zero.
   *
   * Reported because only the writer knows: reading the row back afterwards
   * cannot distinguish "this order emptied the shelf" from "it was already
   * empty and someone else emptied it". The caller uses it to invalidate the
   * cached product page, so a sold-out size stops being buyable in seconds
   * rather than at the next scheduled regeneration.
   */
  | { ok: true; depleted: { productId: string; size: string }[]; allocations: Allocation[] }
  | { ok: false; insufficient: { productId: string; size: string; available: number }[] };

/** Current stock for a product across its sizes. */
export async function getStock(productId: string) {
  if (!isDatabaseConfigured()) return [];
  return db.select().from(inventory).where(eq(inventory.productId, productId));
}

/** Stock for many products at once, keyed `productId::size`. */
export async function getStockMap(productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!isDatabaseConfigured() || productIds.length === 0) return map;

  const rows = await db.select().from(inventory).where(inArray(inventory.productId, productIds));

  for (const row of rows) {
    map.set(`${row.productId}::${row.size}`, row.allowBackorder ? Infinity : row.quantity);
  }
  return map;
}

/**
 * Atomically reserves stock for a set of lines.
 *
 * Pass the transaction handle from the order insert so stock and order move
 * together: if the order fails afterwards, the reservation rolls back with it.
 *
 * A SKU with no inventory row cannot be sold. That is a deliberate reversal of
 * the earlier rule, which treated an uncounted SKU as unlimited: convenient at
 * launch, and a way to oversell something nobody has ever counted. "We have
 * never counted this" and "we have none" are the same fact from the customer's
 * side — neither is a parcel anyone can post.
 *
 * The consequence is that a fresh deployment sells nothing until stock is
 * entered. Run `npm run db:seed-inventory <n>`, or count each SKU in the
 * stockroom console, before opening the shop.
 */
/** Sorted by SKU: the one order every stock-locking path must take rows in. */
export function inLockOrder<T extends { productId: string; size: string }>(lines: T[]): T[] {
  const key = (l: T) => `${l.productId}::${l.size}`;
  return [...lines].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export async function reserveStock(
  lines: StockLine[],
  tx: Pick<typeof db, 'update' | 'select'> = db
): Promise<ReserveResult> {
  if (!isDatabaseConfigured()) return { ok: true, depleted: [], allocations: [] };

  const insufficient: { productId: string; size: string; available: number }[] = [];
  const depleted: { productId: string; size: string }[] = [];
  const allocations: Allocation[] = [];
  const cutoff = shippingCutoff();

  /*
   * Rows are locked in one global order, not the basket's. Two checkouts
   * taking the same SKUs in opposite orders — A then B, and B then A — each
   * held one row and waited for the other's: a deadlock, which Postgres
   * resolves by aborting one of them, and that customer saw a failed
   * checkout. Sorted, the second simply waits for the first.
   */
  for (const line of inLockOrder(lines)) {
    const updated = await tx
      .update(inventory)
      .set({
        quantity: sql`${inventory.quantity} - ${line.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.productId, line.productId),
          eq(inventory.size, line.size),
          // The guard that makes this safe under concurrency. Backorder SKUs
          // opt out of it deliberately.
          sql`(${inventory.allowBackorder} = true OR ${inventory.quantity} >= ${line.quantity})`
        )
      )
      .returning({ id: inventory.id, quantity: inventory.quantity, allowBackorder: inventory.allowBackorder });

    /*
     * The total had room; now the units come from actual batches, earliest
     * expiry first. A batch past the shipping cutoff is skipped even if the
     * daily sweep has not yet taken it out of the total, so short-dated stock
     * cannot be sold in that gap: the line is then short, and the order rolls
     * back like any other shortage.
     */
    if (updated.length > 0) {
      const picked = await allocateBatches(tx, line, cutoff);
      allocations.push(...picked.allocations);
      if (picked.covered < line.quantity && !updated[0].allowBackorder) {
        insufficient.push({ productId: line.productId, size: line.size, available: picked.covered });
        continue;
      }
    }

    if (updated[0]?.quantity === 0) {
      depleted.push({ productId: line.productId, size: line.size });
    }

    if (updated.length === 0) {
      // Either the SKU is not stock-managed, or there is not enough.
      const [row] = await tx
        .select()
        .from(inventory)
        .where(and(eq(inventory.productId, line.productId), eq(inventory.size, line.size)))
        .limit(1);

      // No row at all means uncounted, which is not the same as plentiful.
      insufficient.push({
        productId: line.productId,
        size: line.size,
        available: row ? Math.max(0, row.quantity) : 0,
      });
    }
  }

  return insufficient.length > 0 ? { ok: false, insufficient } : { ok: true, depleted, allocations };
}

/**
 * Takes a line's units from its batches, earliest expiry first.
 *
 * Called with the SKU's inventory row already locked by the caller's UPDATE,
 * so every path locks inventory before batches and two of them cannot
 * deadlock. A SKU with no batches is untracked: the total alone covers it and
 * nothing is allocated.
 */
async function allocateBatches(
  tx: Pick<typeof db, 'update' | 'select'>,
  line: StockLine,
  cutoff: string
): Promise<{ allocations: Allocation[]; covered: number }> {
  const lots = await tx
    .select({ id: stockLots.id, quantity: stockLots.quantity, expiresOn: stockLots.expiresOn })
    .from(stockLots)
    .where(and(eq(stockLots.productId, line.productId), eq(stockLots.size, line.size)))
    .orderBy(sql`${stockLots.expiresOn} asc nulls last`, asc(stockLots.id))
    .for('update');
  if (lots.length === 0) return { allocations: [], covered: line.quantity };

  const allocations: Allocation[] = [];
  let need = line.quantity;
  for (const lot of lots) {
    if (need === 0) break;
    if (lot.quantity <= 0 || !isSellableBatch(lot.expiresOn, cutoff)) continue;
    const take = Math.min(need, lot.quantity);
    await tx
      .update(stockLots)
      .set({ quantity: sql`${stockLots.quantity} - ${take}` })
      .where(eq(stockLots.id, lot.id));
    allocations.push({ productId: line.productId, size: line.size, lotId: lot.id, quantity: take });
    need -= take;
  }
  return { allocations, covered: line.quantity - need };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Records which batches an order's lines came from. Lines are unique per SKU within an order. */
export async function recordAllocations(tx: Tx, orderId: string, allocations: Allocation[]): Promise<void> {
  if (allocations.length === 0) return;
  const items = await tx
    .select({ id: orderItems.id, productId: orderItems.productId, size: orderItems.size })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const itemId = new Map(items.map((i) => [`${i.productId}::${i.size}`, i.id]));
  const rows = allocations.flatMap((a) => {
    const orderItemId = itemId.get(`${a.productId}::${a.size}`);
    return orderItemId === undefined ? [] : [{ orderItemId, lotId: a.lotId, quantity: a.quantity }];
  });
  if (rows.length > 0) await tx.insert(orderItemLots).values(rows);
}

/**
 * Puts an order's units back: into the batches they came from, and into the
 * sellable total.
 *
 * A unit whose batch has meanwhile passed the shipping cutoff goes to that
 * batch's held-back count instead, and not into the total, so a cancellation
 * cannot put short-dated stock back on sale. The caller guarantees this runs
 * once per order (see `restoreOrderStock`).
 */
export async function releaseOrderStock(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return;
  const itemIds = items.map((i) => i.id);

  const picked = await tx
    .select({
      orderItemId: orderItemLots.orderItemId,
      lotId: orderItemLots.lotId,
      quantity: orderItemLots.quantity,
      expiresOn: stockLots.expiresOn,
    })
    .from(orderItemLots)
    .innerJoin(stockLots, eq(stockLots.id, orderItemLots.lotId))
    .where(inArray(orderItemLots.orderItemId, itemIds));

  const cutoff = shippingCutoff();
  const heldBack = (itemId: number) =>
    picked
      .filter((p) => p.orderItemId === itemId && !isSellableBatch(p.expiresOn, cutoff))
      .reduce((n, p) => n + p.quantity, 0);

  // Inventory rows first, then batches: the same lock order as checkout.
  await releaseStock(
    items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity - heldBack(i.id) })),
    tx as never
  );
  for (const p of [...picked].sort((a, b) => a.lotId - b.lotId)) {
    await tx
      .update(stockLots)
      .set(
        isSellableBatch(p.expiresOn, cutoff)
          ? { quantity: sql`${stockLots.quantity} + ${p.quantity}` }
          : { expiredUnits: sql`${stockLots.expiredUnits} + ${p.quantity}` }
      )
      .where(eq(stockLots.id, p.lotId));
  }
  if (picked.length > 0) await tx.delete(orderItemLots).where(inArray(orderItemLots.orderItemId, itemIds));
}

/**
 * Takes batches past the shipping cutoff out of the sellable total. Daily, from the sweep.
 *
 * Their units move to `expired_units`, where the stockroom sees them as
 * "take off the shelf". Checkout already refuses such batches; this makes the
 * shop stop offering units it would refuse.
 */
export async function holdBackExpiringBatches(now = new Date()): Promise<{ batches: number; units: number }> {
  if (!isDatabaseConfigured()) return { batches: 0, units: 0 };
  const due = await db
    .select({ id: stockLots.id, productId: stockLots.productId, size: stockLots.size })
    .from(stockLots)
    .where(
      and(gt(stockLots.quantity, 0), isNotNull(stockLots.expiresOn), lt(stockLots.expiresOn, shippingCutoff(now)))
    );

  let units = 0;
  for (const lot of due) {
    units += await db.transaction(async (tx) => {
      const sku = and(eq(inventory.productId, lot.productId), eq(inventory.size, lot.size));
      await tx.update(inventory).set({ updatedAt: new Date() }).where(sku); // lock order: inventory first
      const [current] = await tx
        .select({ quantity: stockLots.quantity })
        .from(stockLots)
        .where(eq(stockLots.id, lot.id))
        .for('update');
      const n = current?.quantity ?? 0;
      if (n === 0) return 0;
      await tx
        .update(stockLots)
        .set({ quantity: 0, expiredUnits: sql`${stockLots.expiredUnits} + ${n}` })
        .where(eq(stockLots.id, lot.id));
      const [row] = await tx
        .update(inventory)
        .set({ quantity: sql`greatest(0, ${inventory.quantity} - ${n})` })
        .where(sku)
        .returning({ quantity: inventory.quantity });
      await emitEvent(
        'inventory.changed',
        lot.productId,
        { productId: lot.productId, size: lot.size, quantity: row?.quantity ?? 0 },
        tx
      );
      return n;
    });
  }
  return { batches: due.length, units };
}

/**
 * Returns stock to the shelf, for cancellations and refunds.
 *
 * Takes an optional transaction handle so the release can commit together with
 * whatever decided to release it — restoring stock and then failing to record
 * that you restored it would let the next caller do it again.
 */
export async function releaseStock(lines: StockLine[], tx: Pick<typeof db, 'update'> = db): Promise<void> {
  if (!isDatabaseConfigured()) return;

  for (const line of inLockOrder(lines)) {
    await tx
      .update(inventory)
      .set({
        quantity: sql`${inventory.quantity} + ${line.quantity}`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventory.productId, line.productId), eq(inventory.size, line.size)));
  }
}

// Availability wording lives in stock-label.ts, which imports no database
// code, so client components can label a size without bundling the driver.
export { stockLabel } from '@/lib/stock-label';

/**
 * Puts returned units that passed inspection back on sale, into the batches
 * they were picked from (latest expiry first). Units from a batch now past the
 * shipping cutoff are held back instead. Units with no recorded batch (sold
 * before batches existed) go to the SKU's NOT-RECORDED batch if it has
 * batches, so its total keeps equalling the sum of its batches.
 */
export async function restockReturnedUnits(
  tx: Tx,
  item: { id: number; productId: string; size: string },
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;
  const picked = await tx
    .select({ lotId: orderItemLots.lotId, quantity: orderItemLots.quantity, expiresOn: stockLots.expiresOn })
    .from(orderItemLots)
    .innerJoin(stockLots, eq(stockLots.id, orderItemLots.lotId))
    .where(eq(orderItemLots.orderItemId, item.id))
    .orderBy(sql`${stockLots.expiresOn} desc nulls first`);

  const cutoff = shippingCutoff();
  let left = quantity;
  const plan = picked.flatMap((p) => {
    const take = Math.min(left, p.quantity);
    left -= take;
    return take > 0 ? [{ ...p, take, sellable: isSellableBatch(p.expiresOn, cutoff) }] : [];
  });
  const heldBack = plan.filter((p) => !p.sellable).reduce((n, p) => n + p.take, 0);

  await releaseStock([{ productId: item.productId, size: item.size, quantity: quantity - heldBack }], tx as never);
  for (const p of plan) {
    await tx
      .update(stockLots)
      .set(
        p.sellable
          ? { quantity: sql`${stockLots.quantity} + ${p.take}` }
          : { expiredUnits: sql`${stockLots.expiredUnits} + ${p.take}` }
      )
      .where(eq(stockLots.id, p.lotId));
    await tx
      .update(orderItemLots)
      .set({ quantity: sql`${orderItemLots.quantity} - ${p.take}` })
      .where(and(eq(orderItemLots.orderItemId, item.id), eq(orderItemLots.lotId, p.lotId)));
  }
  if (left > 0) {
    await tx
      .update(stockLots)
      .set({ quantity: sql`${stockLots.quantity} + ${left}` })
      .where(
        and(
          eq(stockLots.productId, item.productId),
          eq(stockLots.size, item.size),
          eq(stockLots.batchCode, 'NOT-RECORDED')
        )
      );
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(stockLots)
      .where(and(eq(stockLots.productId, item.productId), eq(stockLots.size, item.size)));
    if (n > 0) {
      await tx
        .insert(stockLots)
        .values({
          productId: item.productId,
          size: item.size,
          batchCode: 'NOT-RECORDED',
          quantity: left,
          receivedBy: 'return',
        })
        .onConflictDoNothing();
    }
  }
}

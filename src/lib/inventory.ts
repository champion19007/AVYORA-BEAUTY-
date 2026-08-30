import { and, eq, sql, inArray } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { inventory } from '@/db/schema';

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

export type ReserveResult =
  | { ok: true }
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

  const rows = await db
    .select()
    .from(inventory)
    .where(inArray(inventory.productId, productIds));

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
 * A SKU with no inventory row is treated as unlimited. That keeps the shop
 * working for products not yet stock-managed rather than blocking every sale
 * the moment inventory is introduced; `seedInventory` fills the gaps.
 */
export async function reserveStock(
  lines: StockLine[],
  tx: Pick<typeof db, 'update' | 'select'> = db
): Promise<ReserveResult> {
  if (!isDatabaseConfigured()) return { ok: true };

  const insufficient: { productId: string; size: string; available: number }[] = [];

  for (const line of lines) {
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
      .returning({ id: inventory.id });

    if (updated.length === 0) {
      // Either the SKU is not stock-managed, or there is not enough.
      const [row] = await tx
        .select()
        .from(inventory)
        .where(
          and(eq(inventory.productId, line.productId), eq(inventory.size, line.size))
        )
        .limit(1);

      // No row at all: not stock-managed, so allow it.
      if (!row) continue;

      insufficient.push({
        productId: line.productId,
        size: line.size,
        available: Math.max(0, row.quantity),
      });
    }
  }

  return insufficient.length > 0 ? { ok: false, insufficient } : { ok: true };
}

/** Returns stock to the shelf, for cancellations and refunds. */
export async function releaseStock(lines: StockLine[]): Promise<void> {
  if (!isDatabaseConfigured()) return;

  for (const line of lines) {
    await db
      .update(inventory)
      .set({
        quantity: sql`${inventory.quantity} + ${line.quantity}`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventory.productId, line.productId), eq(inventory.size, line.size)));
  }
}

/** Human-readable availability for a storefront badge. */
export function stockLabel(
  quantity: number | undefined,
  lowStockThreshold = 5
): { label: string; tone: 'in' | 'low' | 'out' } {
  if (quantity === undefined || quantity === Infinity) return { label: 'In stock', tone: 'in' };
  if (quantity <= 0) return { label: 'Out of stock', tone: 'out' };
  if (quantity <= lowStockThreshold)
    return { label: `Only ${quantity} left`, tone: 'low' };
  return { label: 'In stock', tone: 'in' };
}

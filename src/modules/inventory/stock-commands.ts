import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { inventory } from '@/db/schema';
import { CommandError, defineCommand } from '@/infrastructure/commands/command';
import { recordAudit } from '@/modules/audit/audit';
import { emitEvent } from '@/lib/events';
import { currentRequestId } from '@/infrastructure/request-context';

/**
 * Changing stock counts from the consoles.
 *
 * Two commands, because they are two different acts with different safety
 * needs.
 *
 * **The owner sets an absolute count.** This is the dangerous one: a number
 * typed from memory, or from a page loaded an hour ago, overwrites whatever is
 * true now. So it is compare-and-set on the value itself — the form carries the
 * quantity it displayed, and the update succeeds only if that is still the
 * quantity. That catches every intervening change: the stockroom adding
 * twelve, a customer buying three, another owner tab. A version column would
 * have missed the first two, because relative changes need not bump it.
 *
 * **The stockroom adjusts by a delta.** "+12, I just put these away." Deltas
 * commute, so two people counting at once cannot overwrite each other, and the
 * database does the arithmetic. No precondition is needed.
 */

export const STALE_STOCK_MESSAGE =
  'This count changed since you loaded the page — a sale or the stockroom moved it. ' +
  'Reload to see the current number, then set it again.';

export const setStockSchema = z.object({
  productId: z.string().min(1).max(100),
  size: z.string().min(1).max(40),
  quantity: z.number().int().min(0).max(1_000_000),
  /** The count shown when the page loaded; null if the SKU had no row yet. */
  expectedQuantity: z.number().int().min(0).nullable(),
});

export const setStock = defineCommand({
  name: 'inventory.set',
  schema: setStockSchema,
  authorize: (actor) => actor.role === 'owner',

  async run(input, actor, tx) {
    const sku = and(eq(inventory.productId, input.productId), eq(inventory.size, input.size));
    let previous: number | null;

    if (input.expectedQuantity === null) {
      const [created] = await tx
        .insert(inventory)
        .values({ productId: input.productId, size: input.size, quantity: input.quantity })
        .onConflictDoNothing()
        .returning({ id: inventory.id });
      if (!created) throw new CommandError('conflict', STALE_STOCK_MESSAGE);
      previous = null;
    } else {
      const [updated] = await tx
        .update(inventory)
        .set({ quantity: input.quantity, updatedAt: new Date() })
        .where(and(sku, eq(inventory.quantity, input.expectedQuantity)))
        .returning({ id: inventory.id });
      if (!updated) throw new CommandError('conflict', STALE_STOCK_MESSAGE);
      previous = input.expectedQuantity;
    }

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'inventory.set',
        entityType: 'sku',
        entityId: `${input.productId}::${input.size}`,
        before: previous === null ? null : { quantity: previous },
        after: { quantity: input.quantity },
      },
      tx
    );

    await emitEvent(
      'inventory.changed',
      input.productId,
      { productId: input.productId, size: input.size, quantity: input.quantity },
      tx,
      await currentRequestId()
    );

    return { quantity: input.quantity };
  },
});

export const adjustStockSchema = z.object({
  productId: z.string().min(1).max(100),
  size: z.string().min(1).max(40),
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0 && Math.abs(d) <= 100_000, 'Enter a change between -100000 and 100000.'),
});

export const adjustStock = defineCommand({
  name: 'inventory.adjust',
  schema: adjustStockSchema,
  authorize: (actor) => actor.role === 'owner' || actor.role === 'manager',

  async run(input, actor, tx) {
    const [row] = await tx
      .insert(inventory)
      // A SKU that was never counted starts from the delta itself, clamped at
      // zero so "remove 3" from nothing does not create a negative shelf.
      .values({ productId: input.productId, size: input.size, quantity: Math.max(0, input.delta) })
      .onConflictDoUpdate({
        target: [inventory.productId, inventory.size],
        set: {
          quantity: sql`greatest(0, ${inventory.quantity} + ${input.delta})`,
          updatedAt: new Date(),
        },
      })
      .returning({ quantity: inventory.quantity });

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'inventory.adjust',
        entityType: 'sku',
        entityId: `${input.productId}::${input.size}`,
        before: null,
        after: { delta: input.delta, quantity: row.quantity },
      },
      tx
    );

    await emitEvent(
      'inventory.changed',
      input.productId,
      { productId: input.productId, size: input.size, quantity: row.quantity },
      tx,
      await currentRequestId()
    );

    return { quantity: row.quantity };
  },
});

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { inventory, stockLots } from '@/db/schema';
import { CommandError, defineCommand } from '@/infrastructure/commands/command';
import { recordAudit } from '@/modules/audit/audit';
import { emitEvent } from '@/lib/events';
import { currentRequestId } from '@/infrastructure/request-context';
import { MIN_SHELF_LIFE_DAYS, isSellableBatch } from '@/lib/inventory';

/**
 * Changing stock from the consoles. Stock now moves by batch.
 *
 * **Receiving** records a delivery: batch code, expiry date, how many. It adds
 * to the batch (a second delivery of the same batch tops it up) and to the
 * sellable total, in one transaction.
 *
 * **Adjusting a batch** is "+2, found these" or "-3, damaged". Deltas commute,
 * so two people at the shelf cannot overwrite each other, and the database
 * does the arithmetic. There is no absolute "set the total" any more: the
 * total is the sum of the batches, and a number typed over it would no longer
 * say which batch the units belong to.
 *
 * Both lock the SKU's inventory row before its batch row, the order checkout
 * uses, so a delivery and a sale of the same SKU queue instead of deadlocking.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the expiry date.')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Enter a real expiry date.');

export const receiveStockSchema = z.object({
  productId: z.string().min(1).max(100),
  size: z.string().min(1).max(40),
  batchCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9./-]{0,39}$/, 'Enter the batch number as printed on the pack (letters, digits, - / .).'),
  expiresOn: isoDate,
  quantity: z.number().int().min(1, 'Enter how many arrived.').max(100_000),
});

export const receiveStock = defineCommand({
  name: 'inventory.receive',
  schema: receiveStockSchema,
  authorize: (actor) => actor.role === 'owner' || actor.role === 'manager',

  async run(input, actor, tx) {
    if (!isSellableBatch(input.expiresOn)) {
      throw new CommandError(
        'conflict',
        `Batch ${input.batchCode} expires on ${input.expiresOn}, inside the ${MIN_SHELF_LIFE_DAYS}-day limit for sending to customers, so it cannot go on sale.`
      );
    }

    const [total] = await tx
      .insert(inventory)
      .values({ productId: input.productId, size: input.size, quantity: input.quantity })
      .onConflictDoUpdate({
        target: [inventory.productId, inventory.size],
        set: { quantity: sql`${inventory.quantity} + ${input.quantity}`, updatedAt: new Date() },
      })
      .returning({ quantity: inventory.quantity });

    const [existing] = await tx
      .select({ id: stockLots.id, expiresOn: stockLots.expiresOn })
      .from(stockLots)
      .where(
        and(
          eq(stockLots.productId, input.productId),
          eq(stockLots.size, input.size),
          eq(stockLots.batchCode, input.batchCode)
        )
      )
      .for('update');

    if (existing && existing.expiresOn !== input.expiresOn) {
      throw new CommandError(
        'conflict',
        `Batch ${input.batchCode} is already recorded with expiry ${existing.expiresOn ?? 'not recorded'}. Check the pack: one batch has one expiry date.`
      );
    }
    if (existing) {
      await tx
        .update(stockLots)
        .set({ quantity: sql`${stockLots.quantity} + ${input.quantity}` })
        .where(eq(stockLots.id, existing.id));
    } else {
      await tx.insert(stockLots).values({
        productId: input.productId,
        size: input.size,
        batchCode: input.batchCode,
        expiresOn: input.expiresOn,
        quantity: input.quantity,
        receivedBy: actor.id,
      });
    }

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'inventory.receive',
        entityType: 'sku',
        entityId: `${input.productId}::${input.size}`,
        before: null,
        after: { batch: input.batchCode, expiresOn: input.expiresOn, received: input.quantity, total: total.quantity },
      },
      tx
    );
    await emitEvent(
      'inventory.changed',
      input.productId,
      { productId: input.productId, size: input.size, quantity: total.quantity },
      tx,
      await currentRequestId()
    );
    return { quantity: total.quantity };
  },
});

export const adjustBatchSchema = z.object({
  lotId: z.number().int().positive(),
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0 && Math.abs(d) <= 100_000, 'Enter a change between -100000 and 100000.'),
  reason: z.string().trim().max(200).optional(),
});

export const adjustBatch = defineCommand({
  name: 'inventory.adjust',
  schema: adjustBatchSchema,
  authorize: (actor) => actor.role === 'owner' || actor.role === 'manager',

  async run(input, actor, tx) {
    const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId));
    if (!lot) throw new CommandError('not_found', 'That batch no longer exists.');
    if (input.delta > 0 && !isSellableBatch(lot.expiresOn)) {
      throw new CommandError(
        'conflict',
        `Batch ${lot.batchCode} is past the sending limit; it cannot go back on sale.`
      );
    }

    const sku = and(eq(inventory.productId, lot.productId), eq(inventory.size, lot.size));
    await tx.update(inventory).set({ updatedAt: new Date() }).where(sku); // lock order: inventory first
    const [current] = await tx
      .select({ quantity: stockLots.quantity })
      .from(stockLots)
      .where(eq(stockLots.id, lot.id))
      .for('update');

    // Clamped at zero, so "remove 10" from a batch of 3 removes 3 and the total moves by the same 3.
    const applied = Math.max(0, current.quantity + input.delta) - current.quantity;
    if (applied === 0) return { quantity: current.quantity };

    await tx
      .update(stockLots)
      .set({ quantity: sql`${stockLots.quantity} + ${applied}` })
      .where(eq(stockLots.id, lot.id));
    const [total] = await tx
      .update(inventory)
      .set({ quantity: sql`greatest(0, ${inventory.quantity} + ${applied})` })
      .where(sku)
      .returning({ quantity: inventory.quantity });

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'inventory.adjust',
        entityType: 'sku',
        entityId: `${lot.productId}::${lot.size}`,
        before: { batch: lot.batchCode, quantity: current.quantity },
        after: { batch: lot.batchCode, quantity: current.quantity + applied, reason: input.reason ?? null },
      },
      tx
    );
    await emitEvent(
      'inventory.changed',
      lot.productId,
      { productId: lot.productId, size: lot.size, quantity: total?.quantity ?? 0 },
      tx,
      await currentRequestId()
    );
    return { quantity: current.quantity + applied };
  },
});

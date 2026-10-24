import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { catalogVariants, productPricing } from '@/db/schema';
import { formatPaise } from '@/lib/money';
import { skuKey } from '@/modules/catalog/sku-price';
import { minProfitablePrice } from '@/modules/offers/profit';
import { getProfitSettings } from '@/modules/offers/settings';
import { CommandError, defineCommand } from '@/infrastructure/commands/command';
import { recordAudit } from '@/modules/audit/audit';
import { emitEvent } from '@/lib/events';
import { currentRequestId } from '@/infrastructure/request-context';

/**
 * Setting a SKU's price and offer.
 *
 * Optimistic concurrency: the form carries the version it was rendered from,
 * and the save succeeds only if that is still the current version. Two people
 * editing one price at once used to mean whoever pressed save second silently
 * erased the first person's change. Now the second is told, and sees what
 * changed before deciding.
 *
 * A version of 0 means "there was no override when I loaded the page". The
 * first save creates the row at version 1.
 */

export const setPriceSchema = z
  .object({
    productId: z.string().min(1).max(100),
    size: z.string().min(1).max(40),
    price: z.number().int().positive('Enter a price greater than zero.'),
    salePrice: z.number().int().positive('Enter an offer price greater than zero.').nullable(),
    offerLabel: z.string().trim().max(80).nullable(),
    offerEndsAt: z.coerce.date().nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .refine((v) => v.salePrice === null || v.salePrice < v.price, {
    message: 'The offer price must be below the normal price.',
  });

export type SetPriceInput = z.infer<typeof setPriceSchema>;

export const STALE_PRICE_MESSAGE =
  'Someone else changed this price while you were editing. Reload to see their change, then try again.';

export const setPrice = defineCommand({
  name: 'pricing.set',
  schema: setPriceSchema,
  authorize: (actor) => actor.role === 'owner',

  async run(input, actor, tx) {
    const sku = and(eq(productPricing.productId, input.productId), eq(productPricing.size, input.size));

    const [current] = await tx.select().from(productPricing).where(sku).for('update').limit(1);

    if ((current?.version ?? 0) !== input.expectedVersion) {
      throw new CommandError('conflict', STALE_PRICE_MESSAGE);
    }

    /*
     * The profit floor applies here too: a sale price is an offer by another
     * name. Refused when it would sell below cost + floor, or when there is
     * no cost price to check it against.
     */
    const [variant] = await tx
      .select({ cost: catalogVariants.costPaise })
      .from(catalogVariants)
      .where(eq(catalogVariants.legacyStockKey, skuKey(input.productId, input.size)))
      .limit(1);
    const cost = variant?.cost ?? null;
    if (input.salePrice !== null && cost === null) {
      throw new CommandError('conflict', 'Add a cost price for this size in Products before giving it a sale price.');
    }
    if (cost !== null) {
      const settings = await getProfitSettings(tx as never);
      const floor = minProfitablePrice(cost, settings);
      const selling = input.salePrice ?? input.price;
      if (selling < floor) {
        throw new CommandError(
          'conflict',
          `That price is below the profit floor of ${formatPaise(floor)} (cost + ${settings.floorPercent}% after GST and fees).`
        );
      }
    }

    const fields = {
      price: input.price,
      salePrice: input.salePrice,
      offerLabel: input.offerLabel || null,
      offerEndsAt: input.offerEndsAt,
      updatedBy: actor.id,
      updatedAt: new Date(),
    };

    let version: number;

    if (!current) {
      /*
       * First override for this SKU. Two owners saving at once would both find
       * no row and both try to insert; the unique index lets exactly one in,
       * and the other is told the price changed under them.
       */
      const [created] = await tx
        .insert(productPricing)
        .values({ productId: input.productId, size: input.size, ...fields, version: 1 })
        .onConflictDoNothing()
        .returning({ version: productPricing.version });
      if (!created) throw new CommandError('conflict', STALE_PRICE_MESSAGE);
      version = created.version;
    } else {
      const [updated] = await tx
        .update(productPricing)
        .set({ ...fields, version: current.version + 1 })
        .where(and(sku, eq(productPricing.version, current.version)))
        .returning({ version: productPricing.version });
      if (!updated) throw new CommandError('conflict', STALE_PRICE_MESSAGE);
      version = updated.version;
    }

    const snapshot = (row: typeof current | undefined) =>
      row
        ? {
            price: row.price,
            salePrice: row.salePrice,
            offerLabel: row.offerLabel,
            offerEndsAt: row.offerEndsAt?.toISOString() ?? null,
            version: row.version,
          }
        : null;

    await recordAudit(
      {
        actor: actor.id,
        actorRole: actor.role,
        action: 'pricing.set',
        entityType: 'sku',
        entityId: `${input.productId}::${input.size}`,
        before: snapshot(current),
        after: {
          price: input.price,
          salePrice: input.salePrice,
          offerLabel: input.offerLabel || null,
          offerEndsAt: input.offerEndsAt?.toISOString() ?? null,
          version,
        },
      },
      tx
    );

    await emitEvent(
      'pricing.changed',
      input.productId,
      { productId: input.productId, size: input.size, version },
      tx,
      await currentRequestId()
    );

    return { version };
  },
});

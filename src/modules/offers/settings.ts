import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as schema from '@/db/schema';
import { DEFAULT_PROFIT_SETTINGS, type ProfitSettings } from './profit';

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const KEY = 'profit';

export const profitSettingsSchema = z.object({
  floorPercent: z.coerce.number().min(0, 'The floor cannot be negative.').max(500),
  paymentFeePercent: z.coerce.number().min(0).max(10),
});

/** The owner's profit floor, or the default (cost + 20%, 2% payment fee) until one is saved. */
export async function getProfitSettings(db: Db): Promise<ProfitSettings> {
  const [row] = await db
    .select({ value: schema.shopSettings.value })
    .from(schema.shopSettings)
    .where(eq(schema.shopSettings.key, KEY))
    .limit(1);
  const parsed = profitSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_PROFIT_SETTINGS;
}

export async function saveProfitSettings(db: Db, value: ProfitSettings, by: string): Promise<void> {
  await db
    .insert(schema.shopSettings)
    .values({ key: KEY, value, updatedBy: by })
    .onConflictDoUpdate({ target: schema.shopSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}

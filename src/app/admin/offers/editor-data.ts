import { db } from '@/db';
import { PRODUCTS } from '@/data/mock-data';
import { skusForCheck } from '@/modules/offers/store';
import { getProfitSettings } from '@/modules/offers/settings';

/** The products on sale, their prices and costs, and the floor: what the offer editor checks against. */
export async function offerEditorData() {
  const [skus, settings] = await Promise.all([skusForCheck(db), getProfitSettings(db)]);
  return { products: PRODUCTS.map((p) => ({ id: p.id, name: p.name })), skus, settings };
}

import { db } from '@/db';
import { PRODUCT_CATEGORIES, SKIN_TYPES } from '@/modules/catalog/product-store';
import { SLOT_LABELS } from '@/lib/routine-slots';
import { getProfitSettings } from '@/modules/offers/settings';

/** What every editor page passes to the form: the choices and the owner's profit floor. */
export async function editorProps() {
  return {
    categories: PRODUCT_CATEGORIES,
    skinTypes: SKIN_TYPES,
    slots: Object.entries(SLOT_LABELS).map(([value, label]) => ({ value, label })),
    settings: await getProfitSettings(db),
  };
}

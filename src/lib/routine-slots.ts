import { PRODUCTS, Product } from '@/data/mock-data';
import { CATALOGUE_MODE } from '@/lib/catalogue-mode';

/**
 * Semantic slots in a routine, mapped to the catalogue SKU that fills them.
 *
 * The routine engine previously hardcoded both product ids *and* display
 * names, which let the two drift apart: it recommended `amino-acid-gel-cleanser`,
 * `relief-sun-cream` and `retinal-ampoule`, none of which exist in the
 * catalogue. Every routine therefore contained steps that could not be linked
 * or added to the bag. Slots are the single source of truth now, and
 * `assertSlotsResolve` fails loudly if a slot ever points at a missing SKU.
 */
export const SLOTS = {
  cleansingOil: 'rice-bran-cleansing-oil',
  cleansingBalm: 'centella-cleansing-balm',
  gelCleanser: 'face-wash',
  enzymeWash: 'papaya-enzyme-powder',

  tonerHydrating: 'ha-toner',
  tonerRich: 'rice-toner',

  essenceBrightening: 'galacto-essence',
  essenceRepair: 'snail-essence',
  essenceSoothing: 'heartleaf-liquid',

  vitaminC: 'vitamin-c-serum',
  niacinamide: 'niacinamide-drops',
  peptide: 'copper-peptide',
  retinol: 'retinol',

  exfoliantOily: 'lha-sebum-control',
  exfoliantGentle: 'pha-refining-fluid',

  eyePatches: 'eye-patches',

  moisturizerLight: 'sorbet-moisturizer',
  moisturizerRich: 'ceramide-cream',

  sunscreen: 'sunscreen',

  bodyLotion: 'body-lotion',
} as const;

export type SlotName = keyof typeof SLOTS;

const BY_ID = new Map<string, Product>(PRODUCTS.map((p) => [p.id, p]));

/**
 * A product the owner assigned to a slot in the product editor
 * (`routineSlot`) fills it ahead of the default sample SKU. The first
 * product listed for a slot wins.
 */
const BY_SLOT = new Map<string, Product>();
for (const p of PRODUCTS) if (p.routineSlot && !BY_SLOT.has(p.routineSlot)) BY_SLOT.set(p.routineSlot, p);

/** Close substitutes, tried in order when nothing on sale fills a slot. */
const FALLBACK: Partial<Record<SlotName, SlotName[]>> = {
  gelCleanser: ['cleansingBalm'],
  cleansingBalm: ['gelCleanser'],
  moisturizerLight: ['moisturizerRich'],
  moisturizerRich: ['moisturizerLight'],
};

const direct = (slot: SlotName) => BY_SLOT.get(slot) ?? BY_ID.get(SLOTS[slot]);

/**
 * Resolves a slot to a product on sale, or undefined when nothing fills it.
 * Callers then show the step without a product ("use one you have") or drop
 * an optional step, rather than linking to a product that is not for sale.
 */
export function productForSlot(slot: SlotName): Product | undefined {
  return direct(slot) ?? FALLBACK[slot]?.map(direct).find(Boolean);
}

/** The slots a product editor may assign, with the wording the owner sees. */
export const SLOT_LABELS: Readonly<Record<SlotName, string>> = {
  gelCleanser: 'Daily cleanser / face wash',
  cleansingBalm: 'Gentle cleanser (sensitive skin)',
  cleansingOil: 'Cleansing oil (first cleanse)',
  enzymeWash: 'Enzyme wash',
  tonerHydrating: 'Hydrating toner',
  tonerRich: 'Rich toner',
  essenceBrightening: 'Brightening essence',
  essenceRepair: 'Repair essence',
  essenceSoothing: 'Soothing essence',
  vitaminC: 'Vitamin C serum',
  niacinamide: 'Niacinamide serum',
  peptide: 'Peptide serum',
  retinol: 'Retinol / retinal',
  exfoliantOily: 'Exfoliant (oily skin)',
  exfoliantGentle: 'Exfoliant (gentle)',
  eyePatches: 'Eye patches',
  moisturizerLight: 'Light moisturiser',
  moisturizerRich: 'Rich moisturiser',
  sunscreen: 'Sunscreen',
  bodyLotion: 'Body lotion',
};

export const isSlotName = (value: string): value is SlotName => value in SLOTS;

/**
 * Returns the ids of any slots pointing at a SKU the catalogue no longer
 * carries. Empty means every slot resolves.
 */
export function unresolvedSlots(): string[] {
  return (Object.keys(SLOTS) as SlotName[])
    .filter((slot) => !productForSlot(slot))
    .map((slot) => `${slot} -> ${SLOTS[slot]}`);
}

/**
 * Throws when a slot dangles in the sample catalogue, where every slot must
 * resolve. Called from the engine at module load so a mismatch surfaces in
 * development and in CI. An owner-managed catalogue may leave slots empty on
 * purpose (a launch with five products), so it is not checked there.
 */
export function assertSlotsResolve(): void {
  if (CATALOGUE_MODE !== 'sample') return;
  const missing = unresolvedSlots();
  if (missing.length > 0) {
    throw new Error(`Routine slots reference SKUs missing from the catalogue: ${missing.join(', ')}`);
  }
}

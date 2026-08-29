import { PRODUCTS, Product } from '@/data/mock-data';

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

/** Resolves a slot to its catalogue product, or undefined if the SKU is gone. */
export function productForSlot(slot: SlotName): Product | undefined {
  return BY_ID.get(SLOTS[slot]);
}

/**
 * Returns the ids of any slots pointing at a SKU the catalogue no longer
 * carries. Empty means every slot resolves.
 */
export function unresolvedSlots(): string[] {
  return (Object.keys(SLOTS) as SlotName[])
    .filter((slot) => !BY_ID.has(SLOTS[slot]))
    .map((slot) => `${slot} -> ${SLOTS[slot]}`);
}

/**
 * Throws when a slot dangles. Called from the engine at module load so a
 * mismatch surfaces in development and in CI rather than as a silently
 * unbuyable step in a customer's routine.
 */
export function assertSlotsResolve(): void {
  const missing = unresolvedSlots();
  if (missing.length > 0) {
    throw new Error(
      `Routine slots reference SKUs missing from the catalogue: ${missing.join(', ')}`
    );
  }
}

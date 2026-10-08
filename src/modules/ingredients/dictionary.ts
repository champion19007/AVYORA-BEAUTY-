/**
 * The canonical ingredient dictionary: one id per molecule (or deliberately
 * grouped family), its INCI name, and the label spellings that mean exactly
 * that ingredient and nothing else.
 *
 * This is the single source: `npm run db:import-knowledge` copies it into
 * `ingredients` / `ingredient_aliases`, and the in-browser resolver reads it
 * directly. Previously it lived in `scripts/seed-ingredients.mjs`.
 *
 * Identity facts only. Nothing here says how much of anything is in a product
 * or what it does; that belongs to a reviewed formulation.
 */

export type IngredientClass =
  | 'retinoid'
  | 'aha'
  | 'bha'
  | 'pha'
  | 'enzyme'
  | 'peptide'
  | 'vitamin_c'
  | 'niacinamide'
  | 'peroxide'
  | 'humectant'
  | 'lipid'
  | 'uv_filter'
  | 'depigmenting'
  | 'immunomodulator'
  | 'other';

export type Ingredient = {
  id: string;
  inci: string;
  common: string;
  /** Spellings that unambiguously mean this ingredient. Normalised on use. */
  aliases: string[];
  class: IngredientClass;
  prescriptionOnly: boolean;
  pregnancyCaution: boolean;
  photosensitising: boolean;
};

export const INGREDIENTS: readonly Ingredient[] = [
  { id: 'tretinoin', inci: 'Tretinoin', common: 'Tretinoin', aliases: ['all-trans retinoic acid', 'retinoic acid'], class: 'retinoid', prescriptionOnly: true, pregnancyCaution: true, photosensitising: true },
  { id: 'adapalene', inci: 'Adapalene', common: 'Adapalene', aliases: [], class: 'retinoid', prescriptionOnly: false, pregnancyCaution: true, photosensitising: false },
  // Retinol and retinaldehyde are different molecules with different
  // directions; "vitamin a" is ambiguous between them (see AMBIGUOUS_ALIASES).
  { id: 'retinol', inci: 'Retinol', common: 'Retinol', aliases: [], class: 'retinoid', prescriptionOnly: false, pregnancyCaution: true, photosensitising: true },
  // Flags mirror retinol, the conservative choice for the same class, and
  // are listed for qualified review in implementation-progress.md.
  { id: 'retinal', inci: 'Retinal', common: 'Retinaldehyde', aliases: ['retinaldehyde'], class: 'retinoid', prescriptionOnly: false, pregnancyCaution: true, photosensitising: true },
  { id: 'benzoyl-peroxide', inci: 'Benzoyl Peroxide', common: 'Benzoyl peroxide', aliases: ['bpo'], class: 'peroxide', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'ascorbic-acid', inci: 'Ascorbic Acid', common: 'Vitamin C', aliases: ['l-ascorbic acid'], class: 'vitamin_c', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'niacinamide', inci: 'Niacinamide', common: 'Niacinamide', aliases: ['vitamin b3', 'nicotinamide'], class: 'niacinamide', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'azelaic-acid', inci: 'Azelaic Acid', common: 'Azelaic acid', aliases: [], class: 'other', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'glycolic-acid', inci: 'Glycolic Acid', common: 'Glycolic acid', aliases: [], class: 'aha', prescriptionOnly: false, pregnancyCaution: false, photosensitising: true },
  { id: 'lactic-acid', inci: 'Lactic Acid', common: 'Lactic acid', aliases: [], class: 'aha', prescriptionOnly: false, pregnancyCaution: false, photosensitising: true },
  { id: 'salicylic-acid', inci: 'Salicylic Acid', common: 'Salicylic acid', aliases: [], class: 'bha', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'urea', inci: 'Urea', common: 'Urea', aliases: ['carbamide'], class: 'humectant', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'hydroquinone', inci: 'Hydroquinone', common: 'Hydroquinone', aliases: [], class: 'depigmenting', prescriptionOnly: true, pregnancyCaution: true, photosensitising: false },
  { id: 'tacrolimus', inci: 'Tacrolimus', common: 'Tacrolimus', aliases: [], class: 'immunomodulator', prescriptionOnly: true, pregnancyCaution: false, photosensitising: false },
  { id: 'hyaluronic-acid', inci: 'Sodium Hyaluronate', common: 'Hyaluronic acid', aliases: ['hyaluronic acid'], class: 'humectant', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'ceramides', inci: 'Ceramide NP', common: 'Ceramides', aliases: ['ceramide', 'ceramide np', 'ceramide ap'], class: 'lipid', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
  { id: 'zinc-oxide', inci: 'Zinc Oxide', common: 'Zinc oxide', aliases: [], class: 'uv_filter', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false },
];

/**
 * Labels that name more than one possible ingredient. They never resolve:
 * matching "vitamin c" to ascorbic acid would hide a derivative with
 * different behaviour, and a confident warning about the wrong molecule is
 * worse than an honest "not identified".
 */
export const AMBIGUOUS_ALIASES: readonly { alias: string; candidates: string[]; note: string }[] = [
  { alias: 'vitamin a', candidates: ['retinol', 'retinal', 'retinyl esters'], note: 'Several retinoids are sold as vitamin A.' },
  { alias: 'vitamin c', candidates: ['ascorbic-acid', 'ascorbyl glucoside', 'sodium ascorbyl phosphate', 'other derivatives'], note: 'Derivatives differ in pH and behaviour.' },
  { alias: 'aha', candidates: ['glycolic-acid', 'lactic-acid', 'mandelic acid', 'other alpha hydroxy acids'], note: 'A class, not one acid.' },
  { alias: 'bha', candidates: ['salicylic-acid', 'butylated hydroxyanisole'], note: 'Also the abbreviation of a preservative.' },
  { alias: 'pha', candidates: ['gluconolactone', 'lactobionic acid'], note: 'A class, not one acid.' },
  { alias: 'retinoid', candidates: ['retinol', 'retinal', 'tretinoin', 'adapalene'], note: 'A class.' },
  { alias: 'uv filters', candidates: ['any sunscreen filter'], note: 'A class; SPF is a finished-product claim, not an ingredient.' },
  { alias: 'peptides', candidates: ['any peptide'], note: 'A class.' },
];

/**
 * Pairwise interaction rules between canonical ingredients, moved unchanged
 * from `scripts/seed-ingredients.mjs`. Tier 2 rules carry a citation; tiers
 * 3 and 4 are advice. Written to `ingredient_interactions` by
 * `npm run db:import-knowledge`, which refuses a rule naming an id the
 * dictionary does not have.
 */

export type InteractionRule = {
  a: string;
  b: string;
  tier: 2 | 3 | 4;
  summary: string;
  advice: string;
  citation: string | null;
};

const MARTIN_1998 =
  'Martin B et al. Chemical stability of adapalene and tretinoin when combined ' +
  'with benzoyl peroxide. Br J Dermatol. 1998;139 Suppl 52:8-11.';

export const INTERACTION_RULES: readonly InteractionRule[] = [
  {
    a: 'benzoyl-peroxide',
    b: 'tretinoin',
    tier: 2,
    summary: 'Benzoyl peroxide oxidises tretinoin, leaving less of it active on your skin.',
    advice: 'Use benzoyl peroxide in the morning and tretinoin at night, not together.',
    citation: MARTIN_1998,
  },
  /*
   * No row for benzoyl peroxide with adapalene, and that absence is the point.
   * The same study that found tretinoin degrades found adapalene stable — the
   * two are sold co-formulated. A class-wide "retinoid" rule would warn people
   * off a combination dermatologists prescribe deliberately.
   */
  {
    a: 'glycolic-acid',
    b: 'salicylic-acid',
    tier: 3,
    summary:
      'Two strong exfoliants in one routine can irritate more than either does alone. ' +
      'This is additive irritation rather than a documented chemical reaction.',
    advice: 'Alternate them on different days, and stop if your skin starts to sting or flake.',
    citation: null,
  },
  {
    a: 'glycolic-acid',
    b: 'tretinoin',
    tier: 3,
    summary: 'Acids and retinoids together often irritate more than the sum of the two.',
    advice: 'Start on alternate nights and build up only if your skin stays comfortable.',
    citation: null,
  },
  {
    a: 'ascorbic-acid',
    b: 'tretinoin',
    tier: 4,
    summary:
      'Vitamin C works at a low pH and retinoids at a higher one, so applying them ' +
      'together can make each less effective. Neither will harm the other.',
    advice: 'Vitamin C in the morning, retinoid at night gets the most out of both.',
    citation: null,
  },
  {
    a: 'ascorbic-acid',
    b: 'retinol',
    tier: 4,
    summary: 'The same pH mismatch as with tretinoin: less effect, no harm.',
    advice: 'Split them across morning and evening.',
    citation: null,
  },
];

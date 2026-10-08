/**
 * What role each catalogue product can play in a face routine.
 *
 * Product categorisation, not a clinical rule. It is explicit because the
 * catalogue's `category` cannot be used: the sunscreen, the sun stick and
 * the lip mask are all categorised `moisturizer`, and an exfoliating enzyme
 * powder is a `cleanser`. A test fails if a product has no entry.
 *
 * - `cleanse`, `moisturise`, `protect`: the essential slots.
 * - `treatment`: an elective active (see `TREATMENTS`); needs approved
 *   directions and a complete formulation.
 * - `optional`: never required (toners, essences, masks, eye patches, an
 *   oil first-cleanse, a reapplication stick).
 * - `none`: not part of a face routine (lip and body care).
 */
export type RoutineRole = 'cleanse' | 'moisturise' | 'protect' | 'treatment' | 'optional' | 'none';

export const ROUTINE_ROLES: Readonly<Record<string, RoutineRole>> = {
  'face-wash': 'cleanse',
  'centella-cleansing-balm': 'cleanse',
  'rice-bran-cleansing-oil': 'optional',
  'papaya-enzyme-powder': 'treatment',
  'pha-refining-fluid': 'treatment',
  'lha-sebum-control': 'treatment',
  'bifida-exfoliating-pads': 'treatment',
  'ha-toner': 'optional',
  'rice-toner': 'optional',
  'heartleaf-liquid': 'optional',
  'galacto-essence': 'optional',
  'snail-essence': 'optional',
  'kombucha-essence': 'optional',
  'vitamin-c-serum': 'treatment',
  'niacinamide-drops': 'treatment',
  retinol: 'treatment',
  'copper-peptide': 'treatment',
  'pdrn-booster': 'optional',
  'propolis-ampoule': 'optional',
  'collagen-mask': 'optional',
  'eye-patches': 'optional',
  'ceramide-cream': 'moisturise',
  'sorbet-moisturizer': 'moisturise',
  sunscreen: 'protect',
  'sun-stick': 'optional',
  'lip-mask': 'none',
  'body-lotion': 'none',
};

/** Which session an essential role belongs to. */
export const ESSENTIAL_SESSIONS: Readonly<Record<'cleanse' | 'moisturise' | 'protect', ('am' | 'pm')[]>> = {
  cleanse: ['am', 'pm'],
  moisturise: ['am', 'pm'],
  protect: ['am'],
};

import { PRODUCTS } from '@/data/mock-data';

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

const SAMPLE_ROLES: Readonly<Record<string, RoutineRole>> = {
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

/** The role each routine slot (lib/routine-slots.ts) plays, for products the owner assigned to one. */
const SLOT_ROLES: Readonly<Record<string, RoutineRole>> = {
  gelCleanser: 'cleanse',
  cleansingBalm: 'cleanse',
  cleansingOil: 'optional',
  enzymeWash: 'treatment',
  tonerHydrating: 'optional',
  tonerRich: 'optional',
  essenceBrightening: 'optional',
  essenceRepair: 'optional',
  essenceSoothing: 'optional',
  vitaminC: 'treatment',
  niacinamide: 'treatment',
  peptide: 'treatment',
  retinol: 'treatment',
  exfoliantOily: 'treatment',
  exfoliantGentle: 'treatment',
  eyePatches: 'optional',
  moisturizerLight: 'moisturise',
  moisturizerRich: 'moisturise',
  sunscreen: 'protect',
  bodyLotion: 'none',
};

/**
 * Every product's role: the sample table above, plus the role implied by
 * the "Role in routines" slot the owner chose in the product editor. A
 * product with neither is `optional` in the planner's eyes only if listed;
 * unlisted products are simply not placed in routines.
 */
export const ROUTINE_ROLES: Readonly<Record<string, RoutineRole>> = {
  ...SAMPLE_ROLES,
  ...Object.fromEntries(
    PRODUCTS.flatMap((p) => (p.routineSlot && SLOT_ROLES[p.routineSlot] ? [[p.id, SLOT_ROLES[p.routineSlot]]] : []))
  ),
};

/** Which session an essential role belongs to. */
export const ESSENTIAL_SESSIONS: Readonly<Record<'cleanse' | 'moisturise' | 'protect', ('am' | 'pm')[]>> = {
  cleanse: ['am', 'pm'],
  moisturise: ['am', 'pm'],
  protect: ['am'],
};

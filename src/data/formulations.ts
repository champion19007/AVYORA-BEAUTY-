/**
 * Verified formulation records and the evidence they came from.
 *
 * Both are deliberately empty. No product in this repository has a verified
 * full INCI list, concentration or formulation document: the catalogue's
 * `ingredients` arrays are marketing highlights ("Niacinamide 10%",
 * "Hyaluronic Acid (5 Weights)"), which this system never treats as
 * formulation data. Every product therefore has `unknown` coverage, and no
 * treatment can be recommended until a reviewer adds its record here and
 * its directions in `product-directions.ts`.
 *
 * To add one: record the evidence source (the formulation dossier or the
 * printed label), then the formulation with every INCI position in order and
 * each concentration as known (value + unit) or `{ known: false }`. Run
 * `npm test` and `npm run db:import-knowledge`; both refuse invalid records.
 */
import type { EvidenceSource, Formulation } from '@/modules/ingredients/formulations';

export const EVIDENCE_SOURCES: readonly EvidenceSource[] = [];

export const FORMULATIONS: readonly Formulation[] = [];

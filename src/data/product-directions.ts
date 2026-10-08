/**
 * Product usage directions, and which products count as treatments.
 *
 * A treatment (a retinoid, vitamin C, an exfoliant, a concentrated active) may
 * enter a recommended routine only once it has **approved, product-specific
 * directions**: how often, which session, by whom they were reviewed and from
 * what source. Until then the routine finder leaves the treatment slot empty
 * and says why, rather than prescribing a frequency someone made up.
 *
 * `APPROVED_DIRECTIONS` is deliberately empty. No reviewed directions exist in
 * this repository: the audit found generic "use twice daily" copy on every
 * product, including the retinal ampoule, and that is exactly what this
 * replaces. Add an entry only from a qualified reviewer's sign-off for the
 * finished formulation. Each entry is the usage profile for one formulation
 * version in `src/data/formulations.ts`, and also needs that formulation to
 * be complete before the treatment can be recommended.
 */

export type ProductDirections = {
  /** When in the day the product is used. */
  session: 'am' | 'pm' | 'am_or_pm';
  /** The approved frequency, as it will be shown, e.g. "Once a week to start". */
  frequency: string;
  /** The approved directions, shown verbatim. Plain text. */
  text: string;
  /** Who approved them, and when (ISO date). */
  reviewedBy: string;
  reviewedAt: string;
  /** What they were approved from: label, formulation dossier, clinician note. */
  source: string;
  /**
   * The formulation version these directions were approved for. A new
   * version needs its own approval; directions never carry over silently.
   */
  formulationVersion: number;
  /** Upper bound on uses per week, as approved; null when not limited. */
  maxWeeklyUses: number | null;
  /**
   * Approved uses per week while the product is being introduced (the first
   * week), if the reviewer set a slower start. Absent: the planner uses
   * `maxWeeklyUses` from the start; it never invents a ramp.
   */
  introductionWeeklyUses?: number;
  /** Evidence sources (`src/data/formulations.ts`) the approval relied on. */
  evidenceIds: string[];
};

export const APPROVED_DIRECTIONS: Readonly<Record<string, ProductDirections>> = {};

/**
 * Treatment classes, by catalogue product.
 *
 * This is product categorisation, not a clinical rule: it records which
 * catalogue items are elective actives rather than cleansers, moisturisers
 * and sunscreen. `electiveIrritating` marks the classes the specification
 * names for removal from irritated and very reactive routines: retinoids,
 * vitamin C and exfoliants. Classes are from the product names and ingredient
 * highlights, which are not full formulations (audit #18); review them with
 * the formulation records.
 */
export type TreatmentClass = 'retinoid' | 'vitamin_c' | 'exfoliant' | 'niacinamide' | 'peptide';

export const TREATMENTS: Readonly<Record<string, { class: TreatmentClass; electiveIrritating: boolean }>> = {
  retinol: { class: 'retinoid', electiveIrritating: true },
  'vitamin-c-serum': { class: 'vitamin_c', electiveIrritating: true },
  'lha-sebum-control': { class: 'exfoliant', electiveIrritating: true },
  'pha-refining-fluid': { class: 'exfoliant', electiveIrritating: true },
  'bifida-exfoliating-pads': { class: 'exfoliant', electiveIrritating: true },
  'papaya-enzyme-powder': { class: 'exfoliant', electiveIrritating: true },
  'niacinamide-drops': { class: 'niacinamide', electiveIrritating: false },
  'copper-peptide': { class: 'peptide', electiveIrritating: false },
};

export function isTreatment(productId: string): boolean {
  return productId in TREATMENTS;
}

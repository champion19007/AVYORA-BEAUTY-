/**
 * Versioned formulation records, evidence references, and the checks that
 * decide whether a product's knowledge is complete enough to publish or to
 * recommend as a treatment.
 *
 * A formulation is the finished product's full INCI in label order, each
 * position optionally resolved to a canonical ingredient, with a
 * concentration that is either known (value + explicit unit) or explicitly
 * unknown. Ingredient highlights on product cards are NOT formulation data
 * and never stand in for it.
 *
 * Pure. Records live in `src/data/formulations.ts`; the importer copies them
 * to the database after these checks pass.
 */
import { INGREDIENTS, type IngredientClass } from './dictionary';
import { normaliseLabel, resolveLabel } from './resolve';
import type { ProductDirections, TreatmentClass } from '@/data/product-directions';

export const CONCENTRATION_UNITS = ['percent_w_w', 'percent_w_v', 'mg_per_g', 'mg_per_ml'] as const;
export type ConcentrationUnit = (typeof CONCENTRATION_UNITS)[number];

export type Concentration = { known: true; value: number; unit: ConcentrationUnit } | { known: false };

export type FormulationIngredient = {
  /** 1-based position in the INCI list. */
  position: number;
  /** The INCI name exactly as declared. */
  inciLabel: string;
  /** Canonical id, or null when the dictionary has no entry for it yet. */
  ingredientId: string | null;
  concentration: Concentration;
};

/**
 * - `complete`: the full declared INCI list is recorded, in order.
 * - `partial`: some ingredients are known, the full list is not.
 * - `unknown`: nothing verified beyond the product's existence.
 */
export type Coverage = 'complete' | 'partial' | 'unknown';

export type Formulation = {
  productId: string;
  version: number;
  coverage: Coverage;
  /** The declared INCI list, verbatim. Required for `complete`. */
  fullInci: string | null;
  ingredients: FormulationIngredient[];
  /** Evidence source the record was taken from. */
  sourceId: string;
  reviewedBy: string;
  reviewedAt: string;
};

export type EvidenceSource = {
  id: string;
  title: string;
  url: string | null;
  sourceType: 'formulation_dossier' | 'label' | 'regulation' | 'literature' | 'clinician_note';
  retrievedAt: string;
  limitations: string;
};

export type Knowledge = {
  formulations: readonly Formulation[];
  evidence: readonly EvidenceSource[];
  directions: Readonly<Record<string, ProductDirections>>;
};

const DICTIONARY = new Map(INGREDIENTS.map((i) => [i.id, i]));

/** Which ingredient classes count as the active for each treatment class. */
const ACTIVE_CLASSES: Record<TreatmentClass, readonly IngredientClass[]> = {
  retinoid: ['retinoid'],
  vitamin_c: ['vitamin_c'],
  exfoliant: ['aha', 'bha', 'pha', 'enzyme'],
  niacinamide: ['niacinamide'],
  peptide: ['peptide'],
};

/** Splits a declared INCI list on commas, keeping commas inside names such as "1,2-Hexanediol". */
export function splitInci(fullInci: string): string[] {
  return fullInci
    .split(/,(?!\d)/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Allergen resolution of a formulation: complete label coverage is not
 * complete identity coverage. An allergy can be cleared only when every
 * declared ingredient resolved to a canonical id.
 */
export function unresolvedIngredients(f: Formulation): string[] {
  return f.ingredients.filter((i) => i.ingredientId === null).map((i) => i.inciLabel);
}

/** Problems that must block import and publication of one formulation. */
export function formulationProblems(f: Formulation, evidence: readonly EvidenceSource[]): string[] {
  const where = `${f.productId} v${f.version}`;
  const problems: string[] = [];

  if (!Number.isInteger(f.version) || f.version < 1) problems.push(`${where}: version must be a positive integer`);
  if (!evidence.some((e) => e.id === f.sourceId))
    problems.push(`${where}: evidence source ${f.sourceId} does not exist`);

  const positions = f.ingredients.map((i) => i.position).sort((a, b) => a - b);
  if (positions.some((p, i) => p !== i + 1))
    problems.push(`${where}: positions must run 1..${positions.length} without gaps or repeats`);

  let percentTotal = 0;
  for (const ing of f.ingredients) {
    const at = `${where} #${ing.position} "${ing.inciLabel}"`;
    const r = resolveLabel(ing.inciLabel);
    if (r.status === 'ambiguous')
      problems.push(`${at}: ambiguous label (${r.candidates.join(', ')}); declare the exact INCI name`);
    if (ing.ingredientId !== null) {
      if (!DICTIONARY.has(ing.ingredientId)) problems.push(`${at}: unknown ingredient id ${ing.ingredientId}`);
      else if (r.status === 'resolved' && r.id !== ing.ingredientId)
        problems.push(`${at}: label resolves to ${r.id}, record says ${ing.ingredientId}`);
    } else if (r.status === 'resolved') {
      // A label the dictionary knows must carry its identity, or allergy and active checks would miss it.
      problems.push(`${at}: label resolves to ${r.id}; record its canonical id`);
    }
    const c = ing.concentration;
    if (c.known) {
      if (!(CONCENTRATION_UNITS as readonly string[]).includes(c.unit))
        problems.push(`${at}: invalid unit ${String(c.unit)}`);
      if (!Number.isFinite(c.value) || c.value <= 0) problems.push(`${at}: concentration must be a positive number`);
      if (c.unit.startsWith('percent')) {
        if (c.value > 100) problems.push(`${at}: concentration above 100%`);
        percentTotal += c.value;
      }
    }
  }
  if (percentTotal > 100) problems.push(`${where}: known percentages add up to more than 100%`);

  if (f.coverage === 'complete') {
    if (!f.fullInci?.trim()) problems.push(`${where}: complete coverage needs the full INCI list`);
    else {
      const declared = splitInci(f.fullInci);
      const rows = [...f.ingredients].sort((a, b) => a.position - b.position);
      if (declared.length !== rows.length) {
        problems.push(`${where}: full INCI lists ${declared.length} ingredients, record has ${rows.length}`);
      }
      // Identity and order, not just count: entry n of the declared list is structured row n.
      declared.forEach((label, i) => {
        const row = rows[i];
        if (row && normaliseLabel(row.inciLabel) !== normaliseLabel(label)) {
          problems.push(`${where} #${i + 1}: full INCI says "${label}", structured row says "${row.inciLabel}"`);
        }
      });
    }
  }
  if (f.coverage === 'unknown' && f.ingredients.length > 0)
    problems.push(`${where}: unknown coverage cannot list ingredients; use partial`);

  return problems;
}

/** Problems across the whole knowledge set: duplicates, broken links, every formulation. */
export function knowledgeProblems(k: Knowledge): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of k.formulations) {
    const key = `${f.productId}@${f.version}`;
    if (seen.has(key)) problems.push(`Duplicate formulation ${key}`);
    seen.add(key);
    problems.push(...formulationProblems(f, k.evidence));
  }
  const evidenceIds = new Set<string>();
  for (const e of k.evidence) {
    if (evidenceIds.has(e.id)) problems.push(`Duplicate evidence source ${e.id}`);
    evidenceIds.add(e.id);
    if (e.url !== null && !/^https:\/\//.test(e.url)) problems.push(`Evidence ${e.id}: url must be https or null`);
  }
  for (const [productId, d] of Object.entries(k.directions)) {
    if (!k.formulations.some((f) => f.productId === productId && f.version === d.formulationVersion)) {
      problems.push(`Directions for ${productId} name formulation v${d.formulationVersion}, which does not exist`);
    }
    for (const id of d.evidenceIds)
      if (!evidenceIds.has(id)) problems.push(`Directions for ${productId}: evidence ${id} does not exist`);
    if (
      d.maxWeeklyUses !== null &&
      (!Number.isInteger(d.maxWeeklyUses) || d.maxWeeklyUses < 1 || d.maxWeeklyUses > 14)
    ) {
      problems.push(`Directions for ${productId}: maxWeeklyUses must be 1-14 or null`);
    }
    if (d.introductionWeeklyUses !== undefined) {
      const ceiling = d.maxWeeklyUses ?? 14;
      if (
        !Number.isInteger(d.introductionWeeklyUses) ||
        d.introductionWeeklyUses < 1 ||
        d.introductionWeeklyUses > ceiling
      ) {
        problems.push(`Directions for ${productId}: introductionWeeklyUses must be 1-${ceiling}`);
      }
    }
  }
  return problems;
}

/** The highest version on record, or undefined. */
export function latestFormulation(productId: string, formulations: readonly Formulation[]): Formulation | undefined {
  return formulations.filter((f) => f.productId === productId).sort((a, b) => b.version - a.version)[0];
}

export function coverageOf(productId: string, formulations: readonly Formulation[]): Coverage {
  return latestFormulation(productId, formulations)?.coverage ?? 'unknown';
}

export type Readiness =
  { ready: true } | { ready: false; reason: 'directions_pending' | 'formulation_incomplete'; problems: string[] };

/**
 * Whether a treatment may enter a routine: approved directions for a
 * specific formulation version, and that formulation complete, valid, with
 * its active identified and its concentration known. Anything missing means
 * "not yet", never "assume it is fine".
 */
export function treatmentReadiness(productId: string, treatmentClass: TreatmentClass, k: Knowledge): Readiness {
  const directions = k.directions[productId];
  if (!directions) return { ready: false, reason: 'directions_pending', problems: ['No approved directions'] };

  const f = k.formulations.find((x) => x.productId === productId && x.version === directions.formulationVersion);
  if (!f)
    return {
      ready: false,
      reason: 'formulation_incomplete',
      problems: [`No formulation v${directions.formulationVersion}`],
    };

  const problems = formulationProblems(f, k.evidence);
  if (f.coverage !== 'complete') problems.push(`Coverage is ${f.coverage}, not complete`);
  for (const id of directions.evidenceIds)
    if (!k.evidence.some((e) => e.id === id)) problems.push(`Evidence ${id} missing`);

  const classes = ACTIVE_CLASSES[treatmentClass];
  const active = f.ingredients.find((i) => {
    const cls = i.ingredientId ? DICTIONARY.get(i.ingredientId)?.class : undefined;
    return cls !== undefined && classes.includes(cls);
  });
  if (!active) problems.push(`No identified ${treatmentClass} active in the formulation`);
  else if (!active.concentration.known) problems.push(`Concentration of ${active.inciLabel} is unknown`);

  return problems.length ? { ready: false, reason: 'formulation_incomplete', problems } : { ready: true };
}

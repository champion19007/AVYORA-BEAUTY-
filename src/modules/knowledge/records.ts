/**
 * Knowledge records that go into a release.
 *
 * Every record that carries clinical, safety or customer-facing meaning has
 * a `review`: who approved it, when, and from which evidence. A release may
 * contain only approved records; drafts are reported as awaiting review and
 * never compiled. Identity data (catalogue products, ingredient INCI names
 * and aliases) needs no clinical review, but an ingredient's caution flags
 * do, and are published as `unreviewed` until they have one.
 */
import type { Predicate } from './predicate';
import type { Ingredient } from '@/modules/ingredients/dictionary';
import type { InteractionRule } from '@/modules/ingredients/interaction-rules';
import type { EvidenceSource, Formulation } from '@/modules/ingredients/formulations';
import type { ProductDirections, TreatmentClass } from '@/data/product-directions';
import type { CatalogProductRecord, CatalogVariantRecord } from '@/modules/catalog/catalog-records';

export type Review =
  | { status: 'draft'; note?: string }
  | { status: 'approved'; reviewerId: string; reviewedAt: string; sourceIds: string[] };

/** What a rule does when its condition holds. Safety effects always run before ranking. */
export type RuleEffect =
  | { kind: 'mode'; value: 'recovery' | 'gentle' | 'essentials' }
  | { kind: 'excludeClass'; value: TreatmentClass | 'elective_irritating' }
  | { kind: 'maxTreatments'; value: number }
  | { kind: 'askClarification'; field: string };

export type DecisionRule = {
  id: string;
  version: number;
  /** Safety rules exclude or constrain; advisory rules only shape presentation. */
  severity: 'safety' | 'advisory';
  when: Predicate;
  effects: RuleEffect[];
  reasonTemplateId: string;
  review: Review;
};

export type InteractionRecord = InteractionRule & { review: Review };

/** Ingredient identity plus caution flags, the flags published only once reviewed. */
export type IngredientRecord = Ingredient & { cautionsReview: Review };

/**
 * One concern's prior and per-evidence-group likelihoods.
 *
 * `validationStatus`:
 * - `validated`: fitted and calibrated on consented, labelled data; needs
 *   training and calibration versions and evidence.
 * - `provisional`: a stated assumption with provenance; consumers must show
 *   uncertain categories, never precise probabilities.
 * - `synthetic_fixture`: test data. Never allowed in a production release.
 */
export type BayesParameter = {
  id: string;
  concern: string;
  prior: number;
  groups: { evidenceGroup: string; observation: string; pGivenConcern: number; pGivenNotConcern: number }[];
  validationStatus: 'validated' | 'provisional' | 'synthetic_fixture';
  provenance: { trainingVersion: string | null; calibrationVersion: string | null; counts: number | null; note: string };
  /**
   * What these likelihoods were calibrated on. Evidence outside it is
   * rejected as out of scope, never extrapolated: quiz-calibrated ratios say
   * nothing about a photo model, and one photo model's categories say
   * nothing about another version's.
   */
  calibrationScope: { sources: ('quiz' | 'photo')[]; photoModelVersions: string[] };
  review: Review;
};

/** Plain-language text with named `{placeholders}`; only declared variables may appear. */
export type ExplanationTemplate = { id: string; text: string; variables: string[]; review: Review };

export type EducationAnswer = { id: string; questionAliases: string[]; answer: string; scope: string; review: Review };

export type KnowledgeInput = {
  catalogue: { products: CatalogProductRecord[]; variants: CatalogVariantRecord[] };
  ingredients: IngredientRecord[];
  interactions: InteractionRecord[];
  formulations: Formulation[];
  directions: Record<string, ProductDirections>;
  treatments: Record<string, { class: TreatmentClass; electiveIrritating: boolean }>;
  rules: DecisionRule[];
  parameters: BayesParameter[];
  templates: ExplanationTemplate[];
  education: EducationAnswer[];
  evidence: EvidenceSource[];
};

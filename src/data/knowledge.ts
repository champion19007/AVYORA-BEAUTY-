/**
 * Knowledge awaiting qualified review, as records.
 *
 * `DECISION_RULES` restates, as data, the safety policies the routine engine
 * applies today in code (prompt 3). They are engineering assumptions, not
 * reviewed clinical rules, so every one is a draft: the release compiler
 * refuses drafts, and `npm run kb:build` lists them as awaiting review. A
 * reviewer approves one by replacing its `review` with the approved form
 * (reviewer, date, evidence source ids in `src/data/formulations.ts`).
 *
 * Bayesian parameters, approved explanation templates and education answers
 * do not exist yet; their registries are empty rather than filled with
 * invented numbers or copy. Interaction rules and ingredient caution flags
 * are unreviewed until an entry appears in the review maps below.
 */
import type {
  BayesParameter,
  DecisionRule,
  EducationAnswer,
  ExplanationTemplate,
  Review,
} from '@/modules/knowledge/records';

const DRAFT: Review = { status: 'draft', note: 'Engineering assumption from prompt 3; awaiting clinician review.' };

export const DECISION_RULES: readonly DecisionRule[] = [
  {
    id: 'irritated_recovery',
    version: 1,
    severity: 'safety',
    when: { op: 'eq', field: 'currentCondition', value: 'irritated' },
    effects: [
      { kind: 'mode', value: 'recovery' },
      { kind: 'excludeClass', value: 'elective_irritating' },
    ],
    reasonTemplateId: 'reason_irritated',
    review: DRAFT,
  },
  {
    id: 'very_reactive_gentle',
    version: 1,
    severity: 'safety',
    // Irritation takes precedence, so the two mode rules never overlap.
    when: {
      op: 'all',
      of: [
        { op: 'eq', field: 'reactivity', value: 'very_high' },
        { op: 'not', of: { op: 'eq', field: 'currentCondition', value: 'irritated' } },
      ],
    },
    effects: [
      { kind: 'mode', value: 'gentle' },
      { kind: 'excludeClass', value: 'elective_irritating' },
    ],
    reasonTemplateId: 'reason_very_reactive',
    review: DRAFT,
  },
  {
    id: 'beginner_no_treatments',
    version: 1,
    severity: 'safety',
    when: { op: 'in', field: 'experienceLevel', values: ['N0', 'N1'] },
    effects: [{ kind: 'maxTreatments', value: 0 }],
    reasonTemplateId: 'reason_beginner',
    review: DRAFT,
  },
  {
    id: 'retinoid_pregnancy',
    version: 1,
    severity: 'safety',
    when: { op: 'in', field: 'pregnancy', values: ['yes', 'unknown'] },
    effects: [{ kind: 'excludeClass', value: 'retinoid' }],
    reasonTemplateId: 'reason_pregnancy',
    review: DRAFT,
  },
  {
    id: 'retinoid_under18',
    version: 1,
    severity: 'safety',
    when: { op: 'eq', field: 'ageRange', value: 'under18' },
    effects: [{ kind: 'excludeClass', value: 'retinoid' }],
    reasonTemplateId: 'reason_under18',
    review: DRAFT,
  },
  {
    id: 'one_active_at_a_time',
    version: 1,
    severity: 'safety',
    when: {
      op: 'any',
      of: [
        { op: 'eq', field: 'experienceLevel', value: 'N2' },
        { op: 'eq', field: 'reactivity', value: 'high' },
      ],
    },
    effects: [{ kind: 'maxTreatments', value: 1 }],
    reasonTemplateId: 'reason_treatment_limit',
    review: DRAFT,
  },
  {
    // Complexity policy, not a skin rule: someone expecting to follow a routine
    // "now and then" gets the essentials first. Proposed with the answer adapter
    // (re-audit A09) and inactive until reviewed, like every rule here.
    id: 'low_adherence_essentials_first',
    version: 1,
    severity: 'advisory',
    when: { op: 'eq', field: 'adherence', value: 'low' },
    effects: [{ kind: 'maxTreatments', value: 0 }],
    reasonTemplateId: 'reason_low_adherence',
    review: { status: 'draft', note: 'Proposed complexity policy for the adherence answer; awaiting review.' },
  },
];

/** The customer-facing reasons the routine finder shows today, as draft templates. */
export const EXPLANATION_TEMPLATES: readonly ExplanationTemplate[] = [
  {
    id: 'reason_irritated',
    text: '{productName}: left out while your skin is irritated.',
    variables: ['productName'],
    review: DRAFT,
  },
  {
    id: 'reason_very_reactive',
    text: '{productName}: left out because your skin is very reactive.',
    variables: ['productName'],
    review: DRAFT,
  },
  {
    id: 'reason_beginner',
    text: '{productName}: left out of a starter routine. Get used to the essentials first.',
    variables: ['productName'],
    review: DRAFT,
  },
  {
    id: 'reason_pregnancy',
    text: '{productName}: not included while pregnant, breastfeeding, or if you preferred not to say.',
    variables: ['productName'],
    review: DRAFT,
  },
  {
    id: 'reason_under18',
    text: '{productName}: not included for customers under 18.',
    variables: ['productName'],
    review: DRAFT,
  },
  {
    id: 'reason_treatment_limit',
    text: '{productName}: left out so your routine introduces one active at a time.',
    variables: ['productName'],
    review: DRAFT,
  },
  {
    id: 'reason_low_adherence',
    text: '{productName}: left out so your routine starts with the essentials you can keep up.',
    variables: ['productName'],
    review: DRAFT,
  },
];

export const EDUCATION_ANSWERS: readonly EducationAnswer[] = [];

export const BAYES_PARAMETERS: readonly BayesParameter[] = [];

/** Approved reviews of interaction rules, keyed "a/b" (sorted ids). None yet. */
export const INTERACTION_REVIEWS: Readonly<Record<string, Review>> = {};

/** Approved reviews of an ingredient's caution flags, by ingredient id. None yet. */
export const INGREDIENT_CAUTION_REVIEWS: Readonly<Record<string, Review>> = {};

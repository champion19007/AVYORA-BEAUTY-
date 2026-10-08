/**
 * DEVELOPMENT FIXTURE: NOT CLINICAL KNOWLEDGE.
 *
 * Test data for the release compiler. Every "approval" below is signed by
 * a fixture reviewer against a fixture evidence source; the formulation,
 * directions, concentrations and Bayesian parameters are invented to
 * exercise the compiler and must never be published. A fixture release is
 * marked `fixture: true` in its manifest, and the database refuses to make
 * one active.
 */
import { DECISION_RULES, EXPLANATION_TEMPLATES } from '@/data/knowledge';
import { INGREDIENTS } from '@/modules/ingredients/dictionary';
import { INTERACTION_RULES } from '@/modules/ingredients/interaction-rules';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { PRODUCTS } from '@/data/mock-data';
import { TREATMENTS } from '@/data/product-directions';
import type { KnowledgeInput, Review } from '../records';

export const FIXTURE_EVIDENCE_ID = 'fixture-evidence-not-real';

export const FIXTURE_REVIEW: Review = {
  status: 'approved',
  reviewerId: 'DEVELOPMENT FIXTURE (not a reviewer)',
  reviewedAt: '2026-01-01',
  sourceIds: [FIXTURE_EVIDENCE_ID],
};

export function developmentFixtureInput(): KnowledgeInput {
  return {
    catalogue: catalogRecords(PRODUCTS),
    ingredients: INGREDIENTS.map((i) => ({ ...i, cautionsReview: FIXTURE_REVIEW })),
    interactions: INTERACTION_RULES.map((r) => ({ ...r, review: FIXTURE_REVIEW })),
    formulations: [
      {
        productId: 'niacinamide-drops',
        version: 1,
        coverage: 'complete',
        fullInci: 'Aqua, Niacinamide, Glycerin',
        ingredients: [
          { position: 1, inciLabel: 'Aqua', ingredientId: null, concentration: { known: false } },
          { position: 2, inciLabel: 'Niacinamide', ingredientId: 'niacinamide', concentration: { known: true, value: 5, unit: 'percent_w_w' } },
          { position: 3, inciLabel: 'Glycerin', ingredientId: null, concentration: { known: false } },
        ],
        sourceId: FIXTURE_EVIDENCE_ID,
        reviewedBy: 'DEVELOPMENT FIXTURE',
        reviewedAt: '2026-01-01',
      },
    ],
    directions: {
      'niacinamide-drops': {
        session: 'am',
        frequency: 'FIXTURE FREQUENCY',
        text: 'FIXTURE DIRECTIONS, not real',
        reviewedBy: 'DEVELOPMENT FIXTURE',
        reviewedAt: '2026-01-01',
        source: 'fixture',
        formulationVersion: 1,
        maxWeeklyUses: 7,
        evidenceIds: [FIXTURE_EVIDENCE_ID],
      },
    },
    treatments: { ...TREATMENTS },
    rules: DECISION_RULES.map((r) => ({ ...r, review: FIXTURE_REVIEW })),
    parameters: [
      {
        id: 'fixture-acne',
        concern: 'acne',
        prior: 0.2,
        groups: [
          { evidenceGroup: 'self_report_breakouts', observation: 'frequent', pGivenConcern: 0.6, pGivenNotConcern: 0.2 },
          { evidenceGroup: 'self_report_oiliness', observation: 'yes', pGivenConcern: 0.5, pGivenNotConcern: 0.25 },
        ],
        validationStatus: 'synthetic_fixture',
        provenance: { trainingVersion: null, calibrationVersion: null, counts: null, note: 'Synthetic: illustrates the arithmetic only.' },
        calibrationScope: { sources: ['quiz'], photoModelVersions: [] },
        review: FIXTURE_REVIEW,
      },
    ],
    templates: EXPLANATION_TEMPLATES.map((t) => ({ ...t, review: FIXTURE_REVIEW })),
    education: [
      {
        id: 'fixture-what-is-spf',
        questionAliases: ['what is spf', 'spf meaning'],
        answer: 'FIXTURE ANSWER, not approved copy.',
        scope: 'fixture',
        review: FIXTURE_REVIEW,
      },
    ],
    evidence: [
      {
        id: FIXTURE_EVIDENCE_ID,
        title: 'Development fixture: not a real source',
        url: null,
        sourceType: 'label',
        retrievedAt: '2026-01-01',
        limitations: 'Invented for tests.',
      },
    ],
  };
}

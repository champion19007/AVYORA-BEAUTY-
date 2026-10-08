/**
 * Assembles the production knowledge input from the repository registries,
 * keeping only approved records. Drafts are not compiled: they are listed
 * in `awaitingReview` so a reviewer can see exactly what is missing.
 */
import { PRODUCTS } from '@/data/mock-data';
import { APPROVED_DIRECTIONS, TREATMENTS } from '@/data/product-directions';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import {
  BAYES_PARAMETERS,
  DECISION_RULES,
  EDUCATION_ANSWERS,
  EXPLANATION_TEMPLATES,
  INGREDIENT_CAUTION_REVIEWS,
  INTERACTION_REVIEWS,
} from '@/data/knowledge';
import { INGREDIENTS } from '@/modules/ingredients/dictionary';
import { INTERACTION_RULES } from '@/modules/ingredients/interaction-rules';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import type { KnowledgeInput, Review } from './records';

const UNREVIEWED: Review = { status: 'draft', note: 'No qualified review on record.' };
const approved = <T extends { review: Review }>(xs: readonly T[]) => xs.filter((x) => x.review.status === 'approved');

export function productionInput(): { input: KnowledgeInput; awaitingReview: string[] } {
  const interactions = INTERACTION_RULES.map((r) => ({
    ...r,
    review: INTERACTION_REVIEWS[[r.a, r.b].sort().join('/')] ?? UNREVIEWED,
  }));
  const ingredients = INGREDIENTS.map((i) => ({ ...i, cautionsReview: INGREDIENT_CAUTION_REVIEWS[i.id] ?? UNREVIEWED }));

  const awaitingReview = [
    ...DECISION_RULES.filter((r) => r.review.status === 'draft').map((r) => `decision rule ${r.id} (${r.severity})`),
    ...EXPLANATION_TEMPLATES.filter((t) => t.review.status === 'draft').map((t) => `explanation template ${t.id}`),
    ...EDUCATION_ANSWERS.filter((a) => a.review.status === 'draft').map((a) => `education answer ${a.id}`),
    ...BAYES_PARAMETERS.filter((p) => p.review.status === 'draft').map((p) => `parameter ${p.id}`),
    ...interactions.filter((r) => r.review.status === 'draft').map((r) => `interaction ${r.a}/${r.b} (tier ${r.tier})`),
    ...ingredients.filter((i) => i.cautionsReview.status === 'draft').map((i) => `ingredient cautions ${i.id} (published as unreviewed)`),
    ...Object.keys(TREATMENTS).filter((id) => !APPROVED_DIRECTIONS[id]).map((id) => `directions and formulation for ${id}`),
  ];

  // Rules whose reason template is still a draft cannot be published either.
  const templates = approved(EXPLANATION_TEMPLATES);
  const templateIds = new Set(templates.map((t) => t.id));
  const rules = approved(DECISION_RULES).filter((r) => templateIds.has(r.reasonTemplateId));

  return {
    input: {
      catalogue: catalogRecords(PRODUCTS),
      ingredients,
      interactions: approved(interactions),
      formulations: [...FORMULATIONS],
      directions: { ...APPROVED_DIRECTIONS },
      treatments: { ...TREATMENTS },
      rules,
      parameters: approved(BAYES_PARAMETERS),
      templates,
      education: approved(EDUCATION_ANSWERS),
      evidence: [...EVIDENCE_SOURCES],
    },
    awaitingReview,
  };
}

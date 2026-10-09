/**
 * Compiles knowledge records into an immutable release: six JSON artifacts
 * and a manifest naming each with its schema version, record count and
 * SHA-256. The release id is derived from the manifest, so identical input
 * always yields the identical release, byte for byte, and any change to any
 * record yields a new id.
 *
 * Compilation refuses (returns errors, produces nothing) on: any draft
 * record; approved records without a reviewer, date or existing source;
 * malformed, unreachable or overlapping-and-contradictory rule conditions;
 * references to missing templates, ingredients, products or evidence;
 * template text using undeclared variables; invalid Bayesian parameters,
 * and synthetic ones outside a fixture build; invalid formulations; and
 * restricted treatments whose directions lack a complete formulation.
 *
 * Pure: no database, no clock, no randomness. Runs in tests and scripts.
 */
import { likelihoodGroupProblems } from '@/modules/personalization/core/bayes';
import { createHash } from 'node:crypto';
import { overlaps, predicateProblems, satisfiable } from './predicate';
import type { BayesParameter, DecisionRule, KnowledgeInput, Review, RuleEffect } from './records';
import { AMBIGUOUS_ALIASES } from '@/modules/ingredients/dictionary';
import { buildAliasMap } from '@/modules/ingredients/resolve';
import { knowledgeProblems, treatmentReadiness } from '@/modules/ingredients/formulations';

export const KB_SCHEMA_VERSION = 1;
export const ARTIFACT_NAMES = ['catalogue', 'ingredients', 'rules', 'parameters', 'explanations', 'evidence'] as const;
export type ArtifactName = (typeof ARTIFACT_NAMES)[number];

/** Variables an explanation template may use. */
export const TEMPLATE_VARIABLES = ['productName', 'concern', 'frequency', 'session', 'skinType'] as const;

export type Manifest = {
  schemaVersion: number;
  releaseId: string;
  /** True for development fixtures. A fixture release can never be activated. */
  fixture: boolean;
  artifacts: Record<ArtifactName, { schemaVersion: number; sha256: string; records: number }>;
};

export type CompiledRelease = {
  manifest: Manifest;
  /** Canonical JSON text of each artifact, exactly as hashed. */
  artifacts: Record<ArtifactName, string>;
};

export type CompileResult = { ok: true; release: CompiledRelease } | { ok: false; errors: string[] };

/** JSON with object keys sorted at every level, so equal data is equal text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const byId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function reviewProblems(review: Review, where: string, evidenceIds: Set<string>, draftLabel: string): string[] {
  if (review.status === 'draft') return [`${draftLabel}: ${where} is a draft and cannot be published`];
  const p: string[] = [];
  if (!review.reviewerId.trim()) p.push(`${where}: approved without a reviewer`);
  if (!ISO_DATE.test(review.reviewedAt)) p.push(`${where}: review date must be an ISO date`);
  if (review.sourceIds.length === 0) p.push(`${where}: approved without a source`);
  for (const s of review.sourceIds) if (!evidenceIds.has(s)) p.push(`${where}: source ${s} does not exist`);
  return p;
}

function effectsConflict(a: RuleEffect[], b: RuleEffect[]): string | null {
  const modes = new Set([...a, ...b].filter((e) => e.kind === 'mode').map((e) => e.value));
  return modes.size > 1 ? `modes ${[...modes].join(' and ')}` : null;
}

function ruleProblems(rules: DecisionRule[], templateIds: Set<string>, evidenceIds: Set<string>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of rules) {
    const where = `rule ${r.id} v${r.version}`;
    if (ids.has(r.id)) problems.push(`${where}: more than one version of this rule in one release`);
    ids.add(r.id);
    problems.push(...reviewProblems(r.review, where, evidenceIds, r.severity === 'safety' ? 'Draft safety rule' : 'Draft rule'));
    const shape = predicateProblems(r.when, where);
    problems.push(...shape);
    if (shape.length === 0 && !satisfiable(r.when)) problems.push(`${where}: condition can never be true (unreachable rule)`);
    if (r.effects.length === 0) problems.push(`${where}: no effect`);
    const self = effectsConflict(r.effects, []);
    if (self) problems.push(`${where}: contradictory effects (${self})`);
    for (const e of r.effects) {
      if (e.kind === 'maxTreatments' && (!Number.isInteger(e.value) || e.value < 0 || e.value > 3)) {
        problems.push(`${where}: maxTreatments must be 0-3`);
      }
    }
    if (!templateIds.has(r.reasonTemplateId)) problems.push(`${where}: reason template ${r.reasonTemplateId} does not exist`);
  }
  // Two rules that can apply to the same person must not demand different modes.
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const [a, b] = [rules[i], rules[j]];
      const conflict = effectsConflict(a.effects, b.effects);
      if (conflict && predicateProblems(a.when, '').length === 0 && predicateProblems(b.when, '').length === 0 && overlaps(a.when, b.when)) {
        problems.push(`rules ${a.id} and ${b.id} contradict: both can apply to one profile, with ${conflict}`);
      }
    }
  }
  return problems;
}

function parameterProblems(params: BayesParameter[], fixture: boolean, evidenceIds: Set<string>): string[] {
  const problems: string[] = [];
  const concerns = new Set<string>();
  const inOpen = (x: number) => Number.isFinite(x) && x > 0 && x < 1;
  for (const p of params) {
    const where = `parameter ${p.id}`;
    problems.push(...reviewProblems(p.review, where, evidenceIds, 'Draft parameter'));
    if (concerns.has(p.concern)) problems.push(`${where}: second parameter set for concern ${p.concern}`);
    concerns.add(p.concern);
    if (!inOpen(p.prior)) problems.push(`${where}: prior must be strictly between 0 and 1`);
    if (p.groups.length === 0) problems.push(`${where}: no evidence groups`);
    const groups = new Set<string>();
    for (const g of p.groups) {
      const key = `${g.evidenceGroup}:${g.observation}`;
      if (groups.has(key)) problems.push(`${where}: duplicate observation ${key}`);
      groups.add(key);
      if (!inOpen(g.pGivenConcern) || !inOpen(g.pGivenNotConcern)) problems.push(`${where}: ${key} likelihoods must be strictly between 0 and 1`);
    }
    problems.push(...likelihoodGroupProblems(p).filter((x) => !x.includes('duplicate state')));
    if (p.validationStatus === 'synthetic_fixture' && !fixture) {
      problems.push(`${where}: synthetic fixture parameters cannot enter a production release`);
    }
    if (p.validationStatus === 'validated') {
      const v = p.provenance;
      if (!v.trainingVersion || !v.calibrationVersion || !v.counts || v.counts < 1) {
        problems.push(`${where}: validated parameters need training and calibration versions and counts`);
      }
    }
    if (!p.provenance.note.trim()) problems.push(`${where}: provenance note is required`);
    const scope = p.calibrationScope;
    if (!scope || scope.sources.length === 0) problems.push(`${where}: calibration scope must name at least one evidence source`);
    else if (scope.sources.includes('photo') && scope.photoModelVersions.length === 0) {
      problems.push(`${where}: photo evidence in scope needs the photo model versions it was calibrated on`);
    }
  }
  return problems;
}

export function compileRelease(input: KnowledgeInput, options: { fixture: boolean }): CompileResult {
  const errors: string[] = [];
  const evidenceIds = new Set(input.evidence.map((e) => e.id));
  const templateIds = new Set(input.templates.map((t) => t.id));
  const productIds = new Set(input.catalogue.products.map((p) => p.id));
  const ingredientIds = new Set(input.ingredients.map((i) => i.id));

  // Formulations, directions and evidence (existing checks), then restricted completeness.
  errors.push(...knowledgeProblems({ formulations: input.formulations, evidence: input.evidence, directions: input.directions }));
  for (const f of input.formulations) if (!productIds.has(f.productId)) errors.push(`formulation ${f.productId} v${f.version}: unknown product`);
  for (const productId of Object.keys(input.directions)) {
    const treatment = input.treatments[productId];
    if (!treatment) continue;
    const ready = treatmentReadiness(productId, treatment.class, input);
    if (!ready.ready) errors.push(`Incomplete restricted formulation: ${productId} (${ready.problems.join('; ')})`);
  }

  // Ingredients and interactions.
  for (const c of buildAliasMap(input.ingredients, AMBIGUOUS_ALIASES).collisions) {
    errors.push(`alias "${c.alias}" is claimed by ${c.ids.join(' and ')}`);
  }
  for (const i of input.ingredients) {
    if (i.cautionsReview.status === 'approved') errors.push(...reviewProblems(i.cautionsReview, `ingredient ${i.id} cautions`, evidenceIds, 'Draft'));
  }
  for (const r of input.interactions) {
    const where = `interaction ${r.a}/${r.b}`;
    errors.push(...reviewProblems(r.review, where, evidenceIds, 'Draft safety rule'));
    for (const id of [r.a, r.b]) if (!ingredientIds.has(id)) errors.push(`${where}: unknown ingredient ${id}`);
    if (r.tier === 2 && !r.citation) errors.push(`${where}: tier 2 needs a citation`);
  }

  errors.push(...ruleProblems(input.rules, templateIds, evidenceIds));
  errors.push(...parameterProblems(input.parameters, options.fixture, evidenceIds));

  for (const t of input.templates) {
    const where = `template ${t.id}`;
    errors.push(...reviewProblems(t.review, where, evidenceIds, 'Draft template'));
    const used = new Set([...t.text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    for (const v of used) if (!t.variables.includes(v)) errors.push(`${where}: uses undeclared variable {${v}}`);
    for (const v of t.variables) {
      if (!(TEMPLATE_VARIABLES as readonly string[]).includes(v)) errors.push(`${where}: variable ${v} is not permitted`);
    }
  }
  for (const a of input.education) {
    const where = `education answer ${a.id}`;
    errors.push(...reviewProblems(a.review, where, evidenceIds, 'Draft answer'));
    if (a.questionAliases.length === 0 || !a.answer.trim()) errors.push(`${where}: needs question aliases and an answer`);
  }

  if (errors.length) return { ok: false, errors };

  const aliasMap = buildAliasMap(input.ingredients, AMBIGUOUS_ALIASES);
  const data: Record<ArtifactName, { records: number; body: unknown }> = {
    catalogue: {
      records: input.catalogue.products.length + input.catalogue.variants.length + input.formulations.length,
      body: {
        products: byId(input.catalogue.products),
        variants: byId(input.catalogue.variants),
        formulations: [...input.formulations].sort((a, b) => `${a.productId}@${a.version}`.localeCompare(`${b.productId}@${b.version}`)),
        usageProfiles: input.directions,
        treatments: input.treatments,
      },
    },
    ingredients: {
      records: input.ingredients.length + input.interactions.length,
      body: {
        ingredients: byId(input.ingredients).map(({ cautionsReview, prescriptionOnly, pregnancyCaution, photosensitising, ...identity }) => ({
          ...identity,
          // Unreviewed cautions are published as unknown, never as "no caution".
          cautions:
            cautionsReview.status === 'approved'
              ? { status: 'reviewed', prescriptionOnly, pregnancyCaution, photosensitising, review: cautionsReview }
              : { status: 'unreviewed' },
        })),
        aliases: Object.fromEntries([...aliasMap.map].sort(([a], [b]) => a.localeCompare(b))),
        ambiguousAliases: Object.fromEntries([...aliasMap.ambiguous].sort(([a], [b]) => a.localeCompare(b))),
        interactions: [...input.interactions].sort((x, y) => `${x.a}/${x.b}`.localeCompare(`${y.a}/${y.b}`)),
      },
    },
    rules: { records: input.rules.length, body: { rules: byId(input.rules) } },
    parameters: { records: input.parameters.length, body: { parameters: byId(input.parameters) } },
    explanations: {
      records: input.templates.length + input.education.length,
      body: { templates: byId(input.templates), education: byId(input.education) },
    },
    evidence: { records: input.evidence.length, body: { sources: byId(input.evidence) } },
  };

  const artifacts = Object.fromEntries(ARTIFACT_NAMES.map((n) => [n, canonicalJson(data[n].body)])) as Record<ArtifactName, string>;
  const entries = Object.fromEntries(
    ARTIFACT_NAMES.map((n) => [n, { schemaVersion: KB_SCHEMA_VERSION, sha256: sha256(artifacts[n]), records: data[n].records }])
  ) as Manifest['artifacts'];
  const unsigned = { schemaVersion: KB_SCHEMA_VERSION, fixture: options.fixture, artifacts: entries };
  const releaseId = `kb_${sha256(canonicalJson(unsigned)).slice(0, 32)}`;
  return { ok: true, release: { manifest: { ...unsigned, releaseId }, artifacts } };
}

/** Recomputes every checksum and the release id. Empty means intact. */
export function verifyRelease(release: CompiledRelease): string[] {
  const problems: string[] = [];
  for (const n of ARTIFACT_NAMES) {
    const text = release.artifacts[n];
    if (typeof text !== 'string') problems.push(`artifact ${n} is missing`);
    else if (sha256(text) !== release.manifest.artifacts[n]?.sha256) problems.push(`artifact ${n} does not match its checksum`);
  }
  const { releaseId, ...unsigned } = release.manifest;
  if (`kb_${sha256(canonicalJson(unsigned)).slice(0, 32)}` !== releaseId) problems.push('release id does not match the manifest');
  return problems;
}

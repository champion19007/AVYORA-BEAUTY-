import { describe, expect, it } from 'vitest';
import { compileRelease, verifyRelease, type CompiledRelease } from '../compile';
import { evaluate, predicateProblems, satisfiable, type Predicate } from '../predicate';
import { applyRules } from '../inference';
import { inferConcerns } from '@/modules/personalization/core/bayes';
import { productionInput } from '../production-input';
import { developmentFixtureInput, FIXTURE_REVIEW } from '../__fixtures__/development-fixture';
import type { DecisionRule, KnowledgeInput } from '../records';

const fixture = () => developmentFixtureInput();
const compileFixture = (input: KnowledgeInput = fixture()) => compileRelease(input, { fixture: true });
const errorsOf = (input: KnowledgeInput, opts = { fixture: true }) => {
  const r = compileRelease(input, opts);
  return r.ok ? [] : r.errors;
};
const ok = (r: ReturnType<typeof compileRelease>): CompiledRelease => {
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.release;
};

describe('predicate trees', () => {
  it.each<[string, unknown]>([
    ['an unknown operation', { op: 'gt', field: 'reactivity', value: 'high' }],
    ['executable code', { op: 'js', code: 'profile.pregnancy !== "yes"' }],
    ['a JavaScript string', 'profile.pregnancy === "no"'],
    ['an unknown field', { op: 'eq', field: 'bloodType', value: 'A' }],
    ['a value the field can never take', { op: 'eq', field: 'pregnancy', value: 'maybe' }],
    ['an empty list', { op: 'in', field: 'pregnancy', values: [] }],
    ['extra keys', { op: 'eq', field: 'pregnancy', value: 'yes', then: 'alert(1)' }],
  ])('rejects %s', (_, condition) => {
    expect(predicateProblems(condition, 'test').length).toBeGreaterThan(0);
  });

  it('rejects conditions nested too deeply', () => {
    let p: Predicate = { op: 'eq', field: 'pregnancy', value: 'yes' };
    for (let i = 0; i < 7; i++) p = { op: 'not', of: p };
    expect(predicateProblems(p, 'test').join()).toMatch(/nested deeper/);
  });

  it('interprets conditions without executing anything', () => {
    const p: Predicate = {
      op: 'all',
      of: [
        { op: 'in', field: 'pregnancy', values: ['yes', 'unknown'] },
        { op: 'not', of: { op: 'eq', field: 'ageRange', value: 'under18' } },
      ],
    };
    expect(evaluate(p, { pregnancy: 'unknown', ageRange: '25_34' })).toBe(true);
    expect(evaluate(p, { pregnancy: 'no', ageRange: '25_34' })).toBe(false);
    expect(evaluate(p, { pregnancy: 'yes', ageRange: 'under18' })).toBe(false);
    // A missing field equals nothing.
    expect(evaluate({ op: 'eq', field: 'pregnancy', value: 'yes' }, {})).toBe(false);
  });

  it('knows when a condition can never be true', () => {
    expect(satisfiable({ op: 'all', of: [{ op: 'eq', field: 'pregnancy', value: 'yes' }, { op: 'eq', field: 'pregnancy', value: 'no' }] })).toBe(false);
    expect(satisfiable({ op: 'in', field: 'pregnancy', values: ['yes'] })).toBe(true);
  });
});

describe('compiling the development fixture', () => {
  it('succeeds, and is labelled as a fixture', () => {
    const release = ok(compileFixture());
    expect(release.manifest.fixture).toBe(true);
    expect(release.manifest.releaseId).toMatch(/^kb_[0-9a-f]{32}$/);
    expect(release.manifest.artifacts.rules.records).toBe(6);
    expect(verifyRelease(release)).toEqual([]);
  });

  it('is deterministic: same input, same bytes; input order does not matter', () => {
    const a = ok(compileFixture());
    const b = ok(compileFixture());
    const shuffled = fixture();
    shuffled.rules = [...shuffled.rules].reverse();
    shuffled.ingredients = [...shuffled.ingredients].reverse();
    shuffled.templates = [...shuffled.templates].reverse();
    const c = ok(compileFixture(shuffled));
    expect(b).toEqual(a);
    expect(c.manifest.releaseId).toBe(a.manifest.releaseId);
    expect(c.artifacts).toEqual(a.artifacts);
  });

  it('changes its id when any record changes', () => {
    const changed = fixture();
    changed.education[0] = { ...changed.education[0], answer: 'Different fixture text.' };
    expect(ok(compileFixture(changed)).manifest.releaseId).not.toBe(ok(compileFixture()).manifest.releaseId);
  });

  it('detects a tampered artifact or manifest', () => {
    const release = ok(compileFixture());
    const tampered = { ...release, artifacts: { ...release.artifacts, rules: release.artifacts.rules.replace('irritated', 'clear') } };
    expect(verifyRelease(tampered).join()).toMatch(/rules does not match its checksum/);
    const relabelled = { ...release, manifest: { ...release.manifest, fixture: false } };
    expect(verifyRelease(relabelled).join()).toMatch(/release id does not match/);
  });
});

const ruleOverride = (id: string, patch: Partial<DecisionRule>) => {
  const input = fixture();
  input.rules = input.rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
  return input;
};

describe('compilation refuses', () => {
  it('a draft safety rule', () => {
    expect(errorsOf(ruleOverride('retinoid_pregnancy', { review: { status: 'draft' } })).join()).toMatch(/Draft safety rule: rule retinoid_pregnancy/);
  });

  it('an approval without reviewer, date or existing source', () => {
    const errors = errorsOf(
      ruleOverride('retinoid_under18', { review: { status: 'approved', reviewerId: ' ', reviewedAt: 'yesterday', sourceIds: ['missing-source'] } })
    ).join('\n');
    expect(errors).toMatch(/approved without a reviewer/);
    expect(errors).toMatch(/review date must be an ISO date/);
    expect(errors).toMatch(/source missing-source does not exist/);
  });

  it('a rule that can never apply', () => {
    const errors = errorsOf(
      ruleOverride('retinoid_under18', {
        when: { op: 'all', of: [{ op: 'eq', field: 'ageRange', value: 'under18' }, { op: 'not', of: { op: 'eq', field: 'ageRange', value: 'under18' } }] },
      })
    );
    expect(errors.join()).toMatch(/unreachable rule/);
  });

  it('contradictory rules: two modes for the same profile', () => {
    // Without its "not irritated" guard, the very-reactive rule overlaps the irritated one.
    const errors = errorsOf(ruleOverride('very_reactive_gentle', { when: { op: 'eq', field: 'reactivity', value: 'very_high' } }));
    expect(errors.join()).toMatch(/rules irritated_recovery and very_reactive_gentle contradict/);
  });

  it('a rule with contradictory effects, or a missing reason template', () => {
    const errors = errorsOf(
      ruleOverride('retinoid_pregnancy', {
        effects: [{ kind: 'mode', value: 'recovery' }, { kind: 'mode', value: 'gentle' }],
        reasonTemplateId: 'no_such_template',
      })
    ).join('\n');
    expect(errors).toMatch(/contradictory effects/);
    expect(errors).toMatch(/reason template no_such_template does not exist/);
  });

  it('a template using an undeclared or forbidden variable', () => {
    const input = fixture();
    input.templates[0] = { ...input.templates[0], text: '{productName} for {email}', variables: ['productName', 'email'] };
    const errors = errorsOf(input).join('\n');
    expect(errors).toMatch(/variable email is not permitted/);
  });

  it('synthetic Bayesian parameters in a production release', () => {
    expect(errorsOf(fixture(), { fixture: false }).join()).toMatch(/synthetic fixture parameters cannot enter a production release/);
  });

  it('"validated" parameters without provenance, or impossible probabilities', () => {
    const input = fixture();
    input.parameters[0] = {
      ...input.parameters[0],
      prior: 1,
      validationStatus: 'validated',
      groups: [{ evidenceGroup: 'g', observation: 'o', pGivenConcern: 0, pGivenNotConcern: 0.5 }],
    };
    const errors = errorsOf(input).join('\n');
    expect(errors).toMatch(/need training and calibration versions/);
    expect(errors).toMatch(/prior must be strictly between 0 and 1/);
    expect(errors).toMatch(/likelihoods must be strictly between 0 and 1/);
  });

  it('an incomplete restricted formulation', () => {
    const input = fixture();
    input.formulations[0] = { ...input.formulations[0], coverage: 'partial' };
    expect(errorsOf(input).join()).toMatch(/Incomplete restricted formulation: niacinamide-drops/);
  });

  it('broken references: interactions, formulations and evidence', () => {
    const input = fixture();
    input.interactions.push({ a: 'retinol', b: 'unicorn-extract', tier: 3, summary: 's', advice: 'a', citation: null, review: FIXTURE_REVIEW });
    input.formulations.push({ ...input.formulations[0], productId: 'discontinued-serum' });
    const errors = errorsOf(input).join('\n');
    expect(errors).toMatch(/unknown ingredient unicorn-extract/);
    expect(errors).toMatch(/formulation discontinued-serum v1: unknown product/);
  });
});

describe('the production release today', () => {
  const { input, awaitingReview } = productionInput();
  const release = ok(compileRelease(input, { fixture: false }));
  const artifact = (n: keyof CompiledRelease['artifacts']) => JSON.parse(release.artifacts[n]);

  it('compiles from approved records only, which is almost nothing yet', () => {
    expect(release.manifest.fixture).toBe(false);
    expect(artifact('rules').rules).toEqual([]);
    expect(artifact('parameters').parameters).toEqual([]);
    expect(artifact('explanations')).toEqual({ templates: [], education: [] });
    expect(artifact('ingredients').interactions).toEqual([]);
    expect(artifact('catalogue').formulations).toEqual([]);
    expect(artifact('catalogue').products).toHaveLength(27);
  });

  it('publishes ingredient cautions as unreviewed, never as "no caution"', () => {
    const retinol = artifact('ingredients').ingredients.find((i: { id: string }) => i.id === 'retinol');
    expect(retinol.cautions).toEqual({ status: 'unreviewed' });
    expect(retinol).not.toHaveProperty('pregnancyCaution');
  });

  it('lists everything awaiting review', () => {
    expect(awaitingReview.filter((x) => x.startsWith('decision rule'))).toHaveLength(6);
    expect(awaitingReview.filter((x) => x.startsWith('interaction'))).toHaveLength(5);
    expect(awaitingReview.filter((x) => x.startsWith('explanation template'))).toHaveLength(6);
    expect(awaitingReview.some((x) => x.startsWith('directions and formulation for retinol'))).toBe(true);
  });
});

describe('inference from a release', () => {
  const rules = fixture().rules;

  it('applies rules by interpretation, strictest limit wins', () => {
    const out = applyRules(rules, { currentCondition: 'irritated', reactivity: 'high', experienceLevel: 'N3', pregnancy: 'unknown', ageRange: '25_34' });
    expect(out.mode).toBe('recovery');
    expect(out.excludedClasses).toEqual(['elective_irritating', 'retinoid']);
    expect(out.maxTreatments).toBe(1);
    expect(out.applied.map((a) => a.ruleId)).toEqual(['irritated_recovery', 'one_active_at_a_time', 'retinoid_pregnancy']);
    expect(applyRules(rules, { experienceLevel: 'N0', reactivity: 'high' }).maxTreatments).toBe(0);
  });

  it('combines evidence groups through the shared inference core', () => {
    const [param] = fixture().parameters;
    const set = { releaseId: 'fixture', schemaVersion: 1, parameters: [{ ...param, validationStatus: 'validated' as const }] };
    const r = inferConcerns(set, [{ evidenceGroup: 'self_report_breakouts', observation: 'frequent', source: 'quiz' }], []);
    expect(r.concerns[0]).toMatchObject({ basis: 'calibrated', probability: expect.closeTo(0.75 / 1.75, 10) });
  });
});

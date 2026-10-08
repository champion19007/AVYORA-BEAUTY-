import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createContext, runInContext } from 'node:vm';
import {
  combineWithSafety,
  inferConcerns,
  logit,
  parameterSetProblems,
  readParameterSet,
  sigmoid,
  type Observation,
  type ParameterSet,
} from '../bayes';
import { applyRules } from '@/modules/knowledge/inference';
import { DECISION_RULES } from '@/data/knowledge';
import type { BayesParameter } from '@/modules/knowledge/records';

/*
 * SYNTHETIC TEST VALUES, NOT AVYORA PARAMETERS.
 * Prior 0.20; group A ratio 0.6/0.2 = 3; group B ratio 0.5/0.25 = 2.
 * They reproduce the specification's worked example and nothing else. They
 * are marked `validated` here only so the calibrated path can be exercised.
 */
const TEST_PARAM: BayesParameter = {
  id: 'test-only-acne',
  concern: 'acne',
  prior: 0.2,
  groups: [
    { evidenceGroup: 'blemishes', observation: 'frequent', pGivenConcern: 0.6, pGivenNotConcern: 0.2 },
    { evidenceGroup: 'oiliness', observation: 'yes', pGivenConcern: 0.5, pGivenNotConcern: 0.25 },
  ],
  validationStatus: 'validated',
  provenance: { trainingVersion: 'TEST', calibrationVersion: 'TEST', counts: 1, note: 'Synthetic test values' },
  calibrationScope: { sources: ['quiz', 'photo'], photoModelVersions: ['photo-model-TEST-1'] },
  review: { status: 'draft' },
};
const SET: ParameterSet = { releaseId: 'kb_test', schemaVersion: 1, parameters: [TEST_PARAM] };
const quiz = (evidenceGroup: string, observation: string): Observation => ({ evidenceGroup, observation, source: 'quiz' });
const photo = (evidenceGroup: string, observation: string, modelVersion = 'photo-model-TEST-1'): Observation => ({
  evidenceGroup,
  observation,
  source: 'photo',
  modelVersion,
});
const acne = (obs: Observation[], set: ParameterSet = SET) => {
  const c = inferConcerns(set, obs, ['acne']).concerns.find((x) => x.concern === 'acne')!;
  if (c.basis !== 'calibrated') throw new Error('expected calibrated');
  return c;
};

describe('arithmetic (synthetic test values)', () => {
  it('prior 0.20 with ratio 3 gives about 0.428571', () => {
    expect(acne([quiz('blemishes', 'frequent')]).probability).toBeCloseTo(0.428571, 6);
  });

  it('a further independent ratio 2 gives 0.60', () => {
    expect(acne([quiz('blemishes', 'frequent'), quiz('oiliness', 'yes')]).probability).toBeCloseTo(0.6, 10);
  });

  it('works in log-odds: prior log-odds plus the sum of log ratios', () => {
    const r = acne([quiz('blemishes', 'frequent'), quiz('oiliness', 'yes')]);
    expect(r.priorLogOdds).toBeCloseTo(Math.log(0.25), 12);
    expect(r.logOdds).toBeCloseTo(Math.log(0.25) + Math.log(3) + Math.log(2), 12);
  });
});

describe('neutral evidence', () => {
  it('no evidence leaves the prior', () => {
    expect(acne([]).probability).toBeCloseTo(0.2, 12);
  });

  it('rejected, unsupported and out-of-scope evidence add nothing, and are traced with a reason', () => {
    const r = acne([
      { ...quiz('blemishes', 'frequent'), quality: 'rejected' },
      quiz('oiliness', 'sometimes'),
      photo('blemishes', 'frequent', 'photo-model-OTHER'),
    ]);
    expect(r.probability).toBeCloseTo(0.2, 12);
    expect(r.trace.map((t) => (t.status === 'rejected' ? t.reason : t.status)).sort()).toEqual([
      'out_of_calibration_scope',
      'quality_rejected',
      'unsupported_observation',
    ]);
  });

  it('evidence about something the concern has no parameters for is ignored', () => {
    expect(acne([quiz('dark_circles', 'significant')]).probability).toBeCloseTo(0.2, 12);
  });
});

describe('correlated evidence', () => {
  it('a quiz answer and a photo finding in one group count once, and the duplicate is traced', () => {
    const r = acne([quiz('blemishes', 'frequent'), photo('blemishes', 'frequent')]);
    expect(r.probability).toBeCloseTo(0.428571, 6);
    expect(r.trace).toEqual([
      { status: 'accepted', evidenceGroup: 'blemishes', observation: 'frequent', source: 'quiz', logLikelihoodRatio: Math.log(0.6) - Math.log(0.2) },
      { status: 'rejected', evidenceGroup: 'blemishes', observation: 'frequent', source: 'photo', reason: 'duplicate_in_group' },
    ]);
  });

  it('the same answer repeated many times still counts once', () => {
    expect(acne(Array.from({ length: 20 }, () => quiz('blemishes', 'frequent'))).probability).toBeCloseTo(0.428571, 6);
  });

  it('which duplicate counts does not depend on input order', () => {
    const a = acne([photo('blemishes', 'frequent'), quiz('blemishes', 'frequent')]);
    const b = acne([quiz('blemishes', 'frequent'), photo('blemishes', 'frequent')]);
    expect(a).toEqual(b);
  });

  it('photo evidence outside the calibration scope never counts', () => {
    const quizOnly: ParameterSet = { ...SET, parameters: [{ ...TEST_PARAM, calibrationScope: { sources: ['quiz'], photoModelVersions: [] } }] };
    expect(acne([photo('blemishes', 'frequent')], quizOnly).probability).toBeCloseTo(0.2, 12);
  });

  it('a raw model confidence is never read as a likelihood', () => {
    const withConfidence = { ...photo('blemishes', 'frequent'), confidence: 0.999, score: 42 } as Observation;
    const without = photo('blemishes', 'frequent');
    expect(acne([withConfidence])).toEqual(acne([without]));
  });
});

describe('parameter validation and fallback', () => {
  it.each<[string, Partial<BayesParameter>]>([
    ['prior 0', { prior: 0 }],
    ['prior 1', { prior: 1 }],
    ['prior NaN', { prior: Number.NaN }],
    ['prior Infinity', { prior: Number.POSITIVE_INFINITY }],
    ['a zero likelihood', { groups: [{ evidenceGroup: 'blemishes', observation: 'frequent', pGivenConcern: 0, pGivenNotConcern: 0.2 }] }],
    ['a likelihood of 1', { groups: [{ evidenceGroup: 'blemishes', observation: 'frequent', pGivenConcern: 1, pGivenNotConcern: 0.2 }] }],
    ['no calibration scope', { calibrationScope: { sources: [], photoModelVersions: [] } }],
  ])('rejects %s, and falls back to reported priorities with no percentage', (_, patch) => {
    const set: ParameterSet = { ...SET, parameters: [{ ...TEST_PARAM, ...patch }] };
    expect(parameterSetProblems(set).length).toBeGreaterThan(0);
    const r = inferConcerns(set, [quiz('blemishes', 'frequent')], ['dryness', 'acne']);
    expect(r.basis).toBe('reported');
    expect(r.priorities).toEqual(['dryness', 'acne']);
    expect(JSON.stringify(r)).not.toMatch(/probability/);
  });

  it('refuses an unsupported release schema', () => {
    expect(inferConcerns({ ...SET, schemaVersion: 99 }, [], ['acne']).basis).toBe('reported');
  });

  it.each(['provisional', 'synthetic_fixture'] as const)('does not turn %s parameters into percentages', (status) => {
    const r = inferConcerns({ ...SET, parameters: [{ ...TEST_PARAM, validationStatus: status }] }, [quiz('blemishes', 'frequent')], ['acne']);
    expect(r).toMatchObject({ basis: 'reported', priorities: ['acne'], problems: ['No validated parameters in this release'] });
    expect(r.concerns[0]).toEqual({ concern: 'acne', basis: 'reported', reportedRank: 1, trace: [] });
  });

  it('without any parameter set, keeps what the customer reported, in their order', () => {
    expect(inferConcerns(null, [quiz('blemishes', 'frequent')], ['texture', 'acne', 'texture'])).toMatchObject({
      basis: 'reported',
      priorities: ['texture', 'acne'],
    });
  });

  it('orders calibrated concerns by probability, then the rest as reported', () => {
    const r = inferConcerns(SET, [quiz('blemishes', 'frequent')], ['dryness', 'acne']);
    expect(r.priorities).toEqual(['acne', 'dryness']);
  });

  it('reads parameters from a release, refusing development fixtures unless allowed', () => {
    const manifest = { releaseId: 'kb_x', schemaVersion: 1, fixture: true };
    expect(readParameterSet(manifest, { parameters: [TEST_PARAM] })).toBeNull();
    expect(readParameterSet(manifest, { parameters: [TEST_PARAM] }, { allowFixture: true })?.parameters).toHaveLength(1);
    expect(readParameterSet({ ...manifest, fixture: false }, { nope: 1 })).toBeNull();
  });
});

describe('numerical stability', () => {
  it('never overflows or returns NaN at the extremes', () => {
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBe(0);
    expect(Number.isFinite(logit(1e-15))).toBe(true);
    expect(Number.isFinite(logit(1 - 1e-15))).toBe(true);
  });

  it('many strong ratios stay finite and in range', () => {
    const groups = Array.from({ length: 60 }, (_, i) => ({ evidenceGroup: `g${i}`, observation: 'x', pGivenConcern: 1 - 1e-12, pGivenNotConcern: 1e-12 }));
    const set: ParameterSet = { ...SET, parameters: [{ ...TEST_PARAM, prior: 1e-9, groups }] };
    const up = acne(groups.map((g) => quiz(g.evidenceGroup, 'x')), set);
    expect(Number.isFinite(up.logOdds)).toBe(true);
    expect(up.probability).toBeGreaterThan(0.999999);
    expect(up.probability).toBeLessThanOrEqual(1);
    const downGroups = groups.map((g) => ({ ...g, pGivenConcern: 1e-12, pGivenNotConcern: 1 - 1e-12 }));
    const down = acne(downGroups.map((g) => quiz(g.evidenceGroup, 'x')), { ...set, parameters: [{ ...TEST_PARAM, prior: 1 - 1e-9, groups: downGroups }] });
    expect(down.probability).toBeGreaterThanOrEqual(0);
    expect(down.probability).toBeLessThan(1e-6);
  });
});

describe('determinism', () => {
  it('identical inputs give byte-identical output, whatever the input order', () => {
    const obs = [quiz('oiliness', 'yes'), photo('blemishes', 'frequent'), quiz('blemishes', 'frequent'), quiz('dark_circles', 'no')];
    const a = JSON.stringify(inferConcerns(SET, obs, ['acne', 'dryness']));
    const b = JSON.stringify(inferConcerns(SET, [...obs].reverse(), ['acne', 'dryness']));
    expect(b).toBe(a);
  });
});

describe('safety is independent of concern scores', () => {
  it('no evidence, however strong, lifts a safety exclusion', () => {
    const rules = DECISION_RULES.map((r) => ({ ...r, review: { status: 'approved' as const, reviewerId: 'TEST', reviewedAt: '2026-01-01', sourceIds: ['TEST'] } }));
    const profile = { pregnancy: 'unknown', currentCondition: 'clear', reactivity: 'low', experienceLevel: 'N3', ageRange: '25_34' };
    const safety = applyRules(rules, profile);
    const weak = combineWithSafety(inferConcerns(SET, [], ['aging']), safety);
    const strong = combineWithSafety(inferConcerns(SET, [quiz('blemishes', 'frequent'), quiz('oiliness', 'yes')], ['aging']), safety);
    expect(weak.excludedClasses).toEqual(['retinoid']);
    expect(strong.excludedClasses).toEqual(['retinoid']);
    expect(strong.inference.priorities[0]).toBe('acne');
  });

  it('inference takes no safety answers at all', () => {
    expect(inferConcerns.length).toBe(3);
  });
});

describe('browser and server parity', () => {
  it('the browser bundle has no Node or network dependency and computes identical results', async () => {
    const bundled = await build({
      entryPoints: ['src/modules/personalization/core/bayes.ts'],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'core',
      alias: { '@': './src' },
      logLevel: 'silent',
    });
    const code = bundled.outputFiles[0].text;
    expect(code).not.toMatch(/\brequire\(|process\.|fetch\(|node:/);

    // A bare context: no require, process, fetch or Node globals.
    const sandbox: Record<string, unknown> = {};
    createContext(sandbox);
    runInContext(code, sandbox);
    const browserCore = sandbox.core as { inferConcerns: typeof inferConcerns };

    const cases: [ParameterSet | null, Observation[], string[]][] = [
      [SET, [quiz('blemishes', 'frequent')], ['acne']],
      [SET, [quiz('blemishes', 'frequent'), photo('blemishes', 'frequent'), quiz('oiliness', 'yes')], ['dryness', 'acne']],
      [null, [], ['texture']],
      [{ ...SET, schemaVersion: 2 }, [quiz('blemishes', 'frequent')], ['acne']],
    ];
    for (const [set, obs, reported] of cases) {
      const browser = JSON.stringify(browserCore.inferConcerns(set, obs, reported));
      const server = JSON.stringify(inferConcerns(set, obs, reported));
      expect(browser).toBe(server);
    }
  });
});

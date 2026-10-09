/**
 * Concern inference: versioned priors and validated likelihood ratios,
 * combined in log-odds.
 *
 * For a concern with prior p and accepted observations e1..en from distinct
 * evidence groups:
 *
 *   logOdds = ln(p / (1 - p)) + Σ ln( P(ei | concern) / P(ei | not concern) )
 *   probability = σ(logOdds), evaluated without overflow at either extreme.
 *
 * Rules this module keeps, and tests:
 * - Missing, rejected, unsupported or out-of-scope evidence is neutral
 *   (ratio 1, i.e. adds 0) and is recorded in the trace with its reason.
 * - One contribution per evidence group. A quiz answer and a photo finding
 *   about the same thing share a group; the first accepted observation in a
 *   fixed order counts and the rest are rejected as duplicates.
 * - Photo evidence counts only within the parameters' calibration scope
 *   (source and photo model version). A raw model confidence is never read:
 *   only a calibrated categorical observation can carry a likelihood.
 * - Only `validated` parameters produce a probability. Otherwise the
 *   customer's reported priorities are kept, with no percentage at all.
 * - Inference never decides safety: it takes no profile safety fields and
 *   returns no exclusions (see `combineWithSafety`).
 *
 * Pure: no database, network, clock, randomness or Node APIs, and only type
 * imports, so the browser and the server run byte-identical code.
 */
import type { BayesParameter } from '@/modules/knowledge/records';

export const INFERENCE_VERSION = 'bayes-logodds-1';
/** Knowledge release schema versions this module understands. */
export const SUPPORTED_KB_SCHEMA_VERSIONS: readonly number[] = [1];

export type EvidenceSource = 'quiz' | 'photo';

export type Observation = {
  evidenceGroup: string;
  /** A categorical value, e.g. 'frequent'. Never a score. */
  observation: string;
  source: EvidenceSource;
  /** Photo only: the model version that produced the category. */
  modelVersion?: string;
  /** Capture or answer quality; 'rejected' observations are neutral. */
  quality?: 'accepted' | 'rejected';
};

export type ParameterSet = {
  releaseId: string;
  schemaVersion: number;
  parameters: readonly BayesParameter[];
};

export type RejectionReason =
  | 'quality_rejected'
  | 'duplicate_in_group'
  | 'out_of_calibration_scope'
  | 'unsupported_observation';

export type TraceEntry =
  | { status: 'accepted'; evidenceGroup: string; observation: string; source: EvidenceSource; logLikelihoodRatio: number }
  | { status: 'rejected'; evidenceGroup: string; observation: string; source: EvidenceSource; reason: RejectionReason };

export type ConcernResult =
  | {
      concern: string;
      basis: 'calibrated';
      parameterId: string;
      calibrationVersion: string;
      priorLogOdds: number;
      logOdds: number;
      probability: number;
      trace: TraceEntry[];
    }
  | { concern: string; basis: 'reported'; reportedRank: number | null; trace: TraceEntry[] };

export type InferenceResult = {
  version: typeof INFERENCE_VERSION;
  releaseId: string | null;
  /** 'calibrated' only when at least one concern used validated parameters. */
  basis: 'calibrated' | 'reported';
  /** Concerns in priority order: calibrated by probability, then reported order. */
  priorities: string[];
  concerns: ConcernResult[];
  /** Why parameters were not used, if they were not. */
  problems: string[];
};

/* ---------------------------------------------------------------- maths -- */

/** ln(p / (1 - p)) without forming p / (1 - p). */
export function logit(p: number): number {
  return Math.log(p) - Math.log1p(-p);
}

/** 1 / (1 + e^-x), stable for large |x| in both directions. */
export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/* ----------------------------------------------------------- validation -- */

const inOpenUnit = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1;

const SUM_TOLERANCE = 1e-6;

/**
 * Structural checks on one parameter's likelihood groups, shared by the
 * release compiler and the runtime reader: no duplicate states, a declared
 * kind for any multi-state group, and complete distributions for
 * categorical groups under both conditions.
 */
export function likelihoodGroupProblems(p: Pick<BayesParameter, 'id' | 'groups' | 'groupKinds'>): string[] {
  const problems: string[] = [];
  const where = `parameter ${p.id}`;
  const byGroup = new Map<string, BayesParameter['groups']>();
  for (const g of p.groups) byGroup.set(g.evidenceGroup, [...(byGroup.get(g.evidenceGroup) ?? []), g]);
  for (const name of Object.keys(p.groupKinds ?? {})) {
    if (!byGroup.has(name)) problems.push(`${where}: kind declared for ${name}, which has no rows`);
  }
  for (const [name, rows] of byGroup) {
    const states = rows.map((r) => r.observation);
    if (new Set(states).size !== states.length) problems.push(`${where}: duplicate state in group ${name}`);
    if (states.some((s) => s.trim().toLowerCase() === 'unknown')) problems.push(`${where}: "unknown" in ${name} must be neutral, not a state`);
    const kind = p.groupKinds?.[name] ?? (rows.length === 1 ? 'binary' : undefined);
    if (!kind) {
      problems.push(`${where}: group ${name} has ${rows.length} states; declare it categorical`);
      continue;
    }
    if (kind === 'binary' && rows.length !== 1) problems.push(`${where}: binary group ${name} must have exactly one event row`);
    if (kind === 'categorical') {
      if (rows.length < 2) problems.push(`${where}: categorical group ${name} needs at least two states`);
      for (const side of ['pGivenConcern', 'pGivenNotConcern'] as const) {
        const sum = rows.reduce((n, r) => n + r[side], 0);
        if (!(Math.abs(sum - 1) <= SUM_TOLERANCE)) problems.push(`${where}: ${side} over ${name} sums to ${sum.toFixed(6)}, not 1`);
      }
    }
  }
  return problems;
}

/** Problems that make a parameter set unusable. Empty means usable. */
export function parameterSetProblems(set: ParameterSet | null | undefined): string[] {
  if (!set) return ['No parameter set'];
  const problems: string[] = [];
  if (!SUPPORTED_KB_SCHEMA_VERSIONS.includes(set.schemaVersion)) {
    problems.push(`Release schema v${set.schemaVersion} is not supported by ${INFERENCE_VERSION}`);
  }
  const concerns = new Set<string>();
  for (const p of set.parameters) {
    const where = `parameter ${p.id}`;
    if (concerns.has(p.concern)) problems.push(`${where}: second parameter set for ${p.concern}`);
    concerns.add(p.concern);
    if (!inOpenUnit(p.prior)) problems.push(`${where}: prior must be a finite number strictly between 0 and 1`);
    const seen = new Set<string>();
    for (const g of p.groups) {
      const key = `${g.evidenceGroup}:${g.observation}`;
      if (seen.has(key)) problems.push(`${where}: duplicate likelihood for ${key}`);
      seen.add(key);
      if (!inOpenUnit(g.pGivenConcern) || !inOpenUnit(g.pGivenNotConcern)) {
        problems.push(`${where}: likelihoods for ${key} must be finite and strictly between 0 and 1`);
      }
    }
    problems.push(...likelihoodGroupProblems(p));
    if (!p.calibrationScope || p.calibrationScope.sources.length === 0) problems.push(`${where}: no calibration scope`);
  }
  return problems;
}

/* ------------------------------------------------------------ inference -- */

const SOURCE_ORDER: Record<EvidenceSource, number> = { quiz: 0, photo: 1 };

/** A fixed order, so which duplicate counts never depends on input order. */
function ordered(observations: readonly Observation[]): Observation[] {
  return [...observations].sort(
    (a, b) =>
      a.evidenceGroup.localeCompare(b.evidenceGroup) ||
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
      a.observation.localeCompare(b.observation) ||
      (a.modelVersion ?? '').localeCompare(b.modelVersion ?? '')
  );
}

function inferOne(param: BayesParameter, observations: readonly Observation[]): Extract<ConcernResult, { basis: 'calibrated' }> {
  const trace: TraceEntry[] = [];
  const counted = new Set<string>();
  const priorLogOdds = logit(param.prior);
  let logOdds = priorLogOdds;

  for (const o of ordered(observations)) {
    const base = { evidenceGroup: o.evidenceGroup, observation: o.observation, source: o.source };
    const groupKnown = param.groups.some((g) => g.evidenceGroup === o.evidenceGroup);
    if (!groupKnown) continue; // evidence about something this concern has no parameters for
    const reject = (reason: RejectionReason) => trace.push({ status: 'rejected', ...base, reason });

    if (o.quality === 'rejected') {
      reject('quality_rejected');
      continue;
    }
    const scope = param.calibrationScope;
    if (!scope.sources.includes(o.source) || (o.source === 'photo' && !scope.photoModelVersions.includes(o.modelVersion ?? ''))) {
      reject('out_of_calibration_scope');
      continue;
    }
    const row = param.groups.find((g) => g.evidenceGroup === o.evidenceGroup && g.observation === o.observation);
    if (!row) {
      reject('unsupported_observation');
      continue;
    }
    if (counted.has(o.evidenceGroup)) {
      reject('duplicate_in_group');
      continue;
    }
    counted.add(o.evidenceGroup);
    const llr = Math.log(row.pGivenConcern) - Math.log(row.pGivenNotConcern);
    logOdds += llr;
    trace.push({ status: 'accepted', ...base, logLikelihoodRatio: llr });
  }

  return {
    concern: param.concern,
    basis: 'calibrated',
    parameterId: param.id,
    calibrationVersion: param.provenance.calibrationVersion ?? '',
    priorLogOdds,
    logOdds,
    probability: sigmoid(logOdds),
    trace,
  };
}

/**
 * Infers every concern. `reportedPriorities` is what the customer said
 * matters, in their order; it is the answer whenever validated parameters
 * are missing, invalid or from an unsupported release, and it orders any
 * concern without validated parameters.
 */
export function inferConcerns(
  set: ParameterSet | null,
  observations: readonly Observation[],
  reportedPriorities: readonly string[]
): InferenceResult {
  const problems = parameterSetProblems(set);
  const usable = problems.length === 0 && set ? set.parameters.filter((p) => p.validationStatus === 'validated') : [];
  if (problems.length === 0 && set && usable.length === 0) problems.push('No validated parameters in this release');

  const calibrated = [...usable]
    .sort((a, b) => a.concern.localeCompare(b.concern))
    .map((p) => inferOne(p, observations));
  const calibratedConcerns = new Set(calibrated.map((c) => c.concern));
  const reported: ConcernResult[] = [...new Set(reportedPriorities)]
    .filter((c) => !calibratedConcerns.has(c))
    .map((concern, i) => ({ concern, basis: 'reported', reportedRank: i + 1, trace: [] }));

  const byProbability = [...calibrated].sort((a, b) => b.probability - a.probability || a.concern.localeCompare(b.concern));
  return {
    version: INFERENCE_VERSION,
    releaseId: set?.releaseId ?? null,
    basis: calibrated.length > 0 ? 'calibrated' : 'reported',
    priorities: [...byProbability.map((c) => c.concern), ...reported.map((c) => c.concern)],
    concerns: [...byProbability, ...reported],
    problems,
  };
}

/**
 * Joins inferred priorities with safety rules evaluated separately on the
 * profile. Exclusions come only from `safety`: no concern score, however
 * high, can lift one, and the inference above never sees safety answers.
 */
export function combineWithSafety<S extends { excludedClasses: readonly string[] }>(
  inference: InferenceResult,
  safety: S
): { priorities: string[]; excludedClasses: readonly string[]; inference: InferenceResult } {
  return { priorities: inference.priorities, excludedClasses: safety.excludedClasses, inference };
}

/**
 * Reads the parameter set out of a knowledge release (`parameters.json` and
 * its manifest), in the browser or on the server. A development fixture is
 * refused unless explicitly allowed (tests); anything malformed yields null,
 * and inference then keeps the reported priorities.
 */
export function readParameterSet(
  manifest: { releaseId: string; schemaVersion: number; fixture: boolean },
  parametersArtifact: unknown,
  options: { allowFixture?: boolean } = {}
): ParameterSet | null {
  if (manifest.fixture && !options.allowFixture) return null;
  const parameters = (parametersArtifact as { parameters?: unknown } | null)?.parameters;
  if (!Array.isArray(parameters)) return null;
  return { releaseId: manifest.releaseId, schemaVersion: manifest.schemaVersion, parameters: parameters as BayesParameter[] };
}

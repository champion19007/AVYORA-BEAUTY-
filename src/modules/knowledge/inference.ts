/**
 * Deterministic rule application over a release: no network, no LLM, no
 * vector search. Rules are interpreted from their predicate trees. Concern
 * inference lives in `modules/personalization/core/bayes.ts`.
 */
import { evaluate, type ProfileValues } from './predicate';
import type { DecisionRule, RuleEffect } from './records';

export type RuleOutcome = {
  mode: 'recovery' | 'gentle' | 'essentials' | null;
  excludedClasses: string[];
  /** The strictest limit any applying rule sets; null when none does. */
  maxTreatments: number | null;
  /** Rules that applied, in id order, with their reason templates. */
  applied: { ruleId: string; reasonTemplateId: string }[];
};

/** Applies every rule whose condition holds. Compilation guarantees modes never conflict. */
export function applyRules(rules: readonly DecisionRule[], profile: ProfileValues): RuleOutcome {
  const out: RuleOutcome = { mode: null, excludedClasses: [], maxTreatments: null, applied: [] };
  const excluded = new Set<string>();
  for (const rule of [...rules].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!evaluate(rule.when, profile)) continue;
    out.applied.push({ ruleId: rule.id, reasonTemplateId: rule.reasonTemplateId });
    for (const e of rule.effects as RuleEffect[]) {
      if (e.kind === 'mode') out.mode = e.value;
      if (e.kind === 'excludeClass') excluded.add(e.value);
      if (e.kind === 'maxTreatments') out.maxTreatments = Math.min(out.maxTreatments ?? e.value, e.value);
    }
  }
  out.excludedClasses = [...excluded].sort();
  return out;
}

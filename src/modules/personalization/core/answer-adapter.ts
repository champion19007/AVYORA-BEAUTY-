/**
 * The versioned bridge from questionnaire answers (`SkinProfileV2`) to what
 * the engine reads: rule fields for the knowledge release's decision rules,
 * and categorical evidence for the Bayesian concern update.
 *
 * Every question has a stated purpose (`QUESTION_PURPOSES`): a decision it
 * changes, or an informational role. A question with no purpose should be
 * removed rather than asked.
 *
 * The mappings are engineering conventions, not clinical rules: they name
 * which answer means which rule field or evidence state. Whether a field
 * changes a routine is decided only by approved rules and validated
 * parameters in the release. Missing or "unknown" answers produce no rule
 * field value and no evidence, so they are neutral.
 *
 * Pure: shared by the browser and the server.
 */
import type { ProfileValues } from '@/modules/knowledge/predicate';
import type { SkinProfileV2 } from '../contracts';
import type { Observation } from './bayes';

/** Bumped whenever a mapping below changes; recorded with every routine. */
export const ANSWER_ADAPTER_VERSION = 'answers-v2-adapter-1';

export type QuestionPurpose = { decision: string } | { informational: string };

export const QUESTION_PURPOSES: Readonly<Record<keyof Omit<SkinProfileV2, 'schemaVersion'>, QuestionPurpose>> = {
  priorities: { decision: 'Ranks products by concern fit; quiz evidence for the concern update when validated parameters exist.' },
  skinType: { decision: 'Rule field skinType for approved rules; categorical quiz evidence when validated parameters exist.' },
  reactivity: { decision: 'Excludes elective actives when very reactive; lowers their ranking when reactive or unknown; rule field.' },
  currentlyIrritated: { decision: 'Excludes elective actives and switches to recovery mode under the approved rule.' },
  ageBand: { decision: 'Excludes retinoids under 18 or when not given.' },
  pregnancy: { decision: 'Excludes retinoids unless the answer is "no".' },
  nursing: { decision: 'Excludes retinoids unless the answer is "no".' },
  allergyHistory: { decision: 'Requires named allergens; without them no product can be cleared.' },
  allergyIngredientIds: { decision: 'Excludes products containing them, and products whose full list is not verified.' },
  prescribedTreatment: { decision: 'Blocks adding or combining elective actives.' },
  budgetPaise: { decision: 'Bounds new purchases: the essential set is found within it first.' },
  maxDailySteps: { decision: 'Caps steps per session; treatments and optional products are placed only where they fit.' },
  experience: { decision: 'Rule field experienceLevel: an approved beginner rule limits treatments for newcomers.' },
  adherence: { decision: 'Rule field adherence for an approved complexity rule (draft until reviewed).' },
  ownedItems: { decision: 'Fills essential steps with what the customer owns, after the same ingredient checks as products we sell.' },
  preferences: { informational: 'Eye and body care modules are not part of the face routine yet; kept for when they are.' },
};

/** Experience answer to the rule vocabulary's levels. */
const EXPERIENCE_LEVEL: Record<SkinProfileV2['experience'], 'N1' | 'N2' | 'N4'> = { new: 'N1', some: 'N2', experienced: 'N4' };

/** Rule fields with an exact equivalent in the profile; anything else stays unset, so no rule matches on a guess. */
export function ruleFields(p: SkinProfileV2): ProfileValues {
  return {
    ...(p.skinType !== 'unknown' ? { skinType: p.skinType } : {}),
    ...(p.reactivity !== 'unknown' ? { reactivity: p.reactivity } : {}),
    pregnancy: p.pregnancy,
    nursing: p.nursing,
    ...(p.ageBand === 'under18' ? { ageRange: 'under18' } : {}),
    ...(p.currentlyIrritated === 'yes' ? { currentCondition: 'irritated' } : {}),
    experienceLevel: EXPERIENCE_LEVEL[p.experience],
    adherence: p.adherence,
  };
}

/**
 * Canonical evidence groups. A quiz answer and a photo finding about the
 * same thing share one group, so the inference counts only one of them.
 * Photo models report under their own group names; `PHOTO_GROUP_ALIASES`
 * maps them onto these before inference.
 */
export const EVIDENCE_GROUPS = {
  skinType: 'self_report_skin_type',
  /** One binary group per concern: "the customer named it as a priority". */
  priority: (concern: string) => `concern_${concern}`,
} as const;

/** Photo evidence group names that describe the same thing as a canonical group. */
export const PHOTO_GROUP_ALIASES: Readonly<Record<string, string>> = {
  blemish_appearance: 'concern_blemish_appearance',
  uneven_tone: 'concern_uneven_tone',
  shine_appearance: 'concern_shine_appearance',
  fine_line_appearance: 'concern_fine_line_appearance',
};

/** Quiz answers as categorical observations. Unanswered or unknown answers yield none. */
export function quizEvidence(p: SkinProfileV2): Observation[] {
  const out: Observation[] = [];
  if (p.skinType !== 'unknown') out.push({ evidenceGroup: EVIDENCE_GROUPS.skinType, observation: p.skinType, source: 'quiz' });
  for (const concern of p.priorities) out.push({ evidenceGroup: EVIDENCE_GROUPS.priority(concern), observation: 'reported', source: 'quiz' });
  return out;
}

/** Photo observations renamed onto canonical groups, so correlated evidence collapses to one contribution. */
export function canonicalObservations(observations: readonly Observation[]): Observation[] {
  return observations.map((o) => (o.source === 'photo' && PHOTO_GROUP_ALIASES[o.evidenceGroup] ? { ...o, evidenceGroup: PHOTO_GROUP_ALIASES[o.evidenceGroup] } : o));
}

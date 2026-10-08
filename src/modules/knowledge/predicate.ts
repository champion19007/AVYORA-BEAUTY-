/**
 * Rule conditions as a typed predicate tree.
 *
 * A condition is data, never code: five operations (`eq`, `in`, `all`, `any`,
 * `not`) over a fixed set of normalised profile fields, each with a finite
 * domain. Nothing stored in the CMS or a release is ever evaluated as
 * JavaScript; `evaluate` is a plain interpreter over this tree.
 *
 * Finite domains make two checks exact rather than heuristic: whether a
 * condition can ever be true (an unreachable rule fails compilation), and
 * whether two conditions can be true together (overlapping rules with
 * conflicting effects fail compilation). Both enumerate only the fields a
 * condition mentions, which for these domains is at most a few thousand
 * combinations.
 */
import { z } from 'zod';

/** Fields of the normalised profile (`normalizeAnswers`) a rule may test, with every value they can take. */
export const PROFILE_FIELDS = {
  skinType: ['oily', 'dry', 'combination', 'normal', 'sensitive'],
  reactivity: ['low', 'medium', 'high', 'very_high'],
  ageRange: ['under18', '18_24', '25_34', '35_44', '45_plus'],
  sunExposure: ['indoors', 'moderate', 'outdoors', 'high'],
  experienceLevel: ['N0', 'N1', 'N2', 'N3', 'N4'],
  currentCondition: ['clear', 'occasional', 'frequent', 'pigmentation', 'dry', 'texture', 'irritated', 'multiple'],
  pregnancy: ['yes', 'no', 'unknown'],
  darkCircles: ['no', 'mild', 'noticeable', 'significant'],
} as const satisfies Record<string, readonly string[]>;

export type ProfileField = keyof typeof PROFILE_FIELDS;
export type ProfileValues = Partial<Record<ProfileField, string>>;

export type Predicate =
  | { op: 'eq'; field: ProfileField; value: string }
  | { op: 'in'; field: ProfileField; values: string[] }
  | { op: 'all'; of: Predicate[] }
  | { op: 'any'; of: Predicate[] }
  | { op: 'not'; of: Predicate };

export const MAX_PREDICATE_DEPTH = 6;

const fieldName = z.enum(Object.keys(PROFILE_FIELDS) as [ProfileField, ...ProfileField[]]);

/** Shape only. `predicateProblems` adds domain and depth checks. Unknown keys are rejected. */
export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('eq'), field: fieldName, value: z.string() }).strict(),
    z.object({ op: z.literal('in'), field: fieldName, values: z.array(z.string()).min(1) }).strict(),
    z.object({ op: z.literal('all'), of: z.array(predicateSchema).min(1) }).strict(),
    z.object({ op: z.literal('any'), of: z.array(predicateSchema).min(1) }).strict(),
    z.object({ op: z.literal('not'), of: predicateSchema }).strict(),
  ])
);

/** Structural problems: shape, unknown fields, values outside the field's domain, excessive depth. */
export function predicateProblems(input: unknown, where: string): string[] {
  const parsed = predicateSchema.safeParse(input);
  if (!parsed.success) return [`${where}: invalid condition (${parsed.error.issues[0]?.message ?? 'shape'})`];

  const problems: string[] = [];
  const walk = (p: Predicate, depth: number) => {
    if (depth > MAX_PREDICATE_DEPTH) {
      problems.push(`${where}: condition nested deeper than ${MAX_PREDICATE_DEPTH}`);
      return;
    }
    const domain = 'field' in p ? (PROFILE_FIELDS[p.field] as readonly string[]) : null;
    if (p.op === 'eq' && !domain!.includes(p.value)) problems.push(`${where}: ${p.field} can never be "${p.value}"`);
    if (p.op === 'in') for (const v of p.values) if (!domain!.includes(v)) problems.push(`${where}: ${p.field} can never be "${v}"`);
    if (p.op === 'all' || p.op === 'any') p.of.forEach((c) => walk(c, depth + 1));
    if (p.op === 'not') walk(p.of, depth + 1);
  };
  walk(parsed.data, 1);
  return problems;
}

/** Interprets a condition against a profile. A missing field is never equal to anything. */
export function evaluate(p: Predicate, profile: ProfileValues): boolean {
  switch (p.op) {
    case 'eq':
      return profile[p.field] === p.value;
    case 'in':
      return profile[p.field] !== undefined && p.values.includes(profile[p.field]!);
    case 'all':
      return p.of.every((c) => evaluate(c, profile));
    case 'any':
      return p.of.some((c) => evaluate(c, profile));
    case 'not':
      return !evaluate(p.of, profile);
  }
}

export function fieldsOf(p: Predicate, into = new Set<ProfileField>()): Set<ProfileField> {
  if ('field' in p) into.add(p.field);
  else if (p.op === 'not') fieldsOf(p.of, into);
  else p.of.forEach((c) => fieldsOf(c, into));
  return into;
}

/** A profile (over the mentioned fields) that makes the condition true, or null if none can. */
export function witness(p: Predicate): ProfileValues | null {
  const fields = [...fieldsOf(p)];
  const assign = (i: number, acc: ProfileValues): ProfileValues | null => {
    if (i === fields.length) return evaluate(p, acc) ? { ...acc } : null;
    for (const v of PROFILE_FIELDS[fields[i]]) {
      const found = assign(i + 1, { ...acc, [fields[i]]: v });
      if (found) return found;
    }
    return null;
  };
  return assign(0, {});
}

export const satisfiable = (p: Predicate): boolean => witness(p) !== null;

/** Whether some profile satisfies both conditions at once. */
export const overlaps = (a: Predicate, b: Predicate): boolean => satisfiable({ op: 'all', of: [a, b] });

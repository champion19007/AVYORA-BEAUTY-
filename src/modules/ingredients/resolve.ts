/**
 * Label text → canonical ingredient id, or an honest "ambiguous" or
 * "unresolved".
 *
 * The old resolver compared whole lowercased strings, so "Niacinamide 10%"
 * and "Hyaluronic Acid (5 Weights)" matched nothing (audit #18) and the
 * product looked ingredient-free, which every check read as "no conflicts".
 * Now a label is normalised first, any stated concentration is split off as
 * an unverified label claim, and the result says which of three things
 * happened. Pure: runs in the browser and in tests.
 */
import { AMBIGUOUS_ALIASES, INGREDIENTS, type Ingredient } from './dictionary';

export type LabelClaim = { value: number; unit: 'percent' };

export type Resolution =
  | { status: 'resolved'; label: string; id: string; labelClaim: LabelClaim | null }
  | { status: 'ambiguous'; label: string; candidates: string[]; labelClaim: LabelClaim | null }
  | { status: 'unresolved'; label: string; labelClaim: LabelClaim | null };

/**
 * Lowercase, drop parenthetical asides ("(5 Weights)", "(PHA)"), drop a
 * stated percentage, collapse punctuation and whitespace.
 */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A percentage printed in a label or highlight, e.g. "Niacinamide 10%".
 * Marketing copy, not formulation data: never stored as a concentration.
 */
export function labelClaim(label: string): LabelClaim | null {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(label);
  return m ? { value: Number(m[1]), unit: 'percent' } : null;
}

export type AliasMap = {
  map: ReadonlyMap<string, string>;
  ambiguous: ReadonlyMap<string, string[]>;
  /** Normalised names claimed by two dictionary entries: a data error. */
  collisions: { alias: string; ids: string[] }[];
};

export function buildAliasMap(
  ingredients: readonly Ingredient[] = INGREDIENTS,
  ambiguousAliases = AMBIGUOUS_ALIASES
): AliasMap {
  const owners = new Map<string, Set<string>>();
  for (const ing of ingredients) {
    for (const name of [ing.inci, ing.common, ...ing.aliases]) {
      const key = normaliseLabel(name);
      if (!key) continue;
      const set = owners.get(key) ?? new Set<string>();
      set.add(ing.id);
      owners.set(key, set);
    }
  }

  const ambiguous = new Map(ambiguousAliases.map((a) => [normaliseLabel(a.alias), a.candidates]));
  const map = new Map<string, string>();
  const collisions: AliasMap['collisions'] = [];
  for (const [key, ids] of owners) {
    if (ambiguous.has(key)) continue; // a declared ambiguity always wins
    if (ids.size > 1) {
      collisions.push({ alias: key, ids: [...ids] });
      ambiguous.set(key, [...ids]);
    } else {
      map.set(key, [...ids][0]);
    }
  }
  return { map, ambiguous, collisions };
}

const DEFAULT_MAP = buildAliasMap();

export function resolveLabel(label: string, aliases: AliasMap = DEFAULT_MAP): Resolution {
  const key = normaliseLabel(label);
  const claim = labelClaim(label);
  const candidates = aliases.ambiguous.get(key);
  if (candidates) return { status: 'ambiguous', label, candidates, labelClaim: claim };
  const id = aliases.map.get(key);
  if (id) return { status: 'resolved', label, id, labelClaim: claim };
  return { status: 'unresolved', label, labelClaim: claim };
}

export type LabelSetResolution = {
  ids: string[];
  ambiguous: Extract<Resolution, { status: 'ambiguous' }>[];
  unresolved: Extract<Resolution, { status: 'unresolved' }>[];
  /** True only when every label resolved. Anything else is not "no conflicts". */
  complete: boolean;
};

/** Resolve a list of labels, or one comma/semicolon/newline separated string. */
export function resolveLabels(labels: string | readonly string[], aliases: AliasMap = DEFAULT_MAP): LabelSetResolution {
  const list = (typeof labels === 'string' ? labels.split(/[,;\n]/) : labels).map((l) => l.trim()).filter(Boolean);
  const ids = new Set<string>();
  const ambiguous: LabelSetResolution['ambiguous'] = [];
  const unresolved: LabelSetResolution['unresolved'] = [];
  for (const label of list) {
    const r = resolveLabel(label, aliases);
    if (r.status === 'resolved') ids.add(r.id);
    else if (r.status === 'ambiguous') ambiguous.push(r);
    else unresolved.push(r);
  }
  return { ids: [...ids], ambiguous, unresolved, complete: ambiguous.length === 0 && unresolved.length === 0 };
}

const DICTIONARY_IDS = new Set(INGREDIENTS.map((i) => i.id));

/**
 * Every dictionary ingredient a label set could contain: the resolved ids
 * plus each dictionary candidate of an ambiguous label. For safety checks,
 * where "vitamin c" must be treated as possibly ascorbic acid rather than as
 * nothing at all.
 */
export function possibleIds(r: LabelSetResolution): string[] {
  const ids = new Set(r.ids);
  for (const a of r.ambiguous) for (const c of a.candidates) if (DICTIONARY_IDS.has(c)) ids.add(c);
  return [...ids];
}

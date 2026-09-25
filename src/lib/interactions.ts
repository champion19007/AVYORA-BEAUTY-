import { and, eq, inArray } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { ingredients, ingredientInteractions } from '@/db/schema';
import { cache, POLICIES } from '@/infrastructure/cache';

/**
 * Ingredient interaction checking.
 *
 * The promise is narrow and worth stating: this tells a customer when two
 * things in their routine work against each other, and what to do about it. It
 * does not diagnose, it does not replace a dermatologist, and it never blocks
 * a purchase.
 *
 * Not blocking is a deliberate decision, not timidity. Blocking a sale on the
 * strength of a rule about *another brand's* product — while selling your own
 * — is a conflict of interest anyone can see, and asserting that much
 * authority invites a duty of care that a citation list cannot discharge. A
 * clear warning earns the same trust and carries none of that.
 *
 * Findings are ordered by tier, and the tiers mean genuinely different things:
 *
 *   1  Prescription present — defer to the prescriber, always shown
 *   2  Established deactivation — a documented chemical interaction, cited
 *   3  Additive irritation — plausible, not documented as an interaction
 *   4  Sequencing preference — formulation best practice
 *
 * Merging these would be the mistake. A pharmacological fact and a piece of
 * skincare folklore under one "Warning" heading drags the fact down to the
 * folklore's credibility, and the fact is the one that matters.
 */

export type Finding = {
  tier: 1 | 2 | 3 | 4;
  title: string;
  detail: string;
  citation: string | null;
  /** Ingredient ids involved, for highlighting the products in the UI. */
  involves: string[];
};

export type RoutineEntry = {
  label: string;
  ingredientIds: string[];
  prescribed: boolean;
};

/**
 * Checks a routine, optionally with something the customer is about to add.
 *
 * The candidate is passed separately so the interface can say "this would
 * conflict with what you already use" rather than only describing a routine
 * that already has the problem in it.
 */
export async function evaluateRoutine(
  routine: RoutineEntry[],
  candidateIngredientIds: string[] = []
): Promise<Finding[]> {
  if (!isDatabaseConfigured()) return [];

  const findings: Finding[] = [];

  const present = new Set<string>();
  for (const item of routine) for (const id of item.ingredientIds) present.add(id);
  for (const id of candidateIngredientIds) present.add(id);

  if (present.size === 0) return [];

  const known = await db
    .select()
    .from(ingredients)
    .where(inArray(ingredients.id, [...present]));

  const byId = new Map(known.map((i) => [i.id, i]));

  /* ---- Tier 1: prescriptions ------------------------------------------- */

  /*
   * Shown whenever a prescription is in the routine, and shown *alongside*
   * the other tiers rather than instead of them.
   *
   * An earlier design had this as a hard stop that suppressed everything else.
   * That reversed the intent: the flagship established interaction — benzoyl
   * peroxide degrading tretinoin — is itself about a prescription drug, so
   * stopping here would have withheld the most useful warning from exactly
   * the people who need it.
   */
  const prescribed = routine.filter(
    (item) => item.prescribed || item.ingredientIds.some((id) => byId.get(id)?.prescriptionOnly)
  );

  if (prescribed.length > 0) {
    findings.push({
      tier: 1,
      title: 'Your routine includes a prescription',
      detail:
        `${prescribed.map((p) => p.label).join(', ')} was prescribed for you. ` +
        'Your dermatologist knows your skin and your history; where anything ' +
        'below differs from what they told you, follow them, not us. Bring ' +
        'these notes to your next appointment if they are useful.',
      citation: null,
      involves: prescribed.flatMap((p) => p.ingredientIds),
    });
  }

  /* ---- Pregnancy: a property of the molecule, not of a pair ------------- */

  const teratogens = known.filter((i) => i.pregnancyCaution);
  if (teratogens.length > 0) {
    findings.push({
      tier: 2,
      title: 'Not suitable during pregnancy',
      detail:
        `${teratogens.map((i) => i.commonName).join(', ')} should be avoided ` +
        'if you are pregnant, trying to conceive, or breastfeeding. This ' +
        'applies on its own, whatever else is in your routine.',
      citation: 'Cosmetics Rules 2020, Schedule S; standard obstetric guidance',
      involves: teratogens.map((i) => i.id),
    });
  }

  /* ---- Tiers 2-4: documented pairs -------------------------------------- */

  const ids = [...present];

  const pairs = await db
    .select()
    .from(ingredientInteractions)
    .where(
      and(
        inArray(ingredientInteractions.ingredientA, ids),
        inArray(ingredientInteractions.ingredientB, ids)
      )
    );

  for (const pair of pairs) {
    const a = byId.get(pair.ingredientA);
    const b = byId.get(pair.ingredientB);
    if (!a || !b) continue;

    findings.push({
      tier: pair.tier as 2 | 3 | 4,
      title: `${a.commonName} with ${b.commonName}`,
      detail: `${pair.summary} ${pair.advice}`,
      citation: pair.citation,
      involves: [a.id, b.id],
    });
  }

  return findings.sort((x, y) => x.tier - y.tier);
}

/**
 * Resolves an ingredient list from a label into known ingredient ids.
 *
 * Matches on the INCI name and on recorded synonyms, because labels are not
 * consistent: the same molecule appears as "Tretinoin", "All-trans retinoic
 * acid", and "Retinoic acid" depending on who printed the carton.
 *
 * Unmatched entries are simply not returned. Silence about an ingredient we do
 * not recognise is correct — inventing a match would produce a confident
 * warning about the wrong molecule.
 */
export async function resolveIngredients(labelText: string): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];

  const tokens = labelText
    .toLowerCase()
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  if (tokens.length === 0) return [];

  // The whole dictionary, cached: it changes only when the seed script runs,
  // and reading every row on every label lookup was the slowest thing here.
  const all = await cache.getOrSet(POLICIES.ingredients, 'dictionary', () =>
    db.select().from(ingredients)
  );
  const matched = new Set<string>();

  for (const ingredient of all) {
    const names = [
      ingredient.inciName.toLowerCase(),
      ingredient.commonName.toLowerCase(),
      ...((ingredient.synonyms as string[] | null) ?? []).map((s) => s.toLowerCase()),
    ];

    if (tokens.some((token) => names.includes(token))) matched.add(ingredient.id);
  }

  return [...matched];
}

/** Whether any ingredient in a set raises sun sensitivity. */
export async function hasPhotosensitiser(ingredientIds: string[]): Promise<boolean> {
  if (!isDatabaseConfigured() || ingredientIds.length === 0) return false;

  const [row] = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(inArray(ingredients.id, ingredientIds), eq(ingredients.photosensitising, true)))
    .limit(1);

  return Boolean(row);
}

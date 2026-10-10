/**
 * Copies the knowledge modules into the database, after validating them.
 *
 * Import checks run first and the import refuses on any problem: alias
 * collisions, interaction rules naming unknown ingredients, invalid
 * formulations (units, ambiguous INCI labels, broken evidence links) and
 * directions without a matching formulation. Everything is written in one
 * transaction, so a failure leaves the previous knowledge in place.
 *
 * Server-only (database). Used by `npm run db:import-knowledge` and tests.
 */
import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { AMBIGUOUS_ALIASES, type Ingredient } from './dictionary';
import { buildAliasMap } from './resolve';
import { knowledgeProblems, type Knowledge } from './formulations';
import type { InteractionRule } from './interaction-rules';

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type KnowledgeInput = Knowledge & {
  ingredients: readonly Ingredient[];
  rules: readonly InteractionRule[];
};

export function importProblems(input: KnowledgeInput): string[] {
  const problems: string[] = [];
  const ids = new Set(input.ingredients.map((i) => i.id));
  for (const c of buildAliasMap(input.ingredients, AMBIGUOUS_ALIASES).collisions) {
    problems.push(`Alias "${c.alias}" is claimed by ${c.ids.join(' and ')}; declare it ambiguous or remove it`);
  }
  for (const r of input.rules) {
    for (const id of [r.a, r.b]) if (!ids.has(id)) problems.push(`Interaction ${r.a}/${r.b}: unknown ingredient ${id}`);
    if (r.tier === 2 && !r.citation) problems.push(`Interaction ${r.a}/${r.b}: tier 2 needs a citation`);
  }
  for (const f of input.formulations) {
    for (const ing of f.ingredients) {
      if (ing.ingredientId && !ids.has(ing.ingredientId))
        problems.push(`${f.productId} v${f.version}: unknown ingredient ${ing.ingredientId}`);
    }
  }
  problems.push(...knowledgeProblems(input));
  return problems;
}

export type ImportResult =
  | { ok: true; ingredients: number; aliases: number; rules: number; formulations: number; usageProfiles: number }
  | { ok: false; problems: string[] };

export async function importKnowledge(db: Db, input: KnowledgeInput): Promise<ImportResult> {
  const problems = importProblems(input);
  if (problems.length) return { ok: false, problems };

  const aliasMap = buildAliasMap(input.ingredients, AMBIGUOUS_ALIASES);

  await db.transaction(async (tx) => {
    for (const i of input.ingredients) {
      const row = {
        id: i.id,
        inciName: i.inci,
        commonName: i.common,
        synonyms: i.aliases,
        prescriptionOnly: i.prescriptionOnly,
        pregnancyCaution: i.pregnancyCaution,
        photosensitising: i.photosensitising,
        class: i.class,
      };
      await tx.insert(schema.ingredients).values(row).onConflictDoUpdate({ target: schema.ingredients.id, set: row });
    }

    // The alias table is derived data: rebuilt whole, so a removed alias goes.
    await tx.delete(schema.ingredientAliases);
    const aliasRows = [
      ...[...aliasMap.map].map(([alias, ingredientId]) => ({ alias, ingredientId, ambiguousCandidates: null })),
      ...[...aliasMap.ambiguous].map(([alias, candidates]) => ({
        alias,
        ingredientId: null,
        ambiguousCandidates: candidates,
      })),
    ];
    if (aliasRows.length) await tx.insert(schema.ingredientAliases).values(aliasRows);

    for (const r of input.rules) {
      // One row per pair, sorted; the reader looks both ways.
      const [a, b] = [r.a, r.b].sort();
      const row = {
        ingredientA: a,
        ingredientB: b,
        tier: r.tier,
        summary: r.summary,
        advice: r.advice,
        citation: r.citation,
      };
      await tx
        .insert(schema.ingredientInteractions)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.ingredientInteractions.ingredientA, schema.ingredientInteractions.ingredientB],
          set: { tier: r.tier, summary: r.summary, advice: r.advice, citation: r.citation },
        });
    }

    for (const e of input.evidence) {
      const row = {
        id: e.id,
        title: e.title,
        url: e.url,
        sourceType: e.sourceType,
        retrievedAt: e.retrievedAt,
        limitations: e.limitations,
      };
      await tx
        .insert(schema.evidenceSources)
        .values(row)
        .onConflictDoUpdate({ target: schema.evidenceSources.id, set: row });
    }

    for (const f of input.formulations) {
      const id = `${f.productId}@v${f.version}`;
      const row = {
        id,
        productId: f.productId,
        version: f.version,
        coverage: f.coverage,
        fullInci: f.fullInci,
        sourceId: f.sourceId,
        reviewedBy: f.reviewedBy,
        reviewedAt: f.reviewedAt,
      };
      await tx.insert(schema.formulations).values(row).onConflictDoUpdate({ target: schema.formulations.id, set: row });
      await tx.delete(schema.formulationIngredients).where(eq(schema.formulationIngredients.formulationId, id));
      if (f.ingredients.length) {
        await tx.insert(schema.formulationIngredients).values(
          f.ingredients.map((ing) => ({
            formulationId: id,
            position: ing.position,
            inciLabel: ing.inciLabel,
            ingredientId: ing.ingredientId,
            concentrationKnown: ing.concentration.known,
            concentration: ing.concentration.known ? String(ing.concentration.value) : null,
            unit: ing.concentration.known ? ing.concentration.unit : null,
          }))
        );
      }
    }

    for (const [productId, d] of Object.entries(input.directions)) {
      const row = {
        formulationId: `${productId}@v${d.formulationVersion}`,
        session: d.session,
        frequency: d.frequency,
        directions: d.text,
        maxWeeklyUses: d.maxWeeklyUses,
        evidenceIds: d.evidenceIds,
        reviewedBy: d.reviewedBy,
        reviewedAt: d.reviewedAt,
      };
      await tx
        .insert(schema.usageProfiles)
        .values(row)
        .onConflictDoUpdate({ target: schema.usageProfiles.formulationId, set: row });
    }
  });

  return {
    ok: true,
    ingredients: input.ingredients.length,
    aliases: aliasMap.map.size + aliasMap.ambiguous.size,
    rules: input.rules.length,
    formulations: input.formulations.length,
    usageProfiles: Object.keys(input.directions).length,
  };
}

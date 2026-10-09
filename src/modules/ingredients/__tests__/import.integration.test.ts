import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createMigratedDb } from '@/test/migrated-db';
import * as schema from '@/db/schema';
import { INGREDIENTS } from '../dictionary';
import { INTERACTION_RULES } from '../interaction-rules';
import { importKnowledge, type KnowledgeInput } from '../import';
import type { Formulation } from '../formulations';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { APPROVED_DIRECTIONS } from '@/data/product-directions';

let ctx: Awaited<ReturnType<typeof createMigratedDb>>;
beforeAll(async () => {
  ctx = await createMigratedDb();
}, 60_000);
afterAll(async () => {
  await ctx?.client.close();
});

const REAL: KnowledgeInput = {
  ingredients: INGREDIENTS,
  rules: INTERACTION_RULES,
  formulations: FORMULATIONS,
  evidence: EVIDENCE_SOURCES,
  directions: APPROVED_DIRECTIONS,
};

const fixtureFormulation: Formulation = {
  productId: 'niacinamide-drops',
  version: 1,
  coverage: 'complete',
  fullInci: 'Aqua, Niacinamide',
  ingredients: [
    { position: 1, inciLabel: 'Aqua', ingredientId: 'water', concentration: { known: false } },
    { position: 2, inciLabel: 'Niacinamide', ingredientId: 'niacinamide', concentration: { known: true, value: 5, unit: 'percent_w_w' } },
  ],
  sourceId: 'fixture',
  reviewedBy: 'fixture',
  reviewedAt: '2026-01-01',
};
const fixtureEvidence = [
  { id: 'fixture', title: 'Fixture', url: null, sourceType: 'label' as const, retrievedAt: '2026-01-01', limitations: 'Test only' },
];

describe('importing knowledge', () => {
  it('writes the dictionary, the alias map and the interaction rules; no formulations exist to write', async () => {
    const result = await importKnowledge(ctx.db as never, REAL);
    expect(result).toMatchObject({ ok: true, ingredients: INGREDIENTS.length, rules: INTERACTION_RULES.length, formulations: 0, usageProfiles: 0 });

    const [retinal] = await ctx.db.select().from(schema.ingredients).where(eq(schema.ingredients.id, 'retinal'));
    expect(retinal).toMatchObject({ inciName: 'Retinal', class: 'retinoid' });

    const aliases = await ctx.db.select().from(schema.ingredientAliases);
    const byAlias = new Map(aliases.map((a) => [a.alias, a]));
    expect(byAlias.get('retinaldehyde')?.ingredientId).toBe('retinal');
    expect(byAlias.get('retinol')?.ingredientId).toBe('retinol');
    expect(byAlias.get('vitamin c')).toMatchObject({ ingredientId: null });
    expect(byAlias.get('vitamin c')?.ambiguousCandidates).toContain('ascorbic-acid');
  });

  it('is safe to run again', async () => {
    expect(await importKnowledge(ctx.db as never, REAL)).toMatchObject({ ok: true });
    const rules = await ctx.db.select().from(schema.ingredientInteractions);
    expect(rules).toHaveLength(INTERACTION_RULES.length);
  });

  it('stores a verified formulation with its positions and explicit concentration status', async () => {
    const result = await importKnowledge(ctx.db as never, { ...REAL, formulations: [fixtureFormulation], evidence: fixtureEvidence });
    expect(result).toMatchObject({ ok: true, formulations: 1 });
    const rows = await ctx.db
      .select()
      .from(schema.formulationIngredients)
      .where(eq(schema.formulationIngredients.formulationId, 'niacinamide-drops@v1'));
    expect(rows.map((r) => [r.position, r.ingredientId, r.concentrationKnown, r.concentration, r.unit])).toEqual([
      [1, 'water', false, null, null],
      [2, 'niacinamide', true, '5.0000', 'percent_w_w'],
    ]);
  });

  it('refuses invalid knowledge and writes nothing', async () => {
    const before = await ctx.db.select().from(schema.ingredients);
    const bad: KnowledgeInput = {
      ...REAL,
      ingredients: [...INGREDIENTS, { ...INGREDIENTS[0], id: 'tretinoin-copy' }],
      rules: [...INTERACTION_RULES, { a: 'retinol', b: 'nonexistent', tier: 2, summary: 's', advice: 'a', citation: null }],
      formulations: [{ ...fixtureFormulation, version: 2, sourceId: 'missing' }],
      evidence: fixtureEvidence,
    };
    const result = await importKnowledge(ctx.db as never, bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.problems.join('\n');
      expect(text).toMatch(/is claimed by tretinoin and tretinoin-copy/);
      expect(text).toMatch(/unknown ingredient nonexistent/);
      expect(text).toMatch(/tier 2 needs a citation/);
      expect(text).toMatch(/evidence source missing does not exist/);
    }
    expect(await ctx.db.select().from(schema.ingredients)).toHaveLength(before.length);
  });
});

describe('database constraints', () => {
  const q = (text: string) => ctx.client.query(text);

  it('rejects a known concentration without a valid unit, or above 100%', async () => {
    await expect(q(`INSERT INTO formulation_ingredients (formulation_id, position, inci_label, concentration_known, concentration, unit)
      VALUES ('niacinamide-drops@v1', 9, 'X', true, 5, 'percent')`)).rejects.toThrow(/formulation_ingredients_concentration/);
    await expect(q(`INSERT INTO formulation_ingredients (formulation_id, position, inci_label, concentration_known, concentration, unit)
      VALUES ('niacinamide-drops@v1', 9, 'X', true, 150, 'percent_w_w')`)).rejects.toThrow(/formulation_ingredients_concentration/);
    await expect(q(`INSERT INTO formulation_ingredients (formulation_id, position, inci_label, concentration_known, concentration, unit)
      VALUES ('niacinamide-drops@v1', 9, 'X', false, 5, NULL)`)).rejects.toThrow(/formulation_ingredients_concentration/);
  });

  it('rejects complete coverage without an INCI list, and an alias with two meanings', async () => {
    await expect(q(`INSERT INTO formulations (id, product_id, version, coverage, full_inci, source_id, reviewed_by, reviewed_at)
      VALUES ('retinol@v1', 'retinol', 1, 'complete', NULL, 'fixture', 'x', 'x')`)).rejects.toThrow(/formulations_complete_has_inci/);
    await expect(q(`INSERT INTO ingredient_aliases (alias, ingredient_id, ambiguous_candidates)
      VALUES ('both', 'retinol', '["retinal"]')`)).rejects.toThrow(/ingredient_aliases_one_meaning/);
  });
});

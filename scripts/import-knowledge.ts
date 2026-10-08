/**
 * Validates the knowledge modules and writes them to DATABASE_URL:
 * ingredient dictionary, alias map, interaction rules, evidence sources,
 * formulations and approved usage profiles.
 *
 *   npm run db:import-knowledge
 *
 * Refuses, writing nothing, if any import check fails. Safe to re-run.
 * Replaces `scripts/seed-ingredients.mjs` (`db:seed-ingredients` now runs this).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from '../src/db/schema';
import { INGREDIENTS } from '../src/modules/ingredients/dictionary';
import { INTERACTION_RULES } from '../src/modules/ingredients/interaction-rules';
import { importKnowledge } from '../src/modules/ingredients/import';
import { EVIDENCE_SOURCES, FORMULATIONS } from '../src/data/formulations';
import { APPROVED_DIRECTIONS } from '../src/data/product-directions';

config({ path: '.env.local' });
config();

async function main(url: string) {
  const sql = postgres(url, { max: 1 });
  try {
    const result = await importKnowledge(drizzle(sql, { schema }) as never, {
      ingredients: INGREDIENTS,
      rules: INTERACTION_RULES,
      formulations: FORMULATIONS,
      evidence: EVIDENCE_SOURCES,
      directions: APPROVED_DIRECTIONS,
    });
    if (!result.ok) {
      console.error(`Import refused:\n  - ${result.problems.join('\n  - ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Imported ${result.ingredients} ingredients, ${result.aliases} aliases, ${result.rules} interaction rules, ` +
        `${result.formulations} formulations, ${result.usageProfiles} usage profiles.`
    );
  } finally {
    await sql.end();
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
main(url).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

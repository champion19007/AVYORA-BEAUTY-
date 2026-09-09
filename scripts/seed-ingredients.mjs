#!/usr/bin/env node
/**
 * Seeds the ingredient dictionary and the interaction rules.
 *
 *   npm run db:seed-ingredients
 *
 * Safe to re-run: rows are upserted by id, so corrections to wording or
 * citations here become corrections in the database.
 *
 * This is a starting set, not a product database. It covers the actives that
 * actually appear in routines for the conditions this shop serves, and every
 * Tier 2 rule carries a source. Rules that cannot be cited belong in Tier 3 or
 * nowhere — the value of the whole feature rests on a dermatologist being able
 * to check any warning it produces and agree with it.
 *
 * What is deliberately absent: the claim that vitamin C and niacinamide
 * conflict. The reaction that produces niacin needs heat and conditions that
 * formulated products do not meet, and warning about it would be repeating
 * folklore in a system whose entire value is not doing that.
 */
import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */

const INGREDIENTS = [
  {
    id: 'tretinoin',
    inci: 'Tretinoin',
    common: 'Tretinoin',
    synonyms: ['all-trans retinoic acid', 'retinoic acid'],
    rx: true,
    pregnancy: true,
    photo: true,
  },
  {
    id: 'adapalene',
    inci: 'Adapalene',
    common: 'Adapalene',
    synonyms: [],
    rx: false,
    pregnancy: true,
    photo: false,
  },
  {
    id: 'retinol',
    inci: 'Retinol',
    common: 'Retinol',
    synonyms: ['vitamin a'],
    rx: false,
    pregnancy: true,
    photo: true,
  },
  {
    id: 'benzoyl-peroxide',
    inci: 'Benzoyl Peroxide',
    common: 'Benzoyl peroxide',
    synonyms: ['bpo'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'ascorbic-acid',
    inci: 'Ascorbic Acid',
    common: 'Vitamin C',
    synonyms: ['l-ascorbic acid', 'vitamin c'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'niacinamide',
    inci: 'Niacinamide',
    common: 'Niacinamide',
    synonyms: ['vitamin b3', 'nicotinamide'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'azelaic-acid',
    inci: 'Azelaic Acid',
    common: 'Azelaic acid',
    synonyms: [],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'glycolic-acid',
    inci: 'Glycolic Acid',
    common: 'Glycolic acid',
    synonyms: ['aha'],
    rx: false,
    pregnancy: false,
    photo: true,
  },
  {
    id: 'lactic-acid',
    inci: 'Lactic Acid',
    common: 'Lactic acid',
    synonyms: [],
    rx: false,
    pregnancy: false,
    photo: true,
  },
  {
    id: 'salicylic-acid',
    inci: 'Salicylic Acid',
    common: 'Salicylic acid',
    synonyms: ['bha'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'urea',
    inci: 'Urea',
    common: 'Urea',
    synonyms: ['carbamide'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'hydroquinone',
    inci: 'Hydroquinone',
    common: 'Hydroquinone',
    synonyms: [],
    rx: true,
    pregnancy: true,
    photo: false,
  },
  {
    id: 'tacrolimus',
    inci: 'Tacrolimus',
    common: 'Tacrolimus',
    synonyms: [],
    rx: true,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'hyaluronic-acid',
    inci: 'Sodium Hyaluronate',
    common: 'Hyaluronic acid',
    synonyms: ['hyaluronic acid'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'ceramides',
    inci: 'Ceramide NP',
    common: 'Ceramides',
    synonyms: ['ceramide np', 'ceramide ap'],
    rx: false,
    pregnancy: false,
    photo: false,
  },
  {
    id: 'zinc-oxide',
    inci: 'Zinc Oxide',
    common: 'Zinc oxide',
    synonyms: [],
    rx: false,
    pregnancy: false,
    photo: false,
  },
];

const MARTIN_1998 =
  'Martin B et al. Chemical stability of adapalene and tretinoin when combined ' +
  'with benzoyl peroxide. Br J Dermatol. 1998;139 Suppl 52:8-11.';

const INTERACTIONS = [
  {
    a: 'benzoyl-peroxide',
    b: 'tretinoin',
    tier: 2,
    summary: 'Benzoyl peroxide oxidises tretinoin, leaving less of it active on your skin.',
    advice: 'Use benzoyl peroxide in the morning and tretinoin at night, not together.',
    citation: MARTIN_1998,
  },
  /*
   * No row for benzoyl peroxide with adapalene, and that absence is the point.
   * The same study that found tretinoin degrades found adapalene stable — the
   * two are sold co-formulated. A class-wide "retinoid" rule would warn people
   * off a combination dermatologists prescribe deliberately.
   */
  {
    a: 'glycolic-acid',
    b: 'salicylic-acid',
    tier: 3,
    summary:
      'Two strong exfoliants in one routine can irritate more than either does alone. ' +
      'This is additive irritation rather than a documented chemical reaction.',
    advice: 'Alternate them on different days, and stop if your skin starts to sting or flake.',
    citation: null,
  },
  {
    a: 'glycolic-acid',
    b: 'tretinoin',
    tier: 3,
    summary: 'Acids and retinoids together often irritate more than the sum of the two.',
    advice: 'Start on alternate nights and build up only if your skin stays comfortable.',
    citation: null,
  },
  {
    a: 'ascorbic-acid',
    b: 'tretinoin',
    tier: 4,
    summary:
      'Vitamin C works at a low pH and retinoids at a higher one, so applying them ' +
      'together can make each less effective. Neither will harm the other.',
    advice: 'Vitamin C in the morning, retinoid at night gets the most out of both.',
    citation: null,
  },
  {
    a: 'ascorbic-acid',
    b: 'retinol',
    tier: 4,
    summary: 'The same pH mismatch as with tretinoin: less effect, no harm.',
    advice: 'Split them across morning and evening.',
    citation: null,
  },
];

/* -------------------------------------------------------------------------- */

const sql = postgres(url, { max: 1 });

try {
  for (const item of INGREDIENTS) {
    await sql`
      INSERT INTO ingredients
        (id, inci_name, common_name, synonyms, prescription_only, pregnancy_caution, photosensitising)
      VALUES
        (${item.id}, ${item.inci}, ${item.common}, ${JSON.stringify(item.synonyms)}::jsonb,
         ${item.rx}, ${item.pregnancy}, ${item.photo})
      ON CONFLICT (id) DO UPDATE SET
        inci_name = EXCLUDED.inci_name,
        common_name = EXCLUDED.common_name,
        synonyms = EXCLUDED.synonyms,
        prescription_only = EXCLUDED.prescription_only,
        pregnancy_caution = EXCLUDED.pregnancy_caution,
        photosensitising = EXCLUDED.photosensitising
    `;
  }

  for (const rule of INTERACTIONS) {
    /*
     * Pairs are stored in one direction only, sorted, and the reader looks
     * both ways. Storing both directions would mean two rows that can disagree
     * after an edit — and a safety rule that contradicts itself is worse than
     * no rule.
     */
    const [a, b] = [rule.a, rule.b].sort();

    await sql`
      INSERT INTO ingredient_interactions
        (id, ingredient_a, ingredient_b, tier, summary, advice, citation)
      VALUES
        (${crypto.randomUUID()}, ${a}, ${b}, ${rule.tier},
         ${rule.summary}, ${rule.advice}, ${rule.citation})
      ON CONFLICT (ingredient_a, ingredient_b) DO UPDATE SET
        tier = EXCLUDED.tier,
        summary = EXCLUDED.summary,
        advice = EXCLUDED.advice,
        citation = EXCLUDED.citation
    `;
  }

  console.log(
    `Seeded ${INGREDIENTS.length} ingredients and ${INTERACTIONS.length} interaction rules.`
  );
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

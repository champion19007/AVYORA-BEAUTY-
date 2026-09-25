import type { Product } from '@/data/mock-data';

/**
 * Product search.
 *
 * The interface is the part meant to last. The implementation below indexes
 * the catalogue in memory, which is the right engine for 27 products whose
 * definitions ship with the code: no network, no database, identical results
 * on the server and in the browser, and a few microseconds per query.
 *
 * When that stops being true — the catalogue moves into Postgres, or grows
 * into the thousands — a `PostgresCatalogSearch` (tsvector + pg_trgm) or an
 * OpenSearch client implements the same `CatalogSearch`, reading through the
 * replica with 'eventual' consistency, and nothing that calls `search` changes.
 * Neither exists yet.
 *
 * What the previous search did: lower-case the whole query and look for it as
 * one substring. "vitamin c serum" found nothing unless those words appeared
 * in exactly that order, "sunscreen" missed the product named "Sun Stick",
 * and results came back in catalogue order however weak the match.
 */

export type SearchHit = { productId: string; score: number };

export interface CatalogSearch {
  search(query: string, limit?: number): SearchHit[];
}

/** How much a match in each field counts. The name says most about a product. */
const WEIGHTS = {
  name: 6,
  ingredients: 4,
  concerns: 3,
  category: 2,
  tagline: 2,
  description: 1,
} as const;

type Field = keyof typeof WEIGHTS;

/**
 * Words people type for things the catalogue names differently. Expansion,
 * not replacement: "spf" also searches "sun" and "sunscreen".
 */
const SYNONYMS: Record<string, string[]> = {
  spf: ['sun', 'sunscreen'],
  sunscreen: ['sun', 'spf'],
  sunblock: ['sun', 'sunscreen'],
  vit: ['vitamin'],
  moisturiser: ['moisturizer', 'cream'],
  moisturizer: ['cream'],
  pimple: ['acne'],
  pimples: ['acne'],
  breakout: ['acne'],
  wrinkle: ['aging', 'retinol', 'peptide'],
  wrinkles: ['aging', 'retinol', 'peptide'],
  'anti-aging': ['aging'],
  dark: ['eye'],
  pores: ['texture', 'sebum', 'niacinamide'],
  oily: ['sebum'],
  dry: ['dryness', 'hydration'],
  hydrating: ['hydration', 'dryness'],
  exfoliant: ['exfoliator', 'exfoliating'],
  facewash: ['face', 'wash', 'cleanser'],
};

/** Lower-case words, accents and punctuation removed, plurals folded. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

type Indexed = { productId: string; order: number; fields: Record<Field, string[]> };

export class InMemoryCatalogSearch implements CatalogSearch {
  private readonly docs: Indexed[];

  constructor(products: readonly Product[], concernNames: Record<string, string> = {}) {
    this.docs = products.map((p, order) => ({
      productId: p.id,
      order,
      fields: {
        name: tokenize(p.name),
        ingredients: tokenize(p.ingredients.join(' ')),
        concerns: tokenize(
          p.concerns.map((c) => `${c} ${concernNames[c] ?? ''}`).join(' ')
        ),
        category: tokenize(p.category),
        tagline: tokenize(p.tagline),
        description: tokenize(p.description),
      },
    }));
  }

  /**
   * Every query word (or one of its synonyms) must match somewhere, as a
   * whole word or a prefix of one. A whole-word match scores more than a
   * prefix match, and each field counts by its weight. Ties keep catalogue
   * order, so the same query always gives the same list.
   */
  search(query: string, limit = 50): SearchHit[] {
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    const hits: (SearchHit & { order: number })[] = [];

    for (const doc of this.docs) {
      let total = 0;
      let everyTermMatched = true;

      for (const term of terms) {
        const alternatives = [term, ...(SYNONYMS[term] ?? [])];
        let best = 0;
        for (const alt of alternatives) {
          // A synonym counts a little less than the word actually typed.
          const discount = alt === term ? 1 : 0.8;
          best = Math.max(best, this.scoreTerm(doc, alt) * discount);
        }
        if (best === 0) {
          everyTermMatched = false;
          break;
        }
        total += best;
      }

      if (everyTermMatched) hits.push({ productId: doc.productId, score: total, order: doc.order });
    }

    return hits
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, limit)
      .map(({ productId, score }) => ({ productId, score: Math.round(score * 100) / 100 }));
  }

  private scoreTerm(doc: Indexed, term: string): number {
    let best = 0;
    for (const field of Object.keys(WEIGHTS) as Field[]) {
      for (const word of doc.fields[field]) {
        const match = word === term ? 1 : term.length >= 2 && word.startsWith(term) ? 0.6 : 0;
        if (match) best = Math.max(best, match * WEIGHTS[field]);
      }
    }
    return best;
  }
}

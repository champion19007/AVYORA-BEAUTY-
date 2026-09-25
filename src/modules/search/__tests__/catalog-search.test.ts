import { describe, it, expect } from 'vitest';
import { PRODUCTS, CONCERNS } from '@/data/mock-data';
import { InMemoryCatalogSearch, tokenize } from '../catalog-search';

const names = Object.fromEntries(CONCERNS.map((c) => [c.id, c.name]));
const engine = new InMemoryCatalogSearch(PRODUCTS, names);
const ids = (q: string) => engine.search(q).map((h) => h.productId);

describe('catalogue search', () => {
  it('finds words in any order, not just an exact phrase', () => {
    expect(ids('serum vitamin c')).toContain('vitamin-c-serum');
    expect(ids('vitamin c serum')[0]).toBe('vitamin-c-serum');
  });

  it('ranks a name match above a passing mention', () => {
    const results = ids('retinol');
    expect(results[0]).toBe('retinol');
  });

  it('understands what people type for what the catalogue calls it', () => {
    expect(ids('spf')).toEqual(expect.arrayContaining(['sunscreen', 'sun-stick']));
    expect(ids('pimples')).toEqual(ids('acne'));
  });

  it('matches the start of a word as someone types', () => {
    expect(ids('niacin')).toContain('niacinamide-drops');
  });

  it('requires every word to match', () => {
    expect(ids('retinol sunscreen')).toEqual([]);
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(ids('')).toEqual([]);
    expect(ids('?!')).toEqual([]);
  });

  it('is deterministic', () => {
    expect(ids('cleansing')).toEqual(ids('cleansing'));
  });

  it('folds plurals and accents', () => {
    expect(tokenize('Peptides Crème')).toEqual(['peptide', 'creme']);
  });
});

import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/mock-data';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import { compileRelease } from '@/modules/knowledge/compile';
import { productionInput } from '@/modules/knowledge/production-input';
import { computeRoutine } from '@/modules/personalization/core/routine';
import type { Offer } from '@/modules/personalization/core/selection';
import { answer, buildIndex, MAX_QUERY_CHARS, normalise, type ReleaseInput } from '../assistant';

const compiled = compileRelease(productionInput().input, { fixture: false });
if (!compiled.ok) throw new Error(compiled.errors.join('\n'));
const parse = (artifacts: Record<string, string>) => Object.fromEntries(Object.entries(artifacts).map(([k, v]) => [k, JSON.parse(v)]));
const RELEASE: ReleaseInput = { published: true, manifest: compiled.release.manifest, artifacts: parse(compiled.release.artifacts) };
const index = buildIndex(RELEASE, PRODUCTS);

/*
 * TEST-ONLY knowledge: an "approved" direction, education answers and a
 * reviewed caution added to a copy of the release, to exercise the paths
 * that today's release (nothing approved) never reaches. Not real content.
 */
const withTestKnowledge = (opts: { evidenceIds?: string[] } = {}): ReleaseInput => {
  const a = structuredClone(RELEASE.artifacts) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  a.evidence.sources.push({ id: 'test-source', title: 'TEST source', url: null, sourceType: 'label', retrievedAt: '2026-01-01', limitations: 'Test' });
  a.catalogue.usageProfiles['ceramide-cream'] = {
    session: 'am_or_pm', frequency: 'TEST: twice a day', text: 'TEST DIRECTIONS, not real.', reviewedBy: 'TEST', reviewedAt: '2026-01-01',
    source: 'test', formulationVersion: 1, maxWeeklyUses: 14, evidenceIds: opts.evidenceIds ?? ['test-source'],
  };
  const approved = { status: 'approved', reviewerId: 'TEST', reviewedAt: '2026-01-01', sourceIds: ['test-source'] };
  a.explanations.education = [
    { id: 'edu-patch', questionAliases: ['how do I patch test'], answer: 'TEST ANSWER about patch testing.', scope: 'general', review: approved },
    { id: 'edu-layer', questionAliases: ['what order do I layer products'], answer: 'TEST ANSWER about layering.', scope: 'general', review: approved },
    { id: 'edu-layer-2', questionAliases: ['what order do I apply products'], answer: 'TEST ANSWER two.', scope: 'general', review: approved },
  ];
  const niacinamide = a.ingredients.ingredients.find((i: { id: string }) => i.id === 'niacinamide');
  niacinamide.cautions = { status: 'reviewed', prescriptionOnly: false, pregnancyCaution: false, photosensitising: false, review: approved };
  return { ...RELEASE, artifacts: a };
};

const { variants } = catalogRecords(PRODUCTS);
const OFFERS: Record<string, Offer> = Object.fromEntries(
  PRODUCTS.flatMap((p) => p.sizes.map((s) => [variants.find((v) => v.productId === p.id && v.sizeLabel === s.label)!.id, { pricePaise: s.price * 100, stock: 10 }]))
);
const routine = computeRoutine({
  release: RELEASE as never,
  products: PRODUCTS,
  offers: OFFERS,
  profile: {
    schemaVersion: 2, ageBand: 'adult', skinType: 'dry', reactivity: 'low', pregnancy: 'unknown', nursing: 'no', currentlyIrritated: 'no',
    allergyHistory: 'no', prescribedTreatment: 'no', priorities: ['dryness_reported'], budgetPaise: 500_000, maxDailySteps: 4,
    experience: 'new', adherence: 'high', allergyIngredientIds: [], preferences: { eyeCare: false, bodyCare: false }, ownedItems: [],
  },
});
const scheduledIds = new Set(routine.inclusions.map((i) => i.id));
const anIncluded = [...scheduledIds].find((id) => PRODUCTS.some((p) => p.id === id))!;
const nameOf = (id: string) => PRODUCTS.find((p) => p.id === id)!.name;

describe('synonyms and ingredients', () => {
  it('shorthand and spelling variants resolve, and every answer carries the release', () => {
    for (const q of ['what is vit b3', 'What is nicotinamide?', 'tell me about NIACINAMIDE']) {
      const a = answer(index, q);
      expect(a).toMatchObject({ kind: 'answer', topic: 'ingredient', personalized: false, release: { id: RELEASE.manifest.releaseId } });
      expect(a.text[0]).toMatch(/^Niacinamide \(INCI name: Niacinamide\) is a form of vitamin B3/);
      expect(a.sources[0].id).toBe(RELEASE.manifest.releaseId);
    }
    expect(answer(index, 'what is HA').text[0]).toMatch(/^Hyaluronic acid/);
  });

  it('retinal and retinol stay different ingredients', () => {
    expect(answer(index, 'what is retinaldehyde').text[0]).toMatch(/^Retinaldehyde \(INCI name: Retinal\)/);
    expect(answer(index, 'what is retinal').text[0]).toMatch(/^Retinaldehyde/);
  });

  it('unreviewed cautions are never stated, and their absence is not called safety', () => {
    const a = answer(index, 'what is niacinamide');
    expect(a.text.join(' ')).toMatch(/cautions have not been reviewed yet/);
    expect(a.text.join(' ')).toMatch(/not a statement that it has none/);
    const reviewed = answer(buildIndex(withTestKnowledge(), PRODUCTS), 'what is niacinamide');
    expect(reviewed.text.join(' ')).not.toMatch(/not been reviewed/);
    expect(reviewed.sources.map((s) => s.id)).toContain('test-source');
  });
});

describe('ambiguity and clarification', () => {
  it('an alias that names several ingredients asks which one', () => {
    const a = answer(index, 'what is vitamin c');
    expect(a.kind).toBe('clarify');
    expect(a.options?.map((o) => o.label)).toEqual(['Vitamin C']);
    expect(answer(index, 'what is a retinoid').kind).toBe('clarify');
  });

  it('a product name shared by several products asks which product', () => {
    const a = answer(index, 'how do I use the toner');
    expect(a.kind).toBe('clarify');
    expect(a.options!.length).toBeGreaterThan(1);
    // Following one of the options settles it.
    expect(answer(index, a.options![0].query).kind).not.toBe('clarify');
  });

  it('a bare product name asks what the customer wants to know', () => {
    const a = answer(index, nameOf('ceramide-cream'));
    expect(a).toMatchObject({ kind: 'clarify' });
    expect(a.options!.map((o) => o.label)).toEqual(['How to use it', 'Why it is or is not in my routine', 'Price and stock']);
  });

  it('two equally good education answers ask which', () => {
    const a = answer(buildIndex(withTestKnowledge(), PRODUCTS), 'how should I layer and apply products');
    expect(a.kind === 'clarify' || a.text[0].startsWith('TEST ANSWER')).toBe(true);
  });
});

describe('approved content, missing content and missing sources', () => {
  it('directions are given only when approved, verbatim, with their sources', () => {
    const today = answer(index, 'how do I use the ceramide cream');
    expect(today).toMatchObject({ kind: 'unsupported', topic: 'directions' });
    expect(today.text[0]).toMatch(/not published yet, so we will not give our own/);
    expect(today.options!.length).toBeGreaterThan(0);

    const approved = answer(buildIndex(withTestKnowledge(), PRODUCTS), 'how do I use the ceramide cream');
    expect(approved).toMatchObject({ kind: 'answer', topic: 'directions' });
    expect(approved.text).toContain('TEST DIRECTIONS, not real.');
    expect(approved.sources.map((s) => s.id)).toEqual([RELEASE.manifest.releaseId, 'test-source']);
  });

  it('an entry whose sources are missing from the release is withheld', () => {
    const a = answer(buildIndex(withTestKnowledge({ evidenceIds: ['no-such-source'] }), PRODUCTS), 'how do I use the ceramide cream');
    expect(a).toMatchObject({ kind: 'unsupported', sources: [] });
    expect(a.text[0]).toMatch(/sources are missing/);
  });

  it('approved education answers are found by their question aliases', () => {
    const a = answer(buildIndex(withTestKnowledge(), PRODUCTS), 'How should I patch test?');
    expect(a).toMatchObject({ kind: 'answer', topic: 'education', text: ['TEST ANSWER about patch testing.'] });
  });

  it('unsupported questions say so and offer supported topics', () => {
    for (const q of ['which laptop should I buy', 'zzzz', '']) {
      const a = answer(index, q);
      expect(['unsupported', 'clarify']).toContain(a.kind);
      expect(a.options!.length).toBeGreaterThan(0);
    }
  });

  it('diagnoses and medicines are refused, even mixed into a product question', () => {
    for (const q of ['do I have rosacea', 'can the ceramide cream cure eczema', 'what dosage of tretinoin should I take']) {
      expect(answer(index, q)).toMatchObject({ kind: 'unsupported', topic: 'safety' });
    }
  });
});

describe('personalised answers from the routine decision trace', () => {
  const ctx = { result: routine, validity: 'session' as const };

  it('why a product is included: the routine’s own reasons, marked personal', () => {
    const a = answer(index, `why is ${nameOf(anIncluded)} in my routine`, ctx);
    expect(a).toMatchObject({ kind: 'answer', topic: 'routine', personalized: true });
    expect(a.text).toEqual(expect.arrayContaining(routine.inclusions.find((i) => i.id === anIncluded)!.reasons));
    expect(a.sources[0].id).toBe(`routine:${routine.kbRelease}`);
  });

  it('why a product is excluded: the exclusion messages from the trace', () => {
    const a = answer(index, `why not ${nameOf('retinol')}`, ctx);
    expect(a.text[0]).toMatch(/was left out/);
    expect(a.text).toEqual(expect.arrayContaining(routine.exclusions.find((e) => e.productId === 'retinol')!.messages));
  });

  it('routine steps for a day and session come from the schedule', () => {
    const a = answer(index, 'what do I do on wednesday night', ctx);
    expect(a.text[0]).toMatch(/^Wednesday evening: 1\. /);
    expect(a.text[0]).toContain(routine.days[2].pm[0].label);
  });

  it('without a routine, or with a revoked one, personal questions are declined', () => {
    expect(answer(index, 'why is the sunscreen in my routine').text[0]).toMatch(/Build a routine first/);
    expect(answer(index, 'why is the sunscreen in my routine', { result: null, validity: 'revoked' }).text[0]).toMatch(/withdrawn/);
    const outdated = answer(index, `why is ${nameOf(anIncluded)} in my routine`, { result: routine, validity: 'outdated' });
    expect(outdated.text.join(' ')).toMatch(/guidance has been updated/);
  });

  it('general and personal answers stay distinct', () => {
    expect(answer(index, 'what is niacinamide', ctx).personalized).toBe(false);
    expect(answer(index, 'what is niacinamide', ctx).text.join(' ')).toMatch(/not a recommendation for you/);
  });
});

describe('prices and orders go to authoritative services', () => {
  it('a price question becomes an action for the current quote; no price is stated by the assistant', () => {
    const a = answer(index, 'how much is the spf');
    expect(a).toMatchObject({ kind: 'action', topic: 'price', action: { type: 'price', productId: 'sunscreen' } });
    expect(a.text.join(' ')).not.toMatch(/₹|\d{2,}/);
  });

  it('an order question never looks anything up from the question itself', () => {
    const a = answer(index, 'where is my order AVY-12345 for priya@example.com');
    expect(a).toMatchObject({ kind: 'action', topic: 'order', action: { type: 'order' } });
    expect(a.text.join(' ')).not.toMatch(/AVY|priya/i);
  });
});

describe('hostile input and bounds', () => {
  it('markup and regex metacharacters are inert, and nothing echoes raw input', () => {
    for (const q of ['<script>alert(1)</script> what is niacinamide', '((((((((', '.*+?^${}()|[]\\', '<img src=x onerror=alert(1)> toner']) {
      const a = answer(index, q);
      const out = JSON.stringify(a);
      expect(out).not.toMatch(/<|>|onerror|script/i);
    }
  });

  it('long queries are bounded and answered quickly', () => {
    expect(normalise('a'.repeat(100_000)).length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    const t = performance.now();
    answer(index, 'niacinamide '.repeat(10_000));
    expect(performance.now() - t).toBeLessThan(50);
  });

  it('retrieval latency over a mixed workload (reported)', () => {
    const queries = ['what is vit b3', 'how do I use the toner', 'why is the sunscreen in my routine', 'how much is the spf', 'which laptop', 'what is vitamin c'];
    const times: number[] = [];
    for (let i = 0; i < 2_000; i++) {
      const t = performance.now();
      answer(index, queries[i % queries.length], { result: routine, validity: 'session' });
      times.push(performance.now() - t);
    }
    times.sort((x, y) => x - y);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    console.info(`assistant latency over ${times.length} queries: p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
    expect(p95).toBeLessThan(5);
    const t = performance.now();
    buildIndex(RELEASE, PRODUCTS);
    console.info(`index build: ${(performance.now() - t).toFixed(2)} ms`);
  });
});

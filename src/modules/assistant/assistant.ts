/**
 * The knowledge assistant: deterministic answers from one knowledge release,
 * with no language model, vector index or training.
 *
 * A question is normalised and bounded, rewritten through a small synonym
 * table, then matched lexically (inverse-document-frequency weighted) to
 * products, ingredient names and approved education answers. Intent comes
 * from fixed cue words. Every answer is assembled from approved records or
 * the customer's own routine snapshot, and carries its sources and the
 * release id. When the release has nothing approved, the answer says so and
 * offers supported topics; it never fills the gap.
 *
 * Pure and browser-compatible: questions are answered on the customer's own
 * device, so neither the question nor their routine is sent anywhere.
 * Prices and orders are returned as actions for the page to resolve through
 * the existing authoritative services.
 */
import type { Product } from '@/data/mock-data';
import type { ProductDirections } from '@/data/product-directions';
import type { EvidenceSource } from '@/modules/ingredients/formulations';
import type { EducationAnswer } from '@/modules/knowledge/records';
import type { RoutineSnapshot } from '@/modules/personalization/core/routine';

export const MAX_QUERY_CHARS = 200;
const MAX_TOKENS = 24;
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export type Topic = 'ingredient' | 'directions' | 'routine' | 'price' | 'order' | 'education' | 'safety' | 'help';
export type Source = { id: string; title: string; url: string | null };
export type Option = { label: string; query: string };
export type Answer = {
  kind: 'answer' | 'clarify' | 'unsupported' | 'action';
  topic: Topic;
  /** True when built from the customer's own routine; false for general information. */
  personalized: boolean;
  /** Plain-text paragraphs. Rendered as text, never as HTML. */
  text: string[];
  sources: Source[];
  release: { id: string; published: boolean };
  options?: Option[];
  action?: { type: 'price'; productId: string } | { type: 'order' };
};

type IngredientEntry = {
  id: string;
  inci: string;
  common: string;
  aliases: string[];
  class: string;
  cautions: { status: 'reviewed'; prescriptionOnly: boolean; pregnancyCaution: boolean; photosensitising: boolean; review: { sourceIds?: string[] } } | { status: 'unreviewed' };
};

export type ReleaseInput = {
  published: boolean;
  manifest: { releaseId: string };
  artifacts: Record<string, unknown>;
};

export type RoutineContext = {
  result: RoutineSnapshot | null;
  /** 'session' for an unsaved routine on screen. */
  validity: 'session' | 'current' | 'outdated' | 'revoked';
};

/* ------------------------------------------------------------ text -- */

/** Small, reviewed synonym table: spelling variants and shorthand, never meaning changes (retinol ≠ retinal). */
const SYNONYMS: [RegExp, string][] = [
  [/\bvit\.? ?c\b/g, 'vitamin c'],
  [/\bvit\.? ?a\b/g, 'vitamin a'],
  [/\bvit\.? ?b3\b/g, 'vitamin b3'],
  [/\bha\b/g, 'hyaluronic acid'],
  [/\bspf\b|\bsun ?cream\b|\bsun ?block\b/g, 'sunscreen'],
  [/\bmoisturizer\b/g, 'moisturiser'],
  [/\bface ?wash\b/g, 'cleanser'],
  [/\bnight\b|\bpm\b|\bbedtime\b/g, 'evening'],
  [/\bam\b/g, 'morning'],
  [/\bmrp\b|\bcost\b|\bcosts\b|\bpriced\b|\brs\b|₹/g, ' price '],
  [/\bparcel\b|\bshipment\b|\bdelivery\b|\bdelivered\b|\bshipped\b/g, 'order'],
];
const STOP = new Set('a an the is are do does i my me for of to in on it and or with what how why when which can should this that you your be use using about tell there'.split(' '));

/** Lowercased, NFKC, bounded, synonyms applied; punctuation collapsed. */
export function normalise(query: string): string {
  let q = query.normalize('NFKC').slice(0, MAX_QUERY_CHARS).toLowerCase();
  q = q.replace(/[^a-z0-9₹%\s.-]+/g, ' ');
  for (const [re, to] of SYNONYMS) q = q.replace(re, to);
  return q.replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
}
const tokens = (text: string) => text.split(' ').filter((t) => t && !STOP.has(t)).slice(0, MAX_TOKENS);
const has = (q: string, ...cues: string[]) => cues.some((c) => new RegExp(`\\b${c}\\b`).test(q));

/* ----------------------------------------------------------- index -- */

export type KnowledgeIndex = ReturnType<typeof buildIndex>;

export function buildIndex(release: ReleaseInput, products: readonly Product[]) {
  const a = release.artifacts as {
    catalogue: { products: { id: string }[]; usageProfiles: Record<string, ProductDirections> };
    ingredients: { ingredients: IngredientEntry[]; aliases: Record<string, string>; ambiguousAliases: Record<string, string[]> };
    explanations: { education: EducationAnswer[] };
    evidence: { sources: EvidenceSource[] };
  };
  const inRelease = new Set(a.catalogue.products.map((p) => p.id));
  const catalogue = products.filter((p) => inRelease.has(p.id));

  // Product name tokens weighted by rarity, so "toner" (two products) is weak and "bifida" strong.
  const productTokens = new Map(catalogue.map((p) => [p.id, new Set(tokens(normalise(p.name)).filter((t) => !/^\d/.test(t)))]));
  const df = new Map<string, number>();
  for (const set of productTokens.values()) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log((catalogue.length + 1) / (df.get(t) ?? catalogue.length + 1));

  // The release's alias map: a declared ambiguity ("vitamin c") always wins over a dictionary name.
  const ingredientNames = new Map(Object.entries(a.ingredients.aliases ?? {}).map(([k, id]) => [normalise(k), id]));
  const ambiguous = new Map(Object.entries(a.ingredients.ambiguousAliases ?? {}).map(([k, v]) => [normalise(k), v]));
  const education = (a.explanations.education ?? []).filter((e) => e.review.status === 'approved');

  return {
    release: { id: release.manifest.releaseId, published: release.published },
    products: new Map(catalogue.map((p) => [p.id, p])),
    productTokens,
    idf,
    ingredients: new Map(a.ingredients.ingredients.map((i) => [i.id, i])),
    ingredientNames,
    ambiguous,
    directions: a.catalogue.usageProfiles ?? {},
    education,
    evidence: new Map(a.evidence.sources.map((s) => [s.id, s])),
  };
}

/* ---------------------------------------------------------- matching -- */

function matchProducts(index: KnowledgeIndex, q: string): string[] {
  const qt = new Set(tokens(q));
  let best = 0;
  let ids: string[] = [];
  for (const [id, set] of index.productTokens) {
    let score = 0;
    for (const t of set) if (qt.has(t)) score += index.idf(t);
    if (score < 0.5) continue;
    if (score > best + 1e-9) {
      best = score;
      ids = [id];
    } else if (Math.abs(score - best) <= 1e-9) ids.push(id);
  }
  return ids.sort();
}

/** Longest ingredient name or ambiguous alias appearing in the question. */
function matchIngredient(index: KnowledgeIndex, q: string): { id: string } | { ambiguous: string; candidates: string[] } | null {
  let found: { name: string; id?: string; candidates?: string[] } | null = null;
  const consider = (name: string, hit: { id?: string; candidates?: string[] }) => {
    if (new RegExp(`(^| )${name.replace(/[-]/g, '\\-')}( |$)`).test(q) && (!found || name.length > found.name.length)) found = { name, ...hit };
  };
  for (const [name, id] of index.ingredientNames) consider(name, { id });
  for (const [name, candidates] of index.ambiguous) consider(name, { candidates });
  if (!found) return null;
  const f = found as { name: string; id?: string; candidates?: string[] };
  return f.id ? { id: f.id } : { ambiguous: f.name, candidates: f.candidates! };
}

function matchEducation(index: KnowledgeIndex, q: string): EducationAnswer[] {
  const qt = new Set(tokens(q));
  const scored = index.education
    .map((e) => {
      const best = Math.max(0, ...e.questionAliases.map((alias) => {
        const at = tokens(normalise(alias));
        return at.length ? at.filter((t) => qt.has(t)).length / at.length : 0;
      }));
      return { e, best };
    })
    .filter((x) => x.best >= 0.6)
    .sort((x, y) => y.best - x.best || x.e.id.localeCompare(y.e.id));
  return scored.filter((x) => x.best === scored[0]?.best).map((x) => x.e);
}

/* ----------------------------------------------------------- answers -- */

const SUPPORTED: Option[] = [
  { label: 'What is niacinamide?', query: 'What is niacinamide?' },
  { label: 'How do I use a product?', query: 'How do I use the ceramide cream?' },
  { label: 'Why is a product in my routine?', query: 'Why is the sunscreen in my routine?' },
  { label: 'Price and stock', query: 'How much is the sunscreen?' },
  { label: 'Track an order', query: 'Where is my order?' },
];

const CLASS_LABEL: Record<string, string> = {
  retinoid: 'a retinoid',
  peroxide: 'a peroxide',
  vitamin_c: 'a form of vitamin C',
  niacinamide: 'a form of vitamin B3',
  aha: 'an alpha hydroxy acid (AHA)',
  bha: 'a beta hydroxy acid (BHA)',
  humectant: 'a humectant',
  lipid: 'a skin lipid',
  depigmenting: 'a depigmenting agent',
  immunomodulator: 'an immunomodulator',
  uv_filter: 'a UV filter',
};

export function answer(index: KnowledgeIndex, query: string, routine: RoutineContext | null = null): Answer {
  const base = { release: index.release, sources: [] as Source[], personalized: false };
  const q = normalise(query);
  const releaseSource: Source = { id: index.release.id, title: `Avyora knowledge release ${index.release.id}${index.release.published ? '' : ' (preview, not yet published)'}`, url: null };

  if (!q) return { ...base, kind: 'clarify', topic: 'help', text: ['What would you like to know? You can ask about an ingredient, how to use a product, your routine, prices or an order.'], options: SUPPORTED };

  // Diagnoses and medical treatment are out of scope, whatever else is asked.
  if (has(q, 'diagnose', 'diagnosis', 'do i have', 'rosacea', 'eczema', 'psoriasis', 'dermatitis', 'infection', 'infected', 'cure', 'prescribe', 'prescription', 'dosage', 'medicine', 'medication', 'antibiotic', 'steroid')) {
    return {
      ...base,
      kind: 'unsupported',
      topic: 'safety',
      text: [
        'We cannot diagnose skin conditions or advise on medicines or prescribed treatments.',
        'For a persistent, painful or spreading skin problem, please see a dermatologist or doctor.',
      ],
      options: SUPPORTED.slice(0, 3),
    };
  }

  if (has(q, 'order', 'track', 'tracking', 'refund', 'return')) {
    return {
      ...base,
      kind: 'action',
      topic: 'order',
      action: { type: 'order' },
      text: ['To check an order, enter its order number and the email you ordered with. Signed in? Your orders are also in your account.'],
    };
  }

  const ingredient = matchIngredient(index, q);
  const products = matchProducts(index, q);
  const wantsWhy = has(q, 'why', 'included', 'recommended', 'chosen', 'picked');
  const wantsWhyNot = has(q, 'why not', 'left out', 'excluded', 'not included', 'missing', 'no longer');
  const wantsDirections = has(q, 'how', 'directions', 'apply', 'often', 'times', 'frequency', 'use');
  const wantsPrice = has(q, 'price', 'stock', 'available', 'availability', 'buy', 'how much');
  const wantsSchedule = has(q, 'step', 'steps', 'morning', 'evening', 'today', 'routine', ...DAYS);
  const wantsWhat = has(q, 'what', 'explain', 'tell', 'about', 'means', 'mean');
  // A clarification option restates the intent with the product's name; it never echoes the question.
  const followUp = (name: string) =>
    wantsPrice ? `How much is ${name}?` : wantsDirections ? `How do I use ${name}?` : wantsWhy || wantsWhyNot ? `Why is ${name} in my routine?` : name;

  if (ingredient && 'ambiguous' in ingredient && (!products.length || wantsWhat)) {
    const named = ingredient.candidates.filter((c) => index.ingredients.has(c));
    return {
      ...base,
      kind: 'clarify',
      topic: 'ingredient',
      text: [`"${ingredient.ambiguous}" can mean more than one ingredient. Which one do you mean?`],
      options: named.map((id) => ({ label: index.ingredients.get(id)!.common, query: `What is ${index.ingredients.get(id)!.common}?` })),
      sources: [releaseSource],
    };
  }

  // "What is X?" about an ingredient is answered as such, even if X also appears in product names.
  if (ingredient && 'id' in ingredient && wantsWhat && !wantsWhy && !wantsWhyNot && !wantsPrice && !wantsDirections) {
    return ingredientAnswer(index, ingredient.id, releaseSource);
  }

  if (products.length > 1) {
    return {
      ...base,
      kind: 'clarify',
      topic: 'help',
      text: ['Which product do you mean?'],
      options: products.slice(0, 6).map((id) => ({ label: index.products.get(id)!.name, query: followUp(index.products.get(id)!.name) })),
    };
  }
  const productId = products[0];

  if ((wantsWhy || wantsWhyNot || (wantsSchedule && !productId && !ingredient)) && !wantsPrice) {
    return personal(index, routine, productId, q, wantsWhyNot);
  }
  if (productId && wantsPrice) return { ...base, kind: 'action', topic: 'price', action: { type: 'price', productId }, text: [`Checking the current price and stock of ${index.products.get(productId)!.name}…`] };
  if (productId && wantsDirections) return directions(index, productId, releaseSource);
  if (ingredient && 'id' in ingredient && (wantsWhat || !productId)) return ingredientAnswer(index, ingredient.id, releaseSource);

  const edu = matchEducation(index, q);
  if (edu.length > 1) {
    return { ...base, kind: 'clarify', topic: 'education', text: ['Did you mean one of these?'], options: edu.slice(0, 4).map((e) => ({ label: e.questionAliases[0], query: e.questionAliases[0] })) };
  }
  if (edu.length === 1) {
    const sources = (edu[0].review.status === 'approved' ? edu[0].review.sourceIds : []).map((id) => index.evidence.get(id));
    if (sources.some((s) => !s)) return missingSources(index, 'education');
    return { ...base, kind: 'answer', topic: 'education', text: [edu[0].answer], sources: sources.map((s) => ({ id: s!.id, title: s!.title, url: s!.url })) };
  }

  if (productId) {
    const name = index.products.get(productId)!.name;
    return {
      ...base,
      kind: 'clarify',
      topic: 'help',
      text: [`What would you like to know about ${name}?`],
      options: [
        { label: 'How to use it', query: `How do I use ${name}?` },
        { label: 'Why it is or is not in my routine', query: `Why is ${name} in my routine?` },
        { label: 'Price and stock', query: `How much is ${name}?` },
      ],
    };
  }

  return {
    ...base,
    kind: 'unsupported',
    topic: 'help',
    text: ['We do not have approved information to answer that yet. These are the things we can help with:'],
    options: SUPPORTED,
  };
}

function ingredientAnswer(index: KnowledgeIndex, id: string, releaseSource: Source): Answer {
  const i = index.ingredients.get(id)!;
  const text = [
    `${i.common} (INCI name: ${i.inci}) is ${CLASS_LABEL[i.class] ?? 'an ingredient in our dictionary'}.${i.aliases.length ? ` It may also be listed as ${i.aliases.join(', ')}.` : ''}`,
  ];
  const sources: Source[] = [releaseSource];
  if (i.cautions.status === 'reviewed') {
    const notes = [
      i.cautions.prescriptionOnly && 'it is prescription-only',
      i.cautions.pregnancyCaution && 'it carries a pregnancy caution',
      i.cautions.photosensitising && 'it can increase sensitivity to the sun',
    ].filter(Boolean);
    if (notes.length) text.push(`Reviewed caution: ${notes.join('; ')}.`);
    for (const sid of i.cautions.review.sourceIds ?? []) {
      const s = index.evidence.get(sid);
      if (s) sources.push({ id: s.id, title: s.title, url: s.url });
    }
  } else {
    text.push('Its cautions have not been reviewed yet, so we do not state any here. This is not a statement that it has none.');
  }
  text.push('This is general information about the ingredient, not a recommendation for you.');
  return { kind: 'answer', topic: 'ingredient', personalized: false, text, sources, release: index.release };
}

function directions(index: KnowledgeIndex, productId: string, releaseSource: Source): Answer {
  const name = index.products.get(productId)!.name;
  const d = index.directions[productId];
  if (!d) {
    return {
      kind: 'unsupported',
      topic: 'directions',
      personalized: false,
      release: index.release,
      sources: [releaseSource],
      text: [`Our reviewed directions for ${name} are not published yet, so we will not give our own. Please follow the directions on the pack.`],
      options: SUPPORTED,
    };
  }
  const sources = d.evidenceIds.map((id) => index.evidence.get(id));
  if (sources.some((s) => !s)) return missingSources(index, 'directions');
  return {
    kind: 'answer',
    topic: 'directions',
    personalized: false,
    release: index.release,
    text: [`${name}: ${d.frequency}.`, d.text, `Session: ${d.session === 'am' ? 'morning' : d.session === 'pm' ? 'evening' : 'morning or evening'}.`],
    sources: [releaseSource, ...sources.map((s) => ({ id: s!.id, title: s!.title, url: s!.url }))],
  };
}

function missingSources(index: KnowledgeIndex, topic: Topic): Answer {
  return {
    kind: 'unsupported',
    topic,
    personalized: false,
    release: index.release,
    sources: [],
    text: ['We have an entry for this, but its sources are missing from the current knowledge release, so we will not show it.'],
    options: SUPPORTED,
  };
}

/** Answers grounded only in the customer's routine snapshot (its decision trace). */
function personal(index: KnowledgeIndex, ctx: RoutineContext | null, productId: string | undefined, q: string, whyNot: boolean): Answer {
  const base = { kind: 'answer' as const, topic: 'routine' as const, personalized: true, release: index.release, sources: [] as Source[] };
  if (!ctx?.result) {
    return {
      ...base,
      kind: 'unsupported',
      personalized: false,
      text: [ctx?.validity === 'revoked' ? 'Your saved routine was built on guidance that has since been withdrawn, so we cannot explain it. Recalculate it first.' : 'Build a routine first, then ask about it here.'],
      options: [{ label: 'Open the routine finder', query: 'routine finder' }],
    };
  }
  const r = ctx.result;
  const notes: string[] = [];
  if (ctx.validity === 'outdated') notes.push('Note: our guidance has been updated since this routine was saved; recalculate for a current answer.');
  if (r.kbRelease !== index.release.id) notes.push(`This routine was built on knowledge release ${r.kbRelease}.`);
  const routineSource: Source = { id: `routine:${r.kbRelease}`, title: `Your routine's decision record (engine ${r.engineVersion}, release ${r.kbRelease})`, url: null };

  if (!productId) {
    const day = DAYS.findIndex((d) => q.includes(d));
    const session: 'am' | 'pm' | null = q.includes('evening') ? 'pm' : q.includes('morning') ? 'am' : null;
    if (day >= 0 || session) {
      const days = day >= 0 ? [r.days[day]] : r.days.slice(0, 1);
      const text = days.flatMap((d) =>
        (session ? [session] : (['am', 'pm'] as const)).map((s: 'am' | 'pm') => `${DAYS[d.day - 1][0].toUpperCase()}${DAYS[d.day - 1].slice(1)} ${s === 'am' ? 'morning' : 'evening'}: ${d[s].map((x) => `${x.position}. ${x.label}`).join(', ') || 'nothing scheduled'}.`
        )
      );
      return { ...base, text: [...text, ...notes], sources: [routineSource] };
    }
    return { ...base, text: [...r.schedule, ...notes], sources: [routineSource] };
  }

  const name = index.products.get(productId)?.name ?? productId;
  const included = r.inclusions.find((i) => i.id === productId);
  const excluded = r.exclusions.find((e) => e.productId === productId);
  const when = r.schedule.filter((line) => line.startsWith(name));
  if (included && !whyNot) {
    return { ...base, text: [`${name} is in your routine.`, ...included.reasons, ...when, ...notes], sources: [routineSource] };
  }
  if (excluded) {
    return { ...base, text: [`${name} was left out of your routine:`, ...excluded.messages, ...notes], sources: [routineSource] };
  }
  if (included) return { ...base, text: [`${name} is in your routine, not left out.`, ...included.reasons, ...when, ...notes], sources: [routineSource] };
  return {
    ...base,
    text: [`${name} is not in your routine. It was not needed for any step, or another product ranked higher for your answers and budget.`, ...notes],
    sources: [routineSource],
  };
}

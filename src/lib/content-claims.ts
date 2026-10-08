/**
 * Publication checks for customer-facing copy.
 *
 * Three kinds of problem, each found by plain patterns:
 *  - `placeholder`: unfinished business content ([TO CONFIRM], a dummy phone).
 *  - `unsupported_offer`: an offer no order receives. There is no promotion
 *    engine, credit ledger, gift fulfilment or bundle pricing (audit #07), so
 *    advertising any of them misleads. Remove a rule when its feature ships.
 *  - `absolute_claim`: a categorical or medical-sounding promise nothing in
 *    the repository substantiates for the finished product (audit #09).
 *
 * Used by the CMS publish command, the storefront consistency test and
 * `npm run check:launch`. Pure: no database, safe anywhere.
 *
 * ponytail: a phrase list catches known wording, not every misleading
 * sentence. It is a floor under human review, not a replacement for it.
 */

export type ContentProblemKind = 'placeholder' | 'unsupported_offer' | 'absolute_claim';

export type ContentProblem = { kind: ContentProblemKind; match: string; why: string };

const RULES: { kind: ContentProblemKind; pattern: RegExp; why: string }[] = [
  { kind: 'placeholder', pattern: /\[TO CONFIRM\]/gi, why: 'business detail not yet confirmed' },
  { kind: 'placeholder', pattern: /(?:\+?91[\s-]?)?99999[\s-]?99999/g, why: 'dummy phone number' },
  { kind: 'placeholder', pattern: /lorem ipsum/gi, why: 'placeholder text' },

  { kind: 'unsupported_offer', pattern: /cash ?back/gi, why: 'no cashback is credited to any order' },
  { kind: 'unsupported_offer', pattern: /avyora (?:credit|circle)/gi, why: 'no credit ledger or membership exists' },
  { kind: 'unsupported_offer', pattern: /loyalty|reward points/gi, why: 'no loyalty programme exists' },
  { kind: 'unsupported_offer', pattern: /buy \d+,? get/gi, why: 'no multi-buy promotion is applied at checkout' },
  { kind: 'unsupported_offer', pattern: /\bfree (?:surprise )?gifts?\b|freebies?/gi, why: 'no gift is added to orders' },
  { kind: 'unsupported_offer', pattern: /bundle (?:discount|saving)|% off (?:every )?bundle|save [^.]{0,20}bundle/gi, why: 'no bundle pricing exists' },
  { kind: 'unsupported_offer', pattern: /up to \d+% off/gi, why: 'no basket discount is applied' },
  { kind: 'unsupported_offer', pattern: /complimentary delivery|free delivery,? always|free shipping,? always/gi, why: 'delivery is charged below the free-delivery threshold' },

  { kind: 'absolute_claim', pattern: /\bzero[- ](?:irritation|residue|white cast|grease|side[- ]effects)/gi, why: 'absolute claim' },
  { kind: 'absolute_claim', pattern: /\b(?:no|without) (?:irritation|stinging|redness)\b/gi, why: 'absolute tolerability claim' },
  { kind: 'absolute_claim', pattern: /\b100% (?:safe|natural|effective)\b/gi, why: 'absolute claim' },
  { kind: 'absolute_claim', pattern: /\bguaranteed (?:results?|to)\b/gi, why: 'guaranteed outcome' },
  { kind: 'absolute_claim', pattern: /\bclinically (?:proven|tested)\b|\bdermatologist[- ](?:approved|tested|recommended)\b/gi, why: 'clinical claim without evidence on file' },
  { kind: 'absolute_claim', pattern: /\bcures?\b|\bboosts? collagen\b|\btissue remodel/gi, why: 'medical or structural claim' },
  { kind: 'absolute_claim', pattern: /\bclinical (?:skincare|formulations?|batches|catalogue)\b|science-backed|maximum (?:efficacy|active stability)|formulated in-house/gi, why: 'unsubstantiated quality or origin claim' },
];

/** Every problem in `text`, in rule order. Empty means the text passes. */
export function findContentProblems(text: string): ContentProblem[] {
  const found: ContentProblem[] = [];
  for (const { kind, pattern, why } of RULES) {
    for (const m of text.matchAll(pattern)) found.push({ kind, match: m[0], why });
  }
  return found;
}

/**
 * Source text without comments, so a scan sees what renders rather than the
 * notes explaining why an old claim was removed. Line comments are stripped
 * only at the start of a line, which leaves `https://` URLs alone.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Symptoms that need a doctor, not skincare advice.
 *
 * Checked on the server before the model runs, so the urgent notice appears
 * whatever the model says. Deliberately broad: a false alarm costs one extra
 * sentence; a missed one could cost someone a delayed diagnosis. Wording is
 * a starting list for clinical review, not a diagnostic rule.
 */

const URGENT: { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /\b(swell\w*|swollen)\b.*\b(face|lips?|tongue|throat|eyes?|eyelids?)\b|\b(face|lips?|tongue|throat|eyes?|eyelids?)\b.*\b(swell\w*|swollen)\b/i,
    reason: 'swelling of the face, lips, eyes or throat',
  },
  {
    pattern: /\b(can'?t|cannot|hard to|difficulty|trouble)\s+(breathe|breathing|swallow\w*)\b/i,
    reason: 'trouble breathing or swallowing',
  },
  {
    pattern:
      /\b(mole|spot|lesion)\b.*\b(bleed\w*|grow\w*|chang\w*|itch\w*|irregular)\b|\b(bleed\w*|grow\w*|chang\w*)\b.*\bmole\b/i,
    reason: 'a mole or spot that is changing, growing or bleeding',
  },
  {
    pattern: /\b(pus|oozing|fever|hot to (the )?touch|red streaks?|spreading (rash|redness))\b/i,
    reason: 'signs of infection',
  },
  {
    pattern: /\b(blister\w*|peeling)\b.*\b(all over|whole body|mouth|eyes?)\b/i,
    reason: 'blistering or peeling over large areas or near the eyes or mouth',
  },
  {
    pattern: /\b(chemical )?burn\w*\b.*\b(acid|peel|bleach|retin\w*)\b|\b(acid|peel|bleach)\b.*\bburn\w*\b/i,
    reason: 'a chemical burn',
  },
  { pattern: /\b(eye|eyes|vision)\b.*\b(pain|blurr\w*|burn\w*|chemical)\b/i, reason: 'eye pain or vision changes' },
];

export type RedFlag = { reasons: string[] };

/** The urgent reasons a message mentions, or null. */
export function redFlags(text: string): RedFlag | null {
  const reasons = URGENT.filter((u) => u.pattern.test(text)).map((u) => u.reason);
  return reasons.length ? { reasons: [...new Set(reasons)] } : null;
}

export function urgentNotice(flag: RedFlag): string {
  return (
    `Please see a doctor or dermatologist soon about ${flag.reasons.join(', ')}. ` +
    'If it is severe or getting worse quickly, or you have trouble breathing, go to emergency care now. ' +
    'Skincare products are not the right fix for this.\n\n'
  );
}

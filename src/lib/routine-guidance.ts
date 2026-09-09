import type { Conditions } from '@/lib/environment';

/**
 * What today's conditions mean for a routine.
 *
 * Deterministic rules, not a learned ranker. Every one of these is correct on
 * the first day with no traffic and no reward signal, and a bandit would have
 * to *learn* them from conversions it does not have — and could unlearn them.
 * Where safety is involved, exploration is not a virtue.
 *
 * Kept apart from anything that ranks or sells: these rules remove and warn,
 * and a ranker may later order whatever survives them. Mixing the two would
 * make a hard constraint probabilistic.
 *
 * Every message is phrased about the customer's *area*, because that is what
 * the data describes. Regional outdoor readings say nothing about a person who
 * spends the day indoors.
 */

export type Guidance = {
  code: 'high_uv' | 'arid' | 'poor_air' | 'humid';
  /** Headline, one line, no jargon. */
  title: string;
  /** What to actually do today. */
  detail: string;
  /**
   * Severity. `caution` earns a visible notice; `note` is informational.
   * Nothing here rises to blocking — weather is a prior, not a diagnosis.
   */
  level: 'caution' | 'note';
};

/**
 * Thresholds.
 *
 * UV 8 is where the WHO scale reads "very high" and advises shade at midday.
 * Below 25% relative humidity, humectants can pull water from the skin faster
 * than the air replaces it. PM2.5 above 90 is several times the WHO daily
 * guideline and routinely reached across northern India in winter.
 */
export const UV_HIGH = 8;
export const HUMIDITY_ARID = 25;
export const HUMIDITY_HUMID = 75;
export const PM25_POOR = 90;

export function guidanceFor(conditions: Conditions | null): Guidance[] {
  if (!conditions) return [];

  const notes: Guidance[] = [];
  const { uvIndex, humidity, pm25, region } = conditions;

  if (uvIndex !== null && uvIndex >= UV_HIGH) {
    notes.push({
      code: 'high_uv',
      level: 'caution',
      title: `Very high UV in ${region.label} today (index ${uvIndex})`,
      detail:
        'Skip exfoliating acids and retinoids this morning — they raise sun ' +
        'sensitivity. Use them tonight instead, and cover exposed skin ' +
        'through the middle of the day.',
    });
  }

  if (humidity !== null && humidity <= HUMIDITY_ARID) {
    notes.push({
      code: 'arid',
      level: 'caution',
      title: `Very dry air in ${region.label} (${humidity}% humidity)`,
      detail:
        'A humectant like hyaluronic acid has little moisture to draw from ' +
        'air this dry, and can pull it from your skin instead. Seal it with ' +
        'a cream or an oil, or use a richer moisturiser on its own.',
    });
  }

  if (humidity !== null && humidity >= HUMIDITY_HUMID) {
    notes.push({
      code: 'humid',
      level: 'note',
      title: `Humid in ${region.label} (${humidity}%)`,
      detail:
        'Heavy occlusive creams sit on the skin in weather like this. A ' +
        'lighter gel or lotion usually feels better and works just as well.',
    });
  }

  if (pm25 !== null && pm25 >= PM25_POOR) {
    notes.push({
      code: 'poor_air',
      level: 'note',
      title: `Poor air quality in ${region.label} (PM2.5 ${pm25})`,
      detail:
        'Particulates settle on skin through the day. Cleanse properly in ' +
        'the evening rather than adding more actives — a compromised barrier ' +
        'copes worse with pollution, not better.',
    });
  }

  return notes;
}

/**
 * Should photosensitising actives be discouraged right now?
 *
 * Exposed as its own predicate so the interaction engine and any future
 * ranking can share one definition of "the sun is a problem today" rather than
 * each carrying its own copy of the threshold.
 */
export function photosensitivityRisk(conditions: Conditions | null): boolean {
  return conditions?.uvIndex !== null && (conditions?.uvIndex ?? 0) >= UV_HIGH;
}

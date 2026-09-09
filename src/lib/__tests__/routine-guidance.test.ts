import { describe, expect, it } from 'vitest';
import { DEFAULT_REGION } from '@/lib/regions';
import {
  HUMIDITY_ARID,
  UV_HIGH,
  guidanceFor,
  photosensitivityRisk,
} from '@/lib/routine-guidance';
import type { Conditions } from '@/lib/environment';

/**
 * Weather-driven routine guidance.
 *
 * These rules are deterministic on purpose — they are correct on day one with
 * no traffic, where a learned ranker would need conversions nobody has yet and
 * could unlearn them afterwards. The tests exist to keep them that way, and to
 * hold the line on the two failure modes that matter: firing when nothing is
 * unusual, which trains people to ignore the notice, and staying silent when
 * the sun is genuinely dangerous.
 */

const conditions = (over: Partial<Conditions>): Conditions => ({
  region: DEFAULT_REGION,
  uvIndex: 5,
  humidity: 50,
  pm25: 30,
  fetchedAt: new Date(),
  stale: false,
  ...over,
});

describe('routine guidance', () => {
  it('says nothing on an ordinary day', () => {
    expect(guidanceFor(conditions({}))).toEqual([]);
  });

  it('warns off photosensitising actives when UV is very high', () => {
    const codes = guidanceFor(conditions({ uvIndex: UV_HIGH })).map((g) => g.code);
    expect(codes).toContain('high_uv');
  });

  it('does not warn one point below the threshold', () => {
    // Boundary pinned in both directions: a rule that fires at 7 on a normal
    // Indian summer morning is a rule people learn to dismiss.
    const codes = guidanceFor(conditions({ uvIndex: UV_HIGH - 1 })).map((g) => g.code);
    expect(codes).not.toContain('high_uv');
  });

  it('warns about humectants in very dry air', () => {
    const found = guidanceFor(conditions({ humidity: HUMIDITY_ARID }));
    expect(found.map((g) => g.code)).toContain('arid');
    expect(found.find((g) => g.code === 'arid')?.detail).toMatch(/hyaluronic/i);
  });

  it('can raise more than one note at once', () => {
    // A Delhi winter afternoon: dry and filthy at the same time.
    const codes = guidanceFor(conditions({ humidity: 18, pm25: 180 })).map((g) => g.code);
    expect(codes).toEqual(expect.arrayContaining(['arid', 'poor_air']));
  });

  it('treats a missing reading as no opinion, not as zero', () => {
    /*
     * The important one. A null UV index must not read as 0 and quietly
     * suppress a warning, and a null humidity must not read as 0 and trigger
     * the driest-air-on-record notice.
     */
    expect(guidanceFor(conditions({ uvIndex: null, humidity: null, pm25: null }))).toEqual([]);
  });

  it('says nothing at all when there are no conditions', () => {
    expect(guidanceFor(null)).toEqual([]);
  });

  it('phrases every message about the area, never about the person', () => {
    // The data is a regional outdoor reading. Someone in an air-conditioned
    // office is not living in it, and the wording has to keep that honest.
    const all = [
      ...guidanceFor(conditions({ uvIndex: 11 })),
      ...guidanceFor(conditions({ humidity: 10 })),
      ...guidanceFor(conditions({ humidity: 90 })),
      ...guidanceFor(conditions({ pm25: 200 })),
    ];

    expect(all.length).toBeGreaterThan(0);
    for (const note of all) {
      expect(note.title).toContain(DEFAULT_REGION.label);
      expect(note.detail).not.toMatch(/your skin is|we detected|your exposure/i);
    }
  });

  it('shares one definition of a risky sun with the rest of the system', () => {
    expect(photosensitivityRisk(conditions({ uvIndex: UV_HIGH }))).toBe(true);
    expect(photosensitivityRisk(conditions({ uvIndex: UV_HIGH - 1 }))).toBe(false);
    expect(photosensitivityRisk(conditions({ uvIndex: null }))).toBe(false);
    expect(photosensitivityRisk(null)).toBe(false);
  });
});

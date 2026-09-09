import { describe, expect, it } from 'vitest';
import { DEFAULT_REGION, allRegions, regionForPincode } from '@/lib/regions';

/**
 * PIN code to climate region.
 *
 * Two things need pinning. First, that real cities land where they should —
 * this table is hand-written and a transposed digit is invisible until someone
 * in Chennai is told the air is dry. Second, that it never throws or returns
 * nothing: this feeds a decorative banner, and a decorative banner must not be
 * able to break a checkout page.
 */

describe('region lookup', () => {
  it('places real cities in the right region', () => {
    const cases: [string, string][] = [
      ['110001', 'IN-DL'], // New Delhi
      ['400059', 'IN-MH'], // Mumbai, Andheri East
      ['560001', 'IN-KA'], // Bengaluru
      ['600001', 'IN-TN'], // Chennai
      ['700001', 'IN-WB'], // Kolkata
      ['380001', 'IN-GJ'], // Ahmedabad
      ['302001', 'IN-RJ'], // Jaipur
      ['682001', 'IN-KL'], // Kochi
      ['500001', 'IN-TG'], // Hyderabad
    ];

    for (const [pin, expected] of cases) {
      expect(regionForPincode(pin), `pincode ${pin}`).toMatchObject({ key: expected });
    }
  });

  it('separates Uttarakhand from Uttar Pradesh', () => {
    /*
     * These share the 24x and 26x prefixes, and an earlier version of the
     * table had the second assignment silently overwrite the first — sending
     * every UP customer the weather for the hills. The three-digit override
     * exists for exactly this, so both directions are pinned.
     */
    expect(regionForPincode('248001')).toMatchObject({ key: 'IN-UK' }); // Dehradun
    expect(regionForPincode('263001')).toMatchObject({ key: 'IN-UK' }); // Nainital
    expect(regionForPincode('226001')).toMatchObject({ key: 'IN-UP' }); // Lucknow
    expect(regionForPincode('208001')).toMatchObject({ key: 'IN-UP' }); // Kanpur
    expect(regionForPincode('282001')).toMatchObject({ key: 'IN-UP' }); // Agra
  });

  it('falls back rather than failing on anything unusable', () => {
    for (const input of ['', '1', 'abcdef', null, undefined, '999999']) {
      expect(regionForPincode(input)).toMatchObject({ key: expect.any(String) });
    }
    expect(regionForPincode('999999')).toEqual(DEFAULT_REGION);
  });

  it('tolerates spaces and punctuation in a typed PIN code', () => {
    expect(regionForPincode('400 059')).toMatchObject({ key: 'IN-MH' });
    expect(regionForPincode('400-059')).toMatchObject({ key: 'IN-MH' });
  });

  it('gives every region a usable coordinate', () => {
    // A zero or a transposed pair here would silently fetch the weather for
    // the Gulf of Guinea, and the guidance would look plausible.
    for (const region of allRegions()) {
      expect(region.latitude, region.key).toBeGreaterThan(6);
      expect(region.latitude, region.key).toBeLessThan(37);
      expect(region.longitude, region.key).toBeGreaterThan(68);
      expect(region.longitude, region.key).toBeLessThan(98);
    }
  });

  it('keeps region keys unique per label', () => {
    const regions = allRegions();
    const keys = new Set(regions.map((r) => r.key));
    expect(keys.size).toBe(regions.length);
  });
});

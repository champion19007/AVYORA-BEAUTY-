/**
 * PIN code to a coarse climate region.
 *
 * The customer already gives a PIN code at checkout, so this needs no browser
 * geolocation, no permission prompt, and no extra data collection — it reads
 * something already on file.
 *
 * The mapping is deliberately coarse. India's postal circles follow states,
 * and states are a reasonable proxy for the two things that matter here: how
 * hard the sun is and how dry the air is. Finer resolution would be false
 * precision — the weather provider works from a grid several kilometres wide,
 * and a serum does not care which suburb you are in.
 *
 * Coordinates are a representative point per region, usually its largest city.
 * They are the point the forecast is fetched for, not a claim about where the
 * customer lives.
 *
 * No database, no network, no imports. This runs anywhere, including in tests
 * and at the edge.
 */

export type Region = {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Keyed by the first two digits of the PIN code.
 *
 * A two-digit prefix identifies the postal circle, which is close enough to a
 * state to be useful. Prefixes that share a climate share a region: Delhi and
 * its neighbouring plains behave the same way in January.
 */
const BY_PREFIX: Record<string, Region> = {};

function assign(prefixes: string[], region: Region) {
  for (const prefix of prefixes) BY_PREFIX[prefix] = region;
}

assign(['11'], { key: 'IN-DL', label: 'Delhi', latitude: 28.61, longitude: 77.21 });
assign(['12', '13'], { key: 'IN-HR', label: 'Haryana', latitude: 29.06, longitude: 76.86 });
assign(['14', '15', '16'], { key: 'IN-PB', label: 'Punjab', latitude: 30.9, longitude: 75.85 });
assign(['17'], { key: 'IN-HP', label: 'Himachal Pradesh', latitude: 31.1, longitude: 77.17 });
assign(['18', '19'], { key: 'IN-JK', label: 'Jammu & Kashmir', latitude: 33.78, longitude: 74.86 });
assign(['20', '21', '22', '23', '24', '25', '26', '27', '28'], {
  key: 'IN-UP', label: 'Uttar Pradesh', latitude: 26.85, longitude: 80.95,
});
assign(['30', '31', '32', '33', '34'], {
  key: 'IN-RJ', label: 'Rajasthan', latitude: 26.91, longitude: 75.79,
});
assign(['36', '37', '38', '39'], { key: 'IN-GJ', label: 'Gujarat', latitude: 23.02, longitude: 72.57 });
assign(['40', '41', '42', '43', '44'], {
  key: 'IN-MH', label: 'Maharashtra', latitude: 19.08, longitude: 72.88,
});
assign(['45', '46', '47', '48'], {
  key: 'IN-MP', label: 'Madhya Pradesh', latitude: 23.26, longitude: 77.41,
});
assign(['49'], { key: 'IN-CG', label: 'Chhattisgarh', latitude: 21.25, longitude: 81.63 });
assign(['50', '51', '52', '53'], { key: 'IN-TG', label: 'Telangana & Andhra', latitude: 17.39, longitude: 78.49 });
assign(['56', '57', '58', '59'], { key: 'IN-KA', label: 'Karnataka', latitude: 12.97, longitude: 77.59 });
assign(['60', '61', '62', '63', '64'], {
  key: 'IN-TN', label: 'Tamil Nadu', latitude: 13.08, longitude: 80.27,
});
assign(['67', '68', '69'], { key: 'IN-KL', label: 'Kerala', latitude: 9.93, longitude: 76.27 });
assign(['70', '71', '72', '73', '74'], {
  key: 'IN-WB', label: 'West Bengal', latitude: 22.57, longitude: 88.36,
});
assign(['75', '76', '77'], { key: 'IN-OD', label: 'Odisha', latitude: 20.3, longitude: 85.82 });
assign(['78'], { key: 'IN-AS', label: 'Assam', latitude: 26.14, longitude: 91.74 });
assign(['79'], { key: 'IN-NE', label: 'North East', latitude: 25.57, longitude: 91.88 });
assign(['80', '81', '82', '83', '84', '85'], {
  key: 'IN-BR', label: 'Bihar & Jharkhand', latitude: 25.59, longitude: 85.14,
});

/**
 * Three-digit overrides, checked before the two-digit table.
 *
 * Uttarakhand shares the 24x and 26x prefixes with Uttar Pradesh, and the two
 * are not interchangeable here: Dehradun in the hills and Lucknow on the
 * plains differ in exactly the variables this engine reads. Where a
 * two-digit prefix spans a real climate boundary, the finer key wins.
 */
const BY_THREE: Record<string, Region> = {};

{
  const uttarakhand: Region = {
    key: 'IN-UK', label: 'Uttarakhand', latitude: 30.32, longitude: 78.03,
  };
  for (const prefix of ['246', '248', '249', '263']) BY_THREE[prefix] = uttarakhand;
}

/**
 * Where an order is going, as far as the climate is concerned.
 *
 * Falls back to a national centre rather than returning null. A customer in an
 * unmapped prefix should still get sensible guidance — silence would be a
 * worse answer than an approximate one, and the guidance is phrased as
 * regional in any case.
 */
export const DEFAULT_REGION: Region = {
  key: 'IN',
  label: 'India',
  latitude: 22.35,
  longitude: 78.67,
};

export function regionForPincode(postalCode: string | null | undefined): Region {
  const digits = (postalCode ?? '').replace(/\D/g, '');
  if (digits.length < 2) return DEFAULT_REGION;

  // Most specific first: a three-digit override exists only where a two-digit
  // prefix would put two different climates in one bucket.
  return BY_THREE[digits.slice(0, 3)] ?? BY_PREFIX[digits.slice(0, 2)] ?? DEFAULT_REGION;
}

/** Every distinct region, for warming the cache or listing coverage. */
export function allRegions(): Region[] {
  const seen = new Map<string, Region>();
  for (const region of [...Object.values(BY_PREFIX), ...Object.values(BY_THREE)]) {
    seen.set(region.key, region);
  }
  seen.set(DEFAULT_REGION.key, DEFAULT_REGION);
  return [...seen.values()];
}

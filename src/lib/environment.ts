import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { environmentalCache } from '@/db/schema';
import { regionForPincode, type Region } from '@/lib/regions';
import { reportError } from '@/lib/observability';

/**
 * Current outdoor conditions for a customer's region.
 *
 * Lazily refreshed: the first request after the cached row goes stale pays for
 * the fetch, everyone else reads the row. No cron, because Vercel's free plan
 * runs cron once a day and both of its slots are already taken; no Redis,
 * because this is roughly twenty-five rows and a round-trip to a separate
 * cache service would be slower than the database this process is already
 * connected to.
 *
 * Provider is Open-Meteo — free, no API key, commercial use permitted. Two
 * endpoints: forecast for UV and humidity, air-quality for PM2.5.
 *
 * These are outdoor readings over a wide area. They describe the customer's
 * region, never the customer — someone in an air-conditioned office is not
 * experiencing Delhi's humidity, and every message built on this has to say
 * "in your area" rather than "your skin".
 */

export type Conditions = {
  region: Region;
  uvIndex: number | null;
  humidity: number | null;
  pm25: number | null;
  fetchedAt: Date;
  /** True when the values are older than the refresh window and could not be renewed. */
  stale: boolean;
};

/** How long a reading is considered current. */
export const REFRESH_AFTER_MS = 60 * 60 * 1000;

/**
 * Budget for the provider call.
 *
 * Short deliberately. This runs while a page is being rendered, and stale
 * guidance is enormously better than a page that will not load: on timeout the
 * cached row is returned as-is, and if there is no row the caller gets null
 * and shows nothing.
 */
const FETCH_TIMEOUT_MS = 2_500;

type Reading = { uvIndex: number | null; humidity: number | null; pm25: number | null };

/** Fetches one region's conditions from Open-Meteo. */
async function fetchConditions(region: Region): Promise<Reading | null> {
  const { latitude: lat, longitude: lon } = region;

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=uv_index_max&current=relative_humidity_2m&timezone=Asia%2FKolkata&forecast_days=1`;

  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=pm2_5&timezone=Asia%2FKolkata`;

  try {
    /*
     * Both providers in parallel, and a failure of either is survivable.
     * Air quality is the more fragile of the two, and losing PM2.5 should not
     * cost the UV reading that the sun-protection advice depends on.
     */
    const [weather, air] = await Promise.allSettled([
      fetch(weatherUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(airUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);

    const w = weather.status === 'fulfilled' ? weather.value : null;
    const a = air.status === 'fulfilled' ? air.value : null;

    if (!w && !a) return null;

    return {
      uvIndex: round(w?.daily?.uv_index_max?.[0]),
      humidity: round(w?.current?.relative_humidity_2m),
      pm25: round(a?.current?.pm2_5),
    };
  } catch (err) {
    reportError(err, { scope: 'environment.fetch', correlationId: region.key });
    return null;
  }
}

function round(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Conditions for a PIN code, refreshing the cache if it has gone stale.
 *
 * Returns null only when there is nothing to show at all — no database, or a
 * first-ever lookup for a region while the provider is unreachable. Callers
 * treat null as "say nothing", never as an error worth surfacing: weather
 * advice is a nicety, and a customer must never see a page fail because a
 * forecast did not arrive.
 */
export async function conditionsForPincode(
  postalCode: string | null | undefined
): Promise<Conditions | null> {
  if (!isDatabaseConfigured()) return null;

  const region = regionForPincode(postalCode);

  /*
   * Survives its own table not existing.
   *
   * Code reaches production before a migration does — that is the normal
   * order of a deploy, not a mistake — and for the minutes in between this
   * query fails with "relation does not exist". Unguarded, that exception
   * propagates out of a server component and takes the whole account page
   * down, because a decorative weather panel could not find its cache.
   *
   * Nothing here is important enough to fail a page over. Any error means the
   * same thing as no data: say nothing.
   */
  const [cached] = await db
    .select()
    .from(environmentalCache)
    .where(eq(environmentalCache.region, region.key))
    .limit(1)
    .catch((err) => {
      reportError(err, { scope: 'environment.read', correlationId: region.key });
      return [];
    });

  const age = cached ? Date.now() - cached.fetchedAt.getTime() : Infinity;
  if (cached && age < REFRESH_AFTER_MS) {
    return {
      region,
      uvIndex: cached.uvIndex,
      humidity: cached.humidity,
      pm25: cached.pm25,
      fetchedAt: cached.fetchedAt,
      stale: false,
    };
  }

  const fresh = await fetchConditions(region);

  if (!fresh) {
    // Provider unreachable. Yesterday's reading beats no reading; if there is
    // not even one, the caller shows nothing at all.
    if (!cached) return null;
    return {
      region,
      uvIndex: cached.uvIndex,
      humidity: cached.humidity,
      pm25: cached.pm25,
      fetchedAt: cached.fetchedAt,
      stale: true,
    };
  }

  const fetchedAt = new Date();

  await db
    .insert(environmentalCache)
    .values({ region: region.key, ...fresh, fetchedAt })
    .onConflictDoUpdate({
      target: environmentalCache.region,
      set: { ...fresh, fetchedAt },
    })
    .catch((err) => {
      // A cache write failing must not cost the reading we already have.
      reportError(err, { scope: 'environment.cacheWrite', correlationId: region.key });
    });

  return { region, ...fresh, fetchedAt, stale: false };
}

#!/usr/bin/env node
/**
 * HTTP load test for the storefront. No dependencies: fetch and a timer.
 *
 *   node scripts/load-test.mjs http://localhost:3000 [seconds-per-stage]
 *
 * Runs stages of increasing concurrency against a weighted mix of the pages
 * customers actually hit, then one burst from a single address to confirm the
 * per-IP browse limit engages. In the capacity stages every request carries a
 * fresh address in x-forwarded-for: a simulated visitor fetches pages far
 * faster than a person, and would otherwise be throttled by the browse limit
 * the way a scraper is, which measures the limit rather than the server. The
 * app trusts that header only because this targets a local `next start`; on
 * Vercel the platform sets it and it cannot be spoofed.
 *
 * Point it at a local production build (`next build && next start`) backed
 * by a scratch database — never at the live site: it is a denial-of-service
 * tool by construction.
 */

const base = process.argv[2] ?? 'http://localhost:3000';
const stageSeconds = Number(process.argv[3] ?? 20);

if (/vercel\.app|avyora\.com/.test(base)) {
  console.error('Refusing to load-test a live deployment.');
  process.exit(1);
}

const products = [
  'rice-bran-cleansing-oil', 'centella-cleansing-balm', 'ha-toner', 'vitamin-c-serum',
  'niacinamide-drops', 'retinol', 'ceramide-cream', 'sunscreen', 'galacto-essence', 'lip-mask',
];

/** [weight, path factory] — roughly how browsing traffic splits. */
const MIX = [
  [20, () => '/'],
  [20, () => '/collections'],
  [10, () => `/collections?q=${['serum', 'spf', 'dry skin', 'vitamin c'][rand(4)]}`],
  [35, () => `/products/${products[rand(products.length)]}`],
  [5, () => '/journal'],
  [10, () => '/api/cart'],
];
const totalWeight = MIX.reduce((n, [w]) => n + w, 0);

function rand(n) {
  return Math.floor(Math.random() * n);
}
function pickPath() {
  let r = Math.random() * totalWeight;
  for (const [w, make] of MIX) if ((r -= w) < 0) return make();
  return '/';
}
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function stage(concurrency, seconds, { sameAddress = false } = {}) {
  const deadline = Date.now() + seconds * 1000;
  const latencies = [];
  const statuses = new Map();
  const byRoute = new Map();
  let counter = 0;

  async function visitor() {
    // Cookies the server sets are sent back, as a browser would: after its
    // first request a visitor is a returning one.
    let cookie = '';
    while (Date.now() < deadline) {
      const n = counter++;
      const address = sameAddress ? '203.0.113.7' : `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
      const path = pickPath();
      const started = performance.now();
      let status = 'network-error';
      try {
        const res = await fetch(base + path, {
          headers: {
            'x-forwarded-for': address,
            'user-agent': 'Mozilla/5.0 avyora-load-test',
            ...(cookie ? { cookie } : {}),
          },
          redirect: 'manual',
        });
        const set = res.headers.getSetCookie?.() ?? [];
        if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
        await res.arrayBuffer();
        status = String(res.status);
      } catch {
        // counted below
      }
      const ms = performance.now() - started;
      latencies.push(ms);
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      const route = path.split('?')[0].replace(/\/products\/.+/, '/products/[slug]');
      byRoute.set(route, [...(byRoute.get(route) ?? []), ms]);
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => visitor()));
  const elapsed = (Date.now() - started) / 1000;
  latencies.sort((a, b) => a - b);

  return {
    concurrency,
    requests: latencies.length,
    rps: Math.round(latencies.length / elapsed),
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: Math.round(latencies[latencies.length - 1] ?? 0),
    statuses: Object.fromEntries(statuses),
    routes: Object.fromEntries(
      [...byRoute].map(([route, ms]) => {
        ms.sort((a, b) => a - b);
        return [route, { p50: Math.round(percentile(ms, 50)), p95: Math.round(percentile(ms, 95)) }];
      })
    ),
  };
}

// Warm the compiled routes so the first stage does not measure cold starts.
for (const path of ['/', '/collections', '/products/ha-toner', '/journal', '/api/cart']) {
  await fetch(base + path, { headers: { 'x-forwarded-for': '192.0.2.1' } }).catch(() => {});
}

const results = [];
for (const concurrency of [10, 50, 100]) {
  const r = await stage(concurrency, stageSeconds);
  results.push(r);
  console.log(JSON.stringify(r));
}

// One address, far over the 120-per-minute browse limit.
const abuse = await stage(20, 10, { sameAddress: true });
console.log(JSON.stringify({ ...abuse, note: 'single address' }));

const errors = results.flatMap((r) =>
  Object.entries(r.statuses).filter(([s]) => s !== '200').map(([s, n]) => `${s}×${n} at c=${r.concurrency}`)
);
console.log(errors.length ? `Non-200 responses: ${errors.join(', ')}` : 'All staged requests returned 200.');
console.log(
  abuse.statuses['429'] ? `Rate limit engaged: ${abuse.statuses['429']} of ${abuse.requests} refused.` : 'WARNING: rate limit did not engage.'
);

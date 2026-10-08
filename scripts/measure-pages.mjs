#!/usr/bin/env node
/**
 * Measures public pages on a running production build.
 *
 *   npm run build && npm run start      # in one terminal
 *   node scripts/measure-pages.mjs [baseUrl]
 *
 * For each page: status, Cache-Control, Next's cache state on a repeat
 * request, HTML size, and the JavaScript and CSS the page itself references
 * (raw and gzip-compressed, the transfer a first visit pays). Also checks
 * that private paths are never cacheable. Read-only; sends no personal data.
 */
import { gzipSync } from 'node:zlib';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const PUBLIC = ['/', '/collections', '/products/retinol', '/routine-finder', '/journal', '/privacy', '/shipping-policy'];
const PRIVATE = ['/account', '/checkout', '/login', '/admin-login', '/track-order', '/api/wishlist'];

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const assetCache = new Map();

async function asset(url) {
  if (!assetCache.has(url)) {
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    assetCache.set(url, { raw: buf.length, gz: gzipSync(buf).length });
  }
  return assetCache.get(url);
}

const rows = [];
for (const path of PUBLIC) {
  const first = await fetch(base + path);
  const html = await first.text();
  const repeat = await fetch(base + path);
  await repeat.arrayBuffer();
  // `nomodule` scripts (legacy polyfills) are skipped by every modern browser.
  const srcs = [
    ...[...html.matchAll(/<script([^>]+)>/g)]
      .filter((m) => !/noModule|nomodule/.test(m[1]))
      .map((m) => /src="([^"]+)"/.exec(m[1])?.[1])
      .filter(Boolean)
      .map((src) => [null, src]),
    ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
  ].map((m) => new URL(m[1], base).href);
  const unique = [...new Set(srcs)];
  let raw = 0;
  let gz = 0;
  for (const u of unique) {
    const a = await asset(u);
    raw += a.raw;
    gz += a.gz;
  }
  rows.push({
    path,
    status: first.status,
    cacheControl: first.headers.get('cache-control'),
    repeatCache: repeat.headers.get('x-nextjs-cache') ?? '-',
    html: kb(Buffer.byteLength(html)),
    htmlGzip: kb(gzipSync(html).length),
    assets: unique.length,
    assetsRaw: kb(raw),
    assetsGzip: kb(gz),
  });
}
console.table(rows);

const largest = [...assetCache.entries()].sort((a, b) => b[1].gz - a[1].gz).slice(0, 8);
console.table(largest.map(([url, a]) => ({ asset: url.replace(base, ''), raw: kb(a.raw), gzip: kb(a.gz) })));

const priv = [];
for (const path of PRIVATE) {
  const r = await fetch(base + path, { redirect: 'manual' });
  await r.arrayBuffer();
  const cc = r.headers.get('cache-control') ?? '';
  priv.push({ path, status: r.status, cacheControl: cc, sharedCacheable: !/private|no-store/.test(cc) });
}
console.table(priv);
if (priv.some((p) => p.sharedCacheable)) process.exitCode = 1;

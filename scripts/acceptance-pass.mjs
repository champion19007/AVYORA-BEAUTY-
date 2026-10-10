#!/usr/bin/env node
/**
 * Desktop acceptance pass over a running build, through the Chrome DevTools
 * Protocol of a locally installed Edge or Chrome (no extra dependencies).
 *
 *   node scripts/acceptance-pass.mjs <baseUrl> <outDir> [--widths=1280,1440,1920] [--paths=/,/collections]
 *
 * For each page and width it saves a viewport screenshot and records:
 * load timings (TTFB, FCP, LCP, DOMContentLoaded), layout shift, bytes
 * transferred (JS and total), horizontal overflow, and basic accessibility
 * checks (document language, one h1, heading order, images without alt,
 * unnamed buttons and links, form fields without labels). Each page is
 * loaded twice and the second (warm server) load is recorded. Numbers are
 * local and unthrottled: for comparing builds, not as field data.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [base, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const widths = arg('widths', '1280,1440,1920').split(',').map(Number);
const paths = arg(
  'paths',
  '/,/collections,/products/rice-bran-cleansing-oil,/routine-finder,/assistant,/checkout,/wishlist,/scan,/contact,/login'
).split(',');
const HEIGHTS = { 1280: 800, 1440: 900, 1920: 1080 };
if (!base || !outDir) {
  console.error('usage: node scripts/acceptance-pass.mjs <baseUrl> <outDir> [--widths=..] [--paths=..]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((b) => existsSync(b));
if (!exe) throw new Error('No Edge or Chrome found');
const port = 9300 + Math.floor(Math.random() * 500);
const browser = spawn(
  exe,
  [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'measure-'))}`,
    '--no-first-run',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: 'ignore' }
);
const kill = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
    else browser.kill();
  } catch {}
};
process.on('exit', kill);
process.on('uncaughtException', (err) => {
  console.error(err);
  kill();
  process.exit(1);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
    (r) => r.json(),
    () => null
  );
  if (!targets) await sleep(200);
}
if (!targets) throw new Error('DevTools did not start');
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  }
});
const send = (method, params = {}, ms = 30_000) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const t = setTimeout(() => (pending.delete(id), reject(new Error(`${method} timed out`))), ms);
    pending.set(id, { resolve: (v) => (clearTimeout(t), resolve(v)), reject: (e) => (clearTimeout(t), reject(e)) });
    ws.send(JSON.stringify({ id, method, params }));
  });

// Observers registered before any page script, so buffered LCP and CLS are complete.
await send('Page.enable');
// Headless tabs that are not focused stop producing frames (no paint timings, stalled screenshots).
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.bringToFront');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__m={lcp:null,cls:0};try{new PerformanceObserver(l=>{const e=l.getEntries();window.__m.lcp=e[e.length-1].startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__m.cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch{}`,
});

const probe = () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const size = (r) => r.transferSize || r.encodedBodySize || 0;
  const name = (el) =>
    (
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.textContent ||
      el.title ||
      el.querySelector('img[alt]')?.alt ||
      ''
    ).trim();
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
  const skips = headings.filter((lvl, i) => i > 0 && lvl > headings[i - 1] + 1).length;
  const fields = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(
    (f) =>
      !(f.labels?.length || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.closest('label'))
  );
  return {
    status: nav.responseStatus,
    ttfb: Math.round(nav.responseStart),
    fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0) || null,
    lcp: window.__m.lcp && Math.round(window.__m.lcp),
    cls: +window.__m.cls.toFixed(3),
    dcl: Math.round(nav.domContentLoadedEventEnd),
    jsKB: Math.round(res.filter((r) => r.initiatorType === 'script').reduce((a, r) => a + size(r), 0) / 1024),
    totalKB: Math.round((res.reduce((a, r) => a + size(r), 0) + size(nav)) / 1024),
    overflowX: document.documentElement.scrollWidth > innerWidth,
    a11y: {
      lang: document.documentElement.lang || null,
      h1: headings.filter((h) => h === 1).length,
      headingSkips: skips,
      imgNoAlt: document.querySelectorAll('img:not([alt])').length,
      unnamedButtons: [...document.querySelectorAll('button')].filter((b) => !name(b)).length,
      unnamedLinks: [...document.querySelectorAll('a[href]')].filter((a) => !name(a)).length,
      unlabelledFields: fields.length,
    },
  };
};

const rows = [];
for (const width of widths) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: HEIGHTS[width] ?? 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const path of paths) {
    let m;
    for (let pass = 0; pass < 2; pass++) {
      // A blank page between loads, so one page's timings never include the previous one's unload.
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(200);
      await send('Page.navigate', { url: base + path });
      await sleep(2500);
      const r = await send('Runtime.evaluate', { expression: `(${probe})()`, returnByValue: true });
      m = r.result.value;
    }
    const file = `${width}${path.replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || '-home'}.jpg`;
    let shot = file;
    try {
      const capture = () => send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, 20_000);
      // Headless Edge sometimes stops producing frames; refocusing the tab usually restarts them.
      const { data } = await capture().catch(async () => (await send('Page.bringToFront'), capture()));
      writeFileSync(join(outDir, file), Buffer.from(data, 'base64'));
    } catch (err) {
      shot = null;
      console.warn(`screenshot skipped for ${width} ${path}: ${err.message}`);
    }
    rows.push({ width, path, ...m, screenshot: shot });
    console.log(width, path, JSON.stringify(m));
  }
}
writeFileSync(join(outDir, 'measurements.json'), JSON.stringify(rows, null, 2));
kill();
process.exit(0);

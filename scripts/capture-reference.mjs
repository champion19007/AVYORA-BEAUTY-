#!/usr/bin/env node
/**
 * Captures and measures a page at desktop widths through the Chrome DevTools
 * Protocol of a locally installed Edge or Chrome (no extra dependencies).
 *
 *   node scripts/capture-reference.mjs <url> <outDir> [--widths=1280,1440,1920]
 *
 * For each width it records the viewport, browser and content width; takes
 * a hero screenshot, one screenshot per viewport-height step down the page
 * (JPEG), per-section screenshots, the open menu and expanded FAQ items;
 * and writes measurements read from computed styles (typography, sections,
 * buttons, images, colours, fonts, animations), with and without
 * prefers-reduced-motion. Used for the Nuvē reference (prompt 19) and for
 * comparing Avyora pages against it later.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [url, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const widths = (process.argv.find((a) => a.startsWith('--widths='))?.slice(9) ?? '1280,1440,1920')
  .split(',')
  .map(Number);
const HEIGHTS = { 1280: 800, 1440: 900, 1920: 1080 };
if (!url || !outDir) {
  console.error('usage: node scripts/capture-reference.mjs <url> <outDir> [--widths=1280,1440,1920]');
  process.exit(1);
}

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = BROWSERS.find((b) => existsSync(b));
if (!exe) throw new Error('No Edge or Chrome found');
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'ref-capture-'));
const browser = spawn(
  exe,
  [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: 'ignore' }
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Always take the browser down with us, including on errors (Windows needs the whole process tree).
const killBrowser = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
    else browser.kill();
  } catch {}
};
process.on('exit', killBrowser);
process.on('uncaughtException', (err) => {
  console.error(err);
  killBrowser();
  process.exit(1);
});

async function json(path) {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}${path}`)).json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error('DevTools did not start');
}

const version = await json('/json/version');
const targets = await json('/json/list');
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
});
const send = (method, params = {}, timeoutMs = 20_000) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
/** Navigation can stall on a slow asset; retry once with a longer allowance. */
const navigate = async (target) => {
  try {
    await send('Page.navigate', { url: target }, 30_000);
  } catch {
    await send('Page.navigate', { url: target }, 60_000);
  }
};
const evaluate = async (fn, arg) => {
  const r = await send('Runtime.evaluate', {
    expression: `(${fn})(${JSON.stringify(arg ?? null)})`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result.value;
};
const skipped = [];
const shot = async (file, opts = {}) => {
  try {
    const { data } = await send('Page.captureScreenshot', {
      format: file.endsWith('.jpg') ? 'jpeg' : 'png',
      quality: file.endsWith('.jpg') ? 80 : undefined,
      ...opts,
    });
    writeFileSync(file, Buffer.from(data, 'base64'));
  } catch (err) {
    skipped.push(`${file}: ${err.message}`);
    console.warn(`skipped ${file}: ${err.message}`);
  }
};

/* ----------------------------------------------------- in-page probes -- */

const MEASURE = () => {
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + scrollX),
      y: Math.round(r.top + scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const text = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const typo = (el) => {
    const cs = getComputedStyle(el);
    return {
      text: text(el),
      tag: el.tagName.toLowerCase(),
      box: box(el),
      fontFamily: cs.fontFamily,
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight),
      letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
      color: cs.color,
      textTransform: cs.textTransform,
    };
  };

  // Sections: top-level full-width Framer layers; a container taller than three viewports
  // (the page's "Main") is replaced by its own full-width children.
  const fullWidth = (el) =>
    visible(el) && el.getBoundingClientRect().width >= innerWidth * 0.98 && el.getBoundingClientRect().height > 60;
  const named = [...document.querySelectorAll('[data-framer-name]')].filter(fullWidth);
  let tops = named.filter((e) => !named.some((o) => o !== e && o.contains(e)));
  for (let i = 0; i < 3; i++) {
    tops = tops.flatMap((e) => {
      if (e.getBoundingClientRect().height <= innerHeight * 3) return [e];
      // Inner sections may be capped at a max width, so half the viewport is enough here.
      const kids = [...e.querySelectorAll('[data-framer-name]')].filter(
        (k) =>
          k !== e &&
          visible(k) &&
          k.getBoundingClientRect().width >= innerWidth * 0.5 &&
          k.getBoundingClientRect().height > 60
      );
      const direct = kids.filter((k) => !kids.some((o) => o !== k && o.contains(k)));
      return direct.length > 1 ? direct : [e];
    });
  }
  // Pages without Framer layer names (Avyora): the top-level sections inside <main>.
  if (tops.length === 0) {
    const main = document.querySelector('main') ?? document.body;
    tops = [...main.querySelectorAll('section, header, footer')].filter(
      (e) => visible(e) && e.getBoundingClientRect().height > 60 && !e.parentElement.closest('section')
    );
    const footer = document.querySelector('footer');
    if (footer && !tops.includes(footer)) tops.push(footer);
  }
  const sections = tops
    .sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)
    .map((el) => {
      const cs = getComputedStyle(el);
      const heading = el.querySelector('h1,h2,h3');
      return {
        name:
          el.getAttribute('data-framer-name') ||
          el.id ||
          el.getAttribute('aria-labelledby') ||
          el.tagName.toLowerCase(),
        heading: heading ? text(heading) : null,
        box: box(el),
        background: cs.backgroundColor,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px),
        gap: cs.gap,
        display: cs.display,
        position: cs.position,
      };
    });

  // Typography: every visible text element with its own text, deduplicated by style.
  const seen = new Map();
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,span,li,label')) {
    if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const t = typo(el);
    const key = [t.fontFamily, t.fontSize, t.fontWeight, t.lineHeight, t.letterSpacing, t.color, t.textTransform].join(
      '|'
    );
    if (!seen.has(key)) seen.set(key, { ...t, count: 1 });
    else seen.get(key).count++;
  }
  const typography = [...seen.values()].sort((a, b) => b.fontSize - a.fontSize);

  // Buttons and pill links: anything clickable with a background or border.
  const buttons = [...document.querySelectorAll('a,button,[role=button]')]
    .filter(visible)
    .map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: text(el),
        href: el.getAttribute('href'),
        box: box(el),
        radius: cs.borderRadius,
        background: cs.backgroundColor,
        border: cs.borderTopWidth !== '0px' ? `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}` : null,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px),
        color: cs.color,
        fontSize: px(cs.fontSize),
        fontWeight: cs.fontWeight,
      };
    })
    .filter((b) => b.text || b.box.w < 80);

  const images = [...document.querySelectorAll('img')].filter(visible).map((img) => {
    const cs = getComputedStyle(img);
    const parent = getComputedStyle(img.parentElement);
    return {
      alt: img.alt,
      src: img.currentSrc || img.src,
      box: box(img),
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      radius: cs.borderRadius !== '0px' ? cs.borderRadius : parent.borderRadius,
    };
  });

  // Rounded containers (cards).
  const cards = [...document.querySelectorAll('div')]
    .filter(
      (el) =>
        visible(el) &&
        getComputedStyle(el).borderRadius !== '0px' &&
        el.getBoundingClientRect().width > 150 &&
        el.getBoundingClientRect().height > 100
    )
    .map((el) => {
      const cs = getComputedStyle(el);
      return {
        name: el.getAttribute('data-framer-name'),
        box: box(el),
        radius: cs.borderRadius,
        background: cs.backgroundColor,
        text: text(el).slice(0, 40),
      };
    })
    .slice(0, 80);

  const colours = {};
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor])
      if (c && c !== 'rgba(0, 0, 0, 0)') colours[c] = (colours[c] ?? 0) + 1;
  }

  const fonts = [...document.fonts].map((f) => ({
    family: f.family,
    weight: f.weight,
    style: f.style,
    status: f.status,
  }));
  const fontFiles = performance
    .getEntriesByType('resource')
    .filter((e) => /\.(woff2?|ttf|otf)(\?|$)/.test(e.name) || (e.initiatorType === 'css' && /font/.test(e.name)))
    .map((e) => e.name);

  return {
    viewport: {
      width: innerWidth,
      height: innerHeight,
      contentWidth: document.documentElement.clientWidth,
      pageHeight: document.documentElement.scrollHeight,
    },
    title: document.title,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    sections,
    typography,
    buttons,
    images,
    cards,
    colours: Object.entries(colours)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30),
    fonts,
    fontFiles,
  };
};

const ANIMATIONS = () => {
  const describe = (el) =>
    (el.getAttribute('data-framer-name') || el.tagName.toLowerCase()) +
    (el.innerText ? `: ${el.innerText.replace(/\s+/g, ' ').trim().slice(0, 30)}` : '');
  const running = document.getAnimations().map((a) => {
    const t = a.effect?.getTiming?.() ?? {};
    return {
      target: a.effect?.target ? describe(a.effect.target) : null,
      type: a.constructor.name,
      name: a.animationName ?? a.transitionProperty ?? null,
      duration: t.duration,
      delay: t.delay,
      easing: t.easing,
      iterations: t.iterations,
      playState: a.playState,
    };
  });
  const appear = [...document.querySelectorAll('[data-framer-appear-id], [style*="opacity: 0"], [style*="opacity:0"]')]
    .slice(0, 40)
    .map((el) => ({
      target: describe(el),
      opacity: getComputedStyle(el).opacity,
      transform: getComputedStyle(el).transform,
      willChange: getComputedStyle(el).willChange,
    }));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { reducedMotion: reduced, running, appearElements: appear };
};

/* ---------------------------------------------------------------- run -- */

await send('Page.enable');
await send('Runtime.enable');
const report = {
  url,
  capturedAt: new Date().toISOString(),
  browser: version.Browser,
  userAgent: version['User-Agent'],
  widths: {},
};

for (const width of widths) {
  const height = HEIGHTS[width] ?? Math.round(width * 0.5625);
  const dir = join(outDir, `w${width}`);
  rmSync(dir, { recursive: true, force: true });
  skipped.length = 0;
  mkdirSync(dir, { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate(url);
  await sleep(4000);

  const early = await evaluate(ANIMATIONS);
  await shot(join(dir, '01-hero-closed.png'));

  // Open menu: the clickable element in the top band whose text or label says menu.
  const menu = await evaluate(() => {
    const cands = [...document.querySelectorAll('a,button,[role=button],div,p')].filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.top < 120 &&
        r.width < 200 &&
        r.height < 80 &&
        /menu/i.test(el.innerText || el.getAttribute('aria-label') || el.getAttribute('data-framer-name') || '')
      );
    });
    const el = cands.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('data-framer-name') || '').trim(),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
  });
  let menuOpen = null;
  let menuBehaviour = null;
  if (menu) {
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: menu.x,
      y: menu.y,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: menu.x,
      y: menu.y,
      button: 'left',
      clickCount: 1,
    });
    await sleep(1500);
    await shot(join(dir, '03-menu-open.png'));
    menuOpen = await evaluate(() => {
      const links = [...document.querySelectorAll('a,p,span')].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.top >= 60 &&
          r.bottom <= innerHeight &&
          parseFloat(cs.fontSize) >= 32 &&
          cs.visibility !== 'hidden' &&
          el.innerText.trim() &&
          [...el.childNodes].some((n) => n.nodeType === 3)
        );
      });
      return links.slice(0, 20).map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          text: el.innerText.trim().slice(0, 40),
          box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          color: cs.color,
          fontFamily: cs.fontFamily,
        };
      });
    });
    // Behaviour while open: does the page scroll under the menu? Then Escape:
    // does it close, and where does focus land?
    const beforeWheel = await evaluate(() => scrollY);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: width / 2, y: height / 2, deltaX: 0, deltaY: 600 });
    await sleep(700);
    const afterWheel = await evaluate(() => scrollY);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1200);
    const afterEscape = await evaluate(() => ({
      dialogMounted: Boolean(document.querySelector('[role=dialog]')),
      focused:
        document.activeElement?.getAttribute('aria-label') ||
        document.activeElement?.innerText?.trim().slice(0, 30) ||
        document.activeElement?.tagName,
    }));
    menuBehaviour = {
      scrolledWhileOpen: afterWheel !== beforeWheel,
      scrollBefore: beforeWheel,
      scrollAfter: afterWheel,
      ...afterEscape,
    };
    await navigate(url);
    await sleep(4000);
  }

  // Walk the page so scroll-triggered content appears, capturing each step.
  const pageHeight = await evaluate(() => document.documentElement.scrollHeight);
  let step = 0;
  for (let y = 0; y < pageHeight; y += height) {
    await evaluate((yy) => window.scrollTo(0, yy), y);
    await sleep(900);
    await shot(join(dir, `scroll-${String(step++).padStart(2, '0')}.jpg`));
  }
  await evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);
  const m = await evaluate(MEASURE);
  const settled = await evaluate(ANIMATIONS);

  // Each section on its own: scrolled to the top of the viewport, then plain viewport
  // screenshots (clipped captures came out blank with scroll-revealed content).
  for (const [i, s] of m.sections.entries()) {
    if (s.box.h < 100 || s.box.y < 0) continue;
    const name = `section-${String(i + 1).padStart(2, '0')}-${String(s.name)
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()}`;
    for (let part = 0; part * height < s.box.h && part < 3; part++) {
      await evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), s.box.y + part * height);
      await sleep(1300);
      await shot(join(dir, `${name}${part ? `-${part + 1}` : ''}.jpg`));
    }
  }

  // Hover state of the first pill CTA.
  await evaluate(() => window.scrollTo(0, 0));
  await sleep(800);
  const cta = m.buttons.find((b) => b.text && b.box.y < height && parseFloat(b.radius) >= 20);
  let hover = null;
  if (cta) {
    const before = await evaluate(
      (t) => {
        const el = [...document.querySelectorAll('a,button')].find((e) => e.innerText.trim().startsWith(t));
        const cs = getComputedStyle(el);
        return { background: cs.backgroundColor, color: cs.color, transform: cs.transform };
      },
      cta.text.slice(0, 12)
    );
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: cta.box.x + cta.box.w / 2,
      y: cta.box.y + cta.box.h / 2,
    });
    await sleep(600);
    const after = await evaluate(
      (t) => {
        const el = [...document.querySelectorAll('a,button')].find((e) => e.innerText.trim().startsWith(t));
        const cs = getComputedStyle(el);
        return { background: cs.backgroundColor, color: cs.color, transform: cs.transform };
      },
      cta.text.slice(0, 12)
    );
    await shot(join(dir, '02-hero-cta-hover.png'), {
      clip: {
        x: Math.max(0, cta.box.x - 40),
        y: Math.max(0, cta.box.y - 40),
        width: cta.box.w + 80,
        height: cta.box.h + 80,
        scale: 1,
      },
    });
    hover = { cta: cta.text, before, after };
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: height - 5 });
  }

  // FAQ: click each question in the section whose heading mentions questions or FAQ.
  const faq = await evaluate(() => {
    const heading = [...document.querySelectorAll('h1,h2,h3,p')].find(
      (h) => /faq|question/i.test(h.innerText) && parseFloat(getComputedStyle(h).fontSize) >= 32
    );
    if (!heading) return null;
    let section = heading;
    while (section.parentElement && section.getBoundingClientRect().height < 400) section = section.parentElement;
    const r = section.getBoundingClientRect();
    return { heading: heading.innerText.trim(), y: Math.round(r.top + scrollY), h: Math.round(r.height) };
  });
  let faqItems = [];
  if (faq) {
    await evaluate((yy) => window.scrollTo(0, yy), faq.y);
    await sleep(1000);
    await shot(join(dir, '04-faq-closed.png'));
    const questions = await evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter(
          (el) =>
            el.children.length === 0 &&
            /\?$/.test((el.innerText || '').trim()) &&
            !(el.innerText || '').includes('\n') &&
            el.getBoundingClientRect().height > 0
        )
        .map((el) => el.innerText.trim())
    );
    for (const [i, q] of questions.entries()) {
      // Bring the row to mid-screen, then click the row's right edge (its plus control).
      const pos = await evaluate((t) => {
        const el = [...document.querySelectorAll('*')].find(
          (e) => e.children.length === 0 && (e.innerText || '').trim() === t
        );
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        let row = el;
        while (row.parentElement && row.getBoundingClientRect().width < innerWidth * 0.4) row = row.parentElement;
        const r = row.getBoundingClientRect();
        return {
          x: r.right - 40,
          y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
          rowHeight: Math.round(r.height),
        };
      }, q);
      if (!pos) continue;
      await sleep(500);
      const before = await evaluate(() => document.documentElement.scrollHeight);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: pos.x,
        y: pos.y,
        button: 'left',
        clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: pos.x,
        y: pos.y,
        button: 'left',
        clickCount: 1,
      });
      await sleep(1000);
      const after = await evaluate((t) => {
        const el = [...document.querySelectorAll('*')].find(
          (e) => e.children.length === 0 && (e.innerText || '').trim() === t
        );
        let row = el;
        while (row.parentElement && row.getBoundingClientRect().width < innerWidth * 0.4) row = row.parentElement;
        return {
          pageHeight: document.documentElement.scrollHeight,
          rowHeight: Math.round(row.getBoundingClientRect().height),
        };
      }, q);
      faqItems.push({
        question: q,
        rowHeightClosed: pos.rowHeight,
        rowHeightAfterClick: after.rowHeight,
        pageGrewBy: after.pageHeight - before,
      });
      if (i === 0) await shot(join(dir, '05-faq-first-expanded.png'));
    }
    await shot(join(dir, '06-faq-all-clicked.png'));
  }

  // Reduced motion: reload with the preference and see what still animates.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(url);
  await sleep(4000);
  const reduced = await evaluate(ANIMATIONS);
  await shot(join(dir, '07-hero-reduced-motion.png'));

  report.widths[width] = {
    skippedScreenshots: [...skipped],
    viewport: m.viewport,
    measurements: m,
    animations: { onLoad: early, settled, reducedMotion: reduced },
    hover,
    menu: menu && { trigger: menu, links: menuOpen, behaviour: menuBehaviour },
    faq: faq && { ...faq, items: faqItems },
  };
  writeFileSync(join(dir, 'measurements.json'), JSON.stringify(report.widths[width], null, 2));
  console.log(
    `w${width}: page ${m.viewport.pageHeight}px, ${m.sections.length} sections, ${step} scroll frames, menu ${menu ? 'opened' : 'not found'}, faq ${faqItems.length} items`
  );
}

writeFileSync(
  join(outDir, 'capture.json'),
  JSON.stringify(
    {
      url: report.url,
      capturedAt: report.capturedAt,
      browser: report.browser,
      userAgent: report.userAgent,
      widths: Object.fromEntries(Object.entries(report.widths).map(([w, r]) => [w, r.viewport])),
    },
    null,
    2
  )
);
ws.close();
// On Windows, killing the parent leaves Edge's child processes running; kill the whole tree.
if (process.platform === 'win32') spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
else browser.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch {
  // Windows may still hold the profile while the browser exits; it is in the temp folder.
}

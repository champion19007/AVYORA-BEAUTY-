#!/usr/bin/env python3
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
"""
Side-by-side comparison of two capture folders made by capture-reference.mjs.

    python scripts/compare-captures.py <reference_dir> <candidate_dir> <out_dir> [shot ...]

For each width present in both (w1280, w1440, w1920) it writes
<out_dir>/w<width>-<shot>.jpg with the reference on the left and the
candidate on the right, labelled, and prints a table of hero anchor
positions (headline, supporting copy, eyebrow, CTA, wordmark) with the
difference in CSS pixels. Default shots: 01-hero-closed 03-menu-open.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ref_dir, cand_dir, out_dir = sys.argv[1:4]
shots = sys.argv[4:] or ['01-hero-closed', '03-menu-open']
os.makedirs(out_dir, exist_ok=True)


def side_by_side(a_path, b_path, out_path, labels):
    a, b = Image.open(a_path).convert('RGB'), Image.open(b_path).convert('RGB')
    h = max(a.height, b.height)
    band = 36
    canvas = Image.new('RGB', (a.width + b.width + 16, h + band), (255, 255, 255))
    canvas.paste(a, (0, band))
    canvas.paste(b, (a.width + 16, band))
    d = ImageDraw.Draw(canvas)
    d.text((8, 10), labels[0], fill=(0, 0, 0))
    d.text((a.width + 24, 10), labels[1], fill=(0, 0, 0))
    canvas.save(out_path, quality=82)


def anchors(m, height):
    """Hero anchors from the computed typography and buttons of one capture."""
    typo = m['measurements']['typography']
    in_hero = lambda t: t['box']['y'] < height and t['box']['y'] >= 0
    pick = lambda pred: next((t['box'] for t in typo if in_hero(t) and pred(t)), None)
    white = lambda t: t['color'] == 'rgb(255, 255, 255)'
    out = {
        'headline': pick(lambda t: t['fontSize'] == 100),
        'supporting copy': pick(lambda t: t['fontSize'] == 20 and white(t)),
        'eyebrow': pick(lambda t: t['fontSize'] == 18 and white(t)),
        # The header can have scrolled away when measured; its resting position is 220 px lower.
        'wordmark': next(({**t['box'], 'y': t['box']['y'] + 220 if t['box']['y'] < 0 else t['box']['y']} for t in typo if t['fontSize'] == 28 and 'Serif' in t['fontFamily'] and t['box']['y'] < height), None),
    }
    cta = next((b for b in m['measurements']['buttons'] if b['text'] and b['box']['y'] < height and b['box']['h'] == 49), None)
    out['cta'] = cta['box'] if cta else None
    return out


rows = []
for w in (1280, 1440, 1920):
    r, c = os.path.join(ref_dir, f'w{w}'), os.path.join(cand_dir, f'w{w}')
    if not (os.path.isdir(r) and os.path.isdir(c)):
        continue
    for shot in shots:
        rp, cp = os.path.join(r, f'{shot}.png'), os.path.join(c, f'{shot}.png')
        if os.path.exists(rp) and os.path.exists(cp):
            side_by_side(rp, cp, os.path.join(out_dir, f'w{w}-{shot}.jpg'), (f'Reference (Nuve live) {w}px', f'Avyora {w}px'))
    rm = json.load(open(os.path.join(r, 'measurements.json'), encoding='utf-8'))
    cm = json.load(open(os.path.join(c, 'measurements.json'), encoding='utf-8'))
    height = rm['viewport']['height']
    ra, ca = anchors(rm, height), anchors(cm, height)
    for name in ra:
        a, b = ra[name], ca[name]
        if not a or not b:
            rows.append((w, name, a, b, None))
            continue
        # Right-aligned elements compare their right edges; the rest their left edges.
        right = name in ('supporting copy', 'cta')
        ax = a['x'] + a['w'] if right else a['x']
        bx = b['x'] + b['w'] if right else b['x']
        rows.append((w, name, a, b, (bx - ax, b['y'] - a['y'], 'right edge' if right else 'left edge')))

print('| Width | Anchor | Reference (x, y, w×h) | Avyora (x, y, w×h) | Δx | Δy |')
print('| --- | --- | --- | --- | --- | --- |')
fmt = lambda b: f"{b['x']}, {b['y']}, {b['w']}×{b['h']}" if b else 'not found'
for w, name, a, b, d in rows:
    dx = f"{d[0]:+d} ({d[2]})" if d else 'n/a'
    dy = f"{d[1]:+d}" if d else 'n/a'
    print(f'| {w} | {name} | {fmt(a)} | {fmt(b)} | {dx} | {dy} |')

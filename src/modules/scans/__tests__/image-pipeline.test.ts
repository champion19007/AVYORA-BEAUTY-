import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { dimensionProblem, luminanceStats, qualityIssues, sniffImageType } from '../image-validation';
import { localPrivateStorage, scanObjectKey, signReadToken, verifyReadToken } from '../private-storage';
import { validateAndReencode } from '../reencode';

const solid = (w: number, h: number, value: number, format: 'jpeg' | 'png' = 'jpeg', withExif = false) => {
  let img = sharp({ create: { width: w, height: h, channels: 3, background: { r: value, g: value, b: value } } });
  if (withExif) img = img.withMetadata({ exif: { IFD0: { Make: 'TestCam', Model: 'Secret-Model-123' } } });
  return format === 'jpeg' ? img.jpeg().toBuffer() : img.png().toBuffer();
};
/** Left half black, right half white: high contrast that survives downscaling. */
const halves = async (w: number, h: number) => {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = w / 2; x < w; x++) raw.fill(255, (y * w + x) * 3, (y * w + x) * 3 + 3);
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg()
    .toBuffer();
};

describe('file checks', () => {
  it('detects the real type from the bytes, not the name', async () => {
    expect(sniffImageType(new Uint8Array(await solid(10, 10, 128)))).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array(await solid(10, 10, 128, 'png')))).toBe('image/png');
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('GIF89a....'))).toBeNull();
  });

  it('bounds dimensions: at least 480 px short side, at most 12 megapixels', () => {
    expect(dimensionProblem(640, 480)).toBeNull();
    expect(dimensionProblem(479, 900)).toBe('too_small');
    expect(dimensionProblem(4000, 3001)).toBe('too_many_pixels');
    expect(dimensionProblem(0, 100)).toBe('undecodable');
  });

  it('framing and lighting checks only flag obvious problems', () => {
    expect(qualityIssues({ brightness: 120, contrast: 40, faces: 1 })).toEqual([]);
    expect(qualityIssues({ brightness: 20, contrast: 5, faces: 0 })).toEqual(['too_dark', 'low_contrast', 'no_face']);
    expect(qualityIssues({ brightness: 240, contrast: 40, faces: 2 })).toEqual(['too_bright', 'several_faces']);
    // No face detector in this browser: the face count is unknown, not assumed.
    expect(qualityIssues({ brightness: 120, contrast: 40, faces: null })).toEqual([]);
    const stats = luminanceStats(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]));
    expect(stats.brightness).toBeCloseTo(127.5, 3);
    expect(stats.contrast).toBeCloseTo(127.5, 3);
  });
});

describe('server re-encode', () => {
  it('re-encodes a valid photo as JPEG and drops all metadata', async () => {
    const input = await solid(800, 600, 128, 'jpeg', true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await validateAndReencode(new Uint8Array(input));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(Buffer.from(out.jpeg).includes('Secret-Model-123')).toBe(false);
    expect(out).toMatchObject({ width: 800, height: 600 });
  });

  it('rejects too large, wrong type, undecodable, too many pixels and too small', async () => {
    expect(await validateAndReencode(new Uint8Array(4 * 1024 * 1024 + 1))).toEqual({ ok: false, problem: 'too_large' });
    expect(await validateAndReencode(new TextEncoder().encode('<svg/>'))).toEqual({
      ok: false,
      problem: 'unsupported_type',
    });
    const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3]);
    expect(await validateAndReencode(truncated)).toEqual({ ok: false, problem: 'undecodable' });
    expect(await validateAndReencode(new Uint8Array(await solid(4100, 3000, 128)))).toEqual({
      ok: false,
      problem: 'too_many_pixels',
    });
    expect(await validateAndReencode(new Uint8Array(await solid(400, 300, 128)))).toEqual({
      ok: false,
      problem: 'too_small',
    });
  });

  it('reports lighting from the decoded pixels', async () => {
    const dark = await validateAndReencode(new Uint8Array(await solid(640, 480, 10)));
    const textured = await validateAndReencode(new Uint8Array(await halves(640, 480)));
    expect(dark.ok && dark.brightness).toBeLessThan(30);
    expect(textured.ok && textured.contrast).toBeGreaterThan(30);
  });
});

describe('private storage', () => {
  it('stores only server-shaped keys, and reads back what it stored', async () => {
    const store = localPrivateStorage(mkdtempSync(path.join(tmpdir(), 'private-')));
    const key = scanObjectKey('11111111-2222-3333-4444-555555555555');
    await store.put(key, new Uint8Array([1, 2, 3]), 'image/jpeg');
    expect(Array.from((await store.get(key))!)).toEqual([1, 2, 3]);
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
    await expect(store.put('../../etc/passwd', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow(
      'invalid private object key'
    );
    await expect(store.put('public/media/x.jpg', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow();
  });

  it('signed read tokens are bound to one object and expire', () => {
    process.env.PRIVATE_STORAGE_SIGNING_SECRET = 'test-secret';
    const key = scanObjectKey('11111111-2222-3333-4444-555555555555');
    const token = signReadToken(key, Date.now() + 60_000);
    expect(verifyReadToken(key, token)).toBe(true);
    expect(verifyReadToken(scanObjectKey('99999999-2222-3333-4444-555555555555'), token)).toBe(false);
    expect(verifyReadToken(key, token, Date.now() + 120_000)).toBe(false);
    expect(verifyReadToken(key, 'garbage')).toBe(false);
    // Capped at ten minutes whatever is asked for.
    const long = signReadToken(key, Date.now() + 86_400_000);
    expect(Number(long.split('.')[0])).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
  });
});

// Re-audit A15: the browser limit, the server body limit and the platform ceiling agree.
describe('upload size limits', () => {
  it('stay below the 4.5 MB Vercel Functions request ceiling, with headroom, and match each other', async () => {
    const { MAX_UPLOAD_BYTES } = await import('../image-validation');
    const { BODY_LIMITS } = await import('@/lib/request-body');
    const VERCEL_FUNCTION_BODY_LIMIT = 4.5 * 1000 * 1000;
    expect(BODY_LIMITS.scanImage).toBe(MAX_UPLOAD_BYTES);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(VERCEL_FUNCTION_BODY_LIMIT - 64 * 1024);
    expect(await validateAndReencode(new Uint8Array(MAX_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      problem: 'too_large',
    });
  });
});

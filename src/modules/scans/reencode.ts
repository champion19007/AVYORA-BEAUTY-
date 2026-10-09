import { dimensionProblem, luminanceStats, MAX_UPLOAD_BYTES, sniffImageType, type ImageProblem } from './image-validation';

/**
 * Server-side validation of an uploaded scan image, then a re-encode that
 * drops every piece of metadata (EXIF, GPS, camera, ICC, XMP). The
 * orientation is applied to the pixels first so nothing depends on it.
 * Uses sharp (installed with Next.js), loaded only here.
 */
export async function validateAndReencode(
  input: Uint8Array
): Promise<{ ok: true; jpeg: Uint8Array; width: number; height: number; brightness: number; contrast: number } | { ok: false; problem: ImageProblem }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, problem: 'too_large' };
  if (!sniffImageType(input)) return { ok: false, problem: 'unsupported_type' };
  const sharp = (await import('sharp')).default;
  try {
    // limitInputPixels stops a decompression bomb before it is decoded in full.
    const image = sharp(input, { limitInputPixels: 12_000_000, failOn: 'error' }).rotate();
    const meta = await image.metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height ?? 0 : meta.width ?? 0;
    const height = swap ? meta.width ?? 0 : meta.height ?? 0;
    const problem = dimensionProblem(width, height);
    if (problem) return { ok: false, problem };
    const jpeg = new Uint8Array(await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer());
    const small = await sharp(jpeg).resize(256, 256, { fit: 'inside' }).removeAlpha().raw().toBuffer();
    return { ok: true, jpeg, width, height, ...luminanceStats(small, 3) };
  } catch (err) {
    return { ok: false, problem: /pixel limit/i.test(String(err)) ? 'too_many_pixels' : 'undecodable' };
  }
}

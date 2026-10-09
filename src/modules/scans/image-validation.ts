/**
 * Checks for a face-scan image, shared by the browser (before upload) and
 * the server (after upload, where they are enforced again).
 *
 * These check the file and the capture only: type, size, decoded
 * dimensions, and simple framing and lighting measures. They say nothing
 * about skin; that needs an evaluated model (see inference-adapter.ts).
 */

/**
 * 4 MB: below the 4.5 MB request-body ceiling of Vercel Functions, which the
 * raw-bytes upload passes through (re-audit A15), with room for transport
 * overhead. The same limit is enforced in the browser and on the server.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 12_000_000;
/** Shortest side below this is too small to check framing or lighting meaningfully. */
export const MIN_SHORT_SIDE = 480;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];

/** The real type from the file's first bytes; the declared type and extension are not trusted. */
export function sniffImageType(bytes: Uint8Array): AcceptedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return null;
}

export type ImageProblem = 'too_large' | 'unsupported_type' | 'undecodable' | 'too_many_pixels' | 'too_small';

export const IMAGE_PROBLEM_TEXT: Record<ImageProblem, string> = {
  too_large: 'The file is larger than 4 MB. Use a smaller photo.',
  unsupported_type: 'Use a JPEG, PNG or WebP photo.',
  undecodable: 'This file could not be read as an image.',
  too_many_pixels: 'The photo is larger than 12 megapixels. Use a smaller photo.',
  too_small: `The photo is too small; it needs at least ${MIN_SHORT_SIDE} pixels on its shorter side.`,
};

/** Checks the decoded dimensions. */
export function dimensionProblem(width: number, height: number): ImageProblem | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'undecodable';
  if (width * height > MAX_DECODED_PIXELS) return 'too_many_pixels';
  if (Math.min(width, height) < MIN_SHORT_SIDE) return 'too_small';
  return null;
}

export type CaptureQuality = {
  /** Mean luminance, 0–255. */
  brightness: number;
  /** Standard deviation of luminance: very low means flat or washed out. */
  contrast: number;
  /** Faces found by the browser's face detector, or null when no detector is available. */
  faces: number | null;
};

export type QualityIssue = 'too_dark' | 'too_bright' | 'low_contrast' | 'no_face' | 'several_faces';

export const QUALITY_TEXT: Record<QualityIssue, string> = {
  too_dark: 'The photo is too dark. Face a window or a lamp.',
  too_bright: 'The photo is too bright. Move away from direct light.',
  low_contrast: 'The photo looks washed out or blurred. Try again in even light.',
  no_face: 'No face was found. Centre your face in the frame.',
  several_faces: 'More than one face was found. Only one person should be in the photo.',
};

/** Framing and lighting checks only. Thresholds are proposed engineering values, not evaluated cut-offs. */
export function qualityIssues(q: CaptureQuality): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (q.brightness < 50) issues.push('too_dark');
  if (q.brightness > 215) issues.push('too_bright');
  if (q.contrast < 18) issues.push('low_contrast');
  if (q.faces === 0) issues.push('no_face');
  if (q.faces !== null && q.faces > 1) issues.push('several_faces');
  return issues;
}

/** Luminance statistics of RGBA pixel data (from a downscaled canvas or a decoded buffer). */
export function luminanceStats(rgba: Uint8ClampedArray | Uint8Array, channels = 4): { brightness: number; contrast: number } {
  let sum = 0;
  let sumSq = 0;
  const n = Math.floor(rgba.length / channels);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const y = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
    sum += y;
    sumSq += y * y;
  }
  const mean = n ? sum / n : 0;
  return { brightness: mean, contrast: n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0 };
}

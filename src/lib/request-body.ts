/**
 * Reads a request body with a hard size limit.
 *
 * `Content-Length` is checked first, but it can be absent (chunked uploads)
 * or wrong, so the stream itself is counted and abandoned as soon as it
 * passes the limit: an oversized body is never buffered in full.
 */

/** Body limits per endpoint, in bytes. Starting settings. */
export const BODY_LIMITS = {
  /** Razorpay webhook events are a few KB; generous headroom without inviting abuse. */
  paymentWebhook: 64 * 1024,
  paymentCreate: 32 * 1024,
  paymentVerify: 4 * 1024,
  adminLogin: 4 * 1024,
  cart: 16 * 1024,
  wishlist: 4 * 1024,
  activity: 8 * 1024,
  /** Spec: profile JSON at most 16 KB, plus the release id and scan id. */
  routine: 17 * 1024,
  feedback: 1024,
  consent: 1024,
} as const;

export type BoundedRead = { ok: true; text: string } | { ok: false; response: Response };

const tooLarge = (maxBytes: number) =>
  new Response(JSON.stringify({ error: { code: 'payload_too_large', message: `Request body exceeds ${maxBytes} bytes.` } }), {
    status: 413,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function readBoundedText(request: Request, maxBytes: number): Promise<BoundedRead> {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: tooLarge(maxBytes) };
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, response: tooLarge(maxBytes) };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

/** Bounded read, then JSON. Malformed JSON yields `{ ok: true, json: undefined }` for the caller's own validation. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; json: unknown } | { ok: false; response: Response }> {
  const read = await readBoundedText(request, maxBytes);
  if (!read.ok) return read;
  try {
    return { ok: true, json: read.text ? JSON.parse(read.text) : undefined };
  } catch {
    return { ok: true, json: undefined };
  }
}

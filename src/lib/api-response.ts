import { PRIVATE_CACHE_CONTROL } from '@/lib/cache-policy';

/**
 * One error shape for private JSON APIs (spec section 20: code, message,
 * requestId, optional fieldErrors), and private no-store responses that
 * vary on the cookie so no shared cache can serve one visitor's response to
 * another.
 */

const headers = { 'Content-Type': 'application/json', 'Cache-Control': PRIVATE_CACHE_CONTROL, Vary: 'Cookie' };

export function privateJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra: { fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> } = {}
): Response {
  return privateJson({ error: { code, message, requestId: crypto.randomUUID(), ...extra } }, status);
}

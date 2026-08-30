/**
 * Razorpay integration.
 *
 * Talks to the REST API directly rather than pulling in the Node SDK: the SDK
 * is Node-only and this stack is headed for containers on AWS where keeping
 * the runtime surface small and portable matters. Signing uses Web Crypto, so
 * the same code runs in Node and edge runtimes.
 *
 * The security rules that matter here:
 *
 *  1. The amount charged is always computed on our server from the catalogue.
 *     A client-supplied amount lets anyone pay ₹1 for a full basket.
 *  2. A payment is never trusted because the browser said it succeeded. The
 *     checkout callback is signature-verified server-side, and the webhook is
 *     treated as the authoritative record.
 *  3. The key secret never leaves the server. Only the key id is public.
 */

const RAZORPAY_API = 'https://api.razorpay.com/v1';

const encoder = new TextEncoder();

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
};

/**
 * Reads Razorpay credentials. Returns null when unconfigured so checkout can
 * fall back to cash on delivery rather than erroring.
 */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET };
}

/** The key id is safe to expose to the browser; the secret never is. */
export function getPublicKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

export function isRazorpayConfigured(): boolean {
  return getRazorpayConfig() !== null;
}

/* -------------------------------------------------------------------------- */
/* Signing                                                                     */
/* -------------------------------------------------------------------------- */

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time hex comparison. Comparing signatures with `===` leaks how much
 * of a forged signature was correct through response timing.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser.
 *
 * Razorpay signs `<razorpay_order_id>|<razorpay_payment_id>` with the key
 * secret. Without this check, a customer could call our success endpoint with
 * invented ids and mark their own order paid.
 */
export async function verifyPaymentSignature(
  params: { orderId: string; paymentId: string; signature: string },
  keySecret: string
): Promise<boolean> {
  if (!params.orderId || !params.paymentId || !params.signature) return false;
  const expected = await hmacSha256Hex(`${params.orderId}|${params.paymentId}`, keySecret);
  return timingSafeEqualHex(expected, params.signature.toLowerCase());
}

/**
 * Verifies a webhook. Razorpay signs the raw request body with the webhook
 * secret, so the body must be hashed exactly as received — parsing and
 * re-serialising it changes the bytes and breaks the signature.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string
): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmacSha256Hex(rawBody, webhookSecret);
  return timingSafeEqualHex(expected, signature.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Orders API                                                                  */
/* -------------------------------------------------------------------------- */

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
};

/**
 * Creates a Razorpay order.
 *
 * `amountPaise` must be the total this server calculated. `receipt` carries our
 * own order number so a payment can always be traced back to an order, which is
 * exactly what a bare razorpay.me payment link cannot do.
 */
export async function createRazorpayOrder(
  {
    amountPaise,
    receipt,
    notes,
  }: { amountPaise: number; receipt: string; notes?: Record<string, string> },
  config: RazorpayConfig
): Promise<RazorpayOrder> {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    // Razorpay rejects anything under ₹1, and a non-integer means a float has
    // leaked into the money path somewhere upstream.
    throw new Error(`Invalid Razorpay amount: ${amountPaise}`);
  }

  const auth = btoa(`${config.keyId}:${config.keySecret}`);
  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // Never surface the response verbatim to a customer; it can echo config.
    throw new Error(`Razorpay order creation failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return (await response.json()) as RazorpayOrder;
}

/** Fetches a payment, used to confirm amount and status independently. */
export async function fetchRazorpayPayment(
  paymentId: string,
  config: RazorpayConfig
): Promise<{ id: string; amount: number; status: string; order_id: string } | null> {
  const auth = btoa(`${config.keyId}:${config.keySecret}`);
  const response = await fetch(`${RAZORPAY_API}/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return response.json();
}

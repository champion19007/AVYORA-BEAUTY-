/**
 * Cashfree Payment Gateway integration (PG API, REST, no SDK on the server).
 *
 * The same rules as every payment path here:
 *  1. The amount is computed on our server from the catalogue; Cashfree is
 *     told the order total, never a figure from the browser.
 *  2. The browser coming back from checkout proves nothing. Our server asks
 *     Cashfree for the order's payments and applies only what Cashfree says,
 *     and the signed webhook is the authoritative record.
 *  3. The secret key never leaves the server. The browser receives only the
 *     payment session id, which can do nothing but open that one checkout.
 *
 * Amounts: Cashfree speaks rupees (decimal); this app speaks integer paise.
 * Conversion happens only here, rounding to the nearest paisa.
 */

export const CASHFREE_API_VERSION = '2025-01-01';

export type CashfreeConfig = { appId: string; secretKey: string; env: 'sandbox' | 'production' };

/** Null when unconfigured, so checkout offers cash on delivery instead of failing. */
export function getCashfreeConfig(): CashfreeConfig | null {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) return null;
  return { appId, secretKey, env: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox' };
}

export const isCashfreeConfigured = () => getCashfreeConfig() !== null;

const baseUrl = (c: CashfreeConfig) =>
  c.env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
const headers = (c: CashfreeConfig) => ({
  'x-api-version': CASHFREE_API_VERSION,
  'x-client-id': c.appId,
  'x-client-secret': c.secretKey,
  'Content-Type': 'application/json',
});

export const toRupees = (paise: number) => Math.round(paise) / 100;
export const toPaise = (rupees: number) => Math.round(rupees * 100);

export type CashfreeOrder = {
  order_id: string;
  cf_order_id: string;
  payment_session_id: string;
  order_amount: number;
  order_status: string;
};

/**
 * Creates (or, on a retry, re-reads) the Cashfree order for one of our
 * orders. Our order number is Cashfree's order id, so a second create for
 * the same order is answered from the first one rather than opening another.
 */
export async function createCashfreeOrder(
  input: {
    orderNumber: string;
    amountPaise: number;
    customer: { id: string; email: string; phone: string; name: string };
    returnUrl: string;
    notifyUrl?: string;
  },
  c: CashfreeConfig
): Promise<CashfreeOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100)
    throw new Error(`Invalid Cashfree amount: ${input.amountPaise}`);
  const res = await fetch(`${baseUrl(c)}/orders`, {
    method: 'POST',
    headers: headers(c),
    body: JSON.stringify({
      order_id: input.orderNumber,
      order_amount: toRupees(input.amountPaise),
      order_currency: 'INR',
      customer_details: {
        customer_id: input.customer.id,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone,
        customer_name: input.customer.name,
      },
      order_meta: { return_url: input.returnUrl, ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}) },
      order_note: `Avyora order ${input.orderNumber}`,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return (await res.json()) as CashfreeOrder;
  const detail = await res.text().catch(() => '');
  if (res.status === 409 || /already exists/i.test(detail)) {
    const existing = await fetchCashfreeOrder(input.orderNumber, c);
    if (existing) return existing;
  }
  // Never shown to a customer: provider errors can echo configuration.
  throw new Error(`Cashfree order creation failed (${res.status}): ${detail.slice(0, 300)}`);
}

export async function fetchCashfreeOrder(orderNumber: string, c: CashfreeConfig): Promise<CashfreeOrder | null> {
  try {
    const res = await fetch(`${baseUrl(c)}/orders/${encodeURIComponent(orderNumber)}`, {
      headers: headers(c),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as CashfreeOrder) : null;
  } catch {
    return null;
  }
}

/** One payment attempt, in this app's terms (integer paise, normalised status). */
export type CashfreePayment = {
  id: string;
  amountPaise: number;
  status: 'success' | 'failed' | 'pending' | 'dropped' | 'other';
};

const STATUS: Record<string, CashfreePayment['status']> = {
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'failed',
  VOID: 'failed',
  USER_DROPPED: 'dropped',
  PENDING: 'pending',
  NOT_ATTEMPTED: 'pending',
};
export const normaliseStatus = (s: unknown): CashfreePayment['status'] =>
  STATUS[String(s ?? '').toUpperCase()] ?? 'other';

/**
 * Every payment attempt Cashfree holds for one of our orders. Null when
 * Cashfree cannot be reached: callers treat that as "unknown", never "unpaid".
 */
export async function fetchCashfreePayments(orderNumber: string, c: CashfreeConfig): Promise<CashfreePayment[] | null> {
  try {
    const res = await fetch(`${baseUrl(c)}/orders/${encodeURIComponent(orderNumber)}/payments`, {
      headers: headers(c),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return [];
    if (!res.ok) return null;
    const body = (await res.json()) as {
      cf_payment_id: string | number;
      payment_amount: number;
      payment_status: string;
    }[];
    return Array.isArray(body)
      ? body.map((p) => ({
          id: String(p.cf_payment_id),
          amountPaise: toPaise(Number(p.payment_amount)),
          status: normaliseStatus(p.payment_status),
        }))
      : null;
  } catch {
    return null;
  }
}

/**
 * Webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secretKey)),
 * over the exact bytes received. Compared in constant time.
 */
export async function verifyCashfreeWebhook(
  rawBody: string,
  timestamp: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  if (!timestamp || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + rawBody)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

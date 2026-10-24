/**
 * Shiprocket: booking couriers and reading their tracking updates.
 *
 * API reference: https://apidocs.shiprocket.in (base apiv2.shiprocket.in/v1/external).
 * The flow for one parcel is four calls: create the order, assign an AWB (the
 * courier and tracking number), schedule the pickup, generate the label.
 * Shiprocket then POSTs tracking updates to our webhook for the life of the
 * shipment, keyed by AWB.
 *
 * Pure except for `fetch`, which is passed in, so the whole flow is testable
 * without a Shiprocket account.
 */

const BASE = 'https://apiv2.shiprocket.in/v1/external';

export type ShiprocketConfig = {
  /** An API user (Settings → API → Add New API User), not the main login. */
  email: string;
  password: string;
  /** The pickup address's nickname exactly as saved in Shiprocket. */
  pickupLocation: string;
  /** The webhook's security token, sent by Shiprocket as `x-api-key`. */
  webhookToken: string | null;
  /** ponytail: one parcel size for every order; per-product weights when the range varies enough to matter. */
  parcel: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number };
};

export function getShiprocketConfig(env: Record<string, string | undefined> = process.env): ShiprocketConfig | null {
  const { SHIPROCKET_EMAIL: email, SHIPROCKET_PASSWORD: password, SHIPROCKET_PICKUP_LOCATION: pickupLocation } = env;
  if (!email || !password || !pickupLocation) return null;
  const num = (v: string | undefined, fallback: number) => (v && Number(v) > 0 ? Number(v) : fallback);
  return {
    email,
    password,
    pickupLocation,
    webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN || null,
    parcel: {
      weightKg: num(env.SHIPROCKET_PARCEL_WEIGHT_KG, 0.5),
      lengthCm: num(env.SHIPROCKET_PARCEL_LENGTH_CM, 15),
      breadthCm: num(env.SHIPROCKET_PARCEL_BREADTH_CM, 12),
      heightCm: num(env.SHIPROCKET_PARCEL_HEIGHT_CM, 8),
    },
  };
}

/** The public tracking page for an AWB, for customer emails and the order page. */
export const trackingUrl = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;

/* -------------------------------------------------------------------------- */
/* Booking                                                                      */
/* -------------------------------------------------------------------------- */

export type ParcelOrder = {
  orderNumber: string;
  createdAt: Date;
  email: string;
  cod: boolean;
  totalPaise: number;
  address: {
    fullName: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
  };
  items: { name: string; sku: string; quantity: number; unitPaise: number }[];
};

export type BookedShipment = {
  provider: 'shiprocket';
  srOrderId: number;
  shipmentId: number;
  awb: string;
  courierName: string;
  labelUrl: string | null;
  pickupScheduled: boolean;
  /** Latest tracking status from the courier, updated by the webhook. */
  statusId: number | null;
  statusLabel: string | null;
  updatedAt: string;
};

export type BookingResult = { ok: true; shipment: BookedShipment } | { ok: false; error: string };

type Fetch = typeof fetch;

// One token per server instance. Shiprocket tokens last 10 days; refresh after 9.
let cachedToken: { value: string; expires: number; email: string } | null = null;
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

/** Test hook: forget the cached login. */
export function resetShiprocketToken(): void {
  cachedToken = null;
}

async function login(config: ShiprocketConfig, fetchImpl: Fetch): Promise<string> {
  if (cachedToken && cachedToken.email === config.email && cachedToken.expires > Date.now()) return cachedToken.value;
  const res = await fetchImpl(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string };
  if (!res.ok || !body.token) throw new Error(`Shiprocket sign-in failed (${res.status})`);
  cachedToken = { value: body.token, expires: Date.now() + TOKEN_TTL_MS, email: config.email };
  return body.token;
}

/** One authenticated call; a 401 (token revoked early) signs in again once. */
async function call<T>(config: ShiprocketConfig, fetchImpl: Fetch, path: string, payload: unknown): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await login(config, fetchImpl);
    const res = await fetchImpl(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 && attempt === 0) {
      cachedToken = null;
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(`Shiprocket ${path} failed (${res.status}): ${body.message ?? 'no detail'}`);
    return body;
  }
  throw new Error(`Shiprocket ${path}: not authorised`);
}

const rupees = (paise: number) => Math.round(paise) / 100;
const tenDigits = (phone: string) => phone.replace(/\D/g, '').slice(-10);

/** `YYYY-MM-DD HH:mm` in India time, the format Shiprocket expects. */
function orderDate(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16).replace('T', ' ');
}

export function adhocOrderPayload(order: ParcelOrder, config: ShiprocketConfig) {
  const [first, ...rest] = order.address.fullName.trim().split(/\s+/);
  return {
    order_id: order.orderNumber,
    order_date: orderDate(order.createdAt),
    pickup_location: config.pickupLocation,
    billing_customer_name: first,
    billing_last_name: rest.join(' '),
    billing_address: order.address.line1,
    billing_address_2: order.address.line2 ?? '',
    billing_city: order.address.city,
    billing_pincode: order.address.postalCode,
    billing_state: order.address.state,
    billing_country: 'India',
    billing_email: order.email,
    billing_phone: tenDigits(order.address.phone),
    shipping_is_billing: true,
    order_items: order.items.map((i) => ({
      name: i.name,
      sku: i.sku,
      units: i.quantity,
      selling_price: rupees(i.unitPaise),
    })),
    payment_method: order.cod ? 'COD' : 'Prepaid',
    sub_total: rupees(order.totalPaise),
    length: config.parcel.lengthCm,
    breadth: config.parcel.breadthCm,
    height: config.parcel.heightCm,
    weight: config.parcel.weightKg,
  };
}

/**
 * Books one parcel end to end. Shiprocket picks the courier by the account's
 * courier priority (no `courier_id` is sent), which is set in its dashboard.
 *
 * Creating the order and assigning the AWB must succeed; pickup and label are
 * best effort, because both can be redone from the Shiprocket panel and
 * neither should leave a booked, paid-for AWB unrecorded here.
 */
export async function bookShipment(
  order: ParcelOrder,
  config: ShiprocketConfig,
  fetchImpl: Fetch = fetch
): Promise<BookingResult> {
  try {
    const created = await call<{ order_id?: number; shipment_id?: number; message?: string }>(
      config,
      fetchImpl,
      '/orders/create/adhoc',
      adhocOrderPayload(order, config)
    );
    if (!created.order_id || !created.shipment_id) {
      return { ok: false, error: `Shiprocket did not create the order: ${created.message ?? 'no detail'}` };
    }

    const assigned = await call<{
      awb_assign_status?: number;
      message?: string;
      response?: { data?: { awb_code?: string; courier_name?: string } };
    }>(config, fetchImpl, '/courier/assign/awb', { shipment_id: created.shipment_id });
    const awb = assigned.response?.data?.awb_code;
    if (assigned.awb_assign_status !== 1 || !awb) {
      return {
        ok: false,
        error: `No courier could take this parcel yet: ${assigned.message ?? 'Shiprocket gave no reason'}. Check the PIN code, or retry from the Shiprocket panel.`,
      };
    }

    let pickupScheduled = false;
    try {
      await call(config, fetchImpl, '/courier/generate/pickup', { shipment_id: [created.shipment_id] });
      pickupScheduled = true;
    } catch {
      /* rescheduled from the Shiprocket panel if needed */
    }

    let labelUrl: string | null = null;
    try {
      const label = await call<{ label_url?: string }>(config, fetchImpl, '/courier/generate/label', {
        shipment_id: [created.shipment_id],
      });
      labelUrl = label.label_url ?? null;
    } catch {
      /* downloadable from the Shiprocket panel */
    }

    return {
      ok: true,
      shipment: {
        provider: 'shiprocket',
        srOrderId: created.order_id,
        shipmentId: created.shipment_id,
        awb,
        courierName: assigned.response?.data?.courier_name ?? 'Courier',
        labelUrl,
        pickupScheduled,
        statusId: 1,
        statusLabel: 'AWB Assigned',
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Shiprocket is unreachable.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Tracking                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What a Shiprocket shipment status means for our order.
 *
 * Only the statuses that change what the customer is told are mapped; the
 * rest (label generated, manifest, pickup queued…) are recorded on the
 * shipment but leave the order where it is. `problem` flags the order for the
 * owner without moving it.
 */
export type TrackingEffect =
  | { kind: 'status'; status: 'shipped' | 'out_for_delivery' | 'delivered' | 'returned' }
  | { kind: 'problem'; reason: string }
  | { kind: 'none' };

const SHIPPED = new Set([6, 18, 22, 38, 42, 48, 51]); // shipped, in transit, delayed, at destination, picked up, at warehouse, handed over
const PROBLEMS: Record<number, string> = {
  12: 'The courier reports this parcel as lost.',
  21: 'The courier could not deliver this parcel. Call the customer before it goes back.',
  24: 'The courier reports this parcel destroyed.',
  25: 'The courier reports this parcel damaged.',
  9: 'The parcel is being sent back to us (return to origin).',
  76: 'The courier cannot trace this parcel.',
};

export function trackingEffect(statusId: number): TrackingEffect {
  if (SHIPPED.has(statusId)) return { kind: 'status', status: 'shipped' };
  if (statusId === 17) return { kind: 'status', status: 'out_for_delivery' };
  if (statusId === 7) return { kind: 'status', status: 'delivered' };
  if (statusId === 10) return { kind: 'status', status: 'returned' }; // RTO delivered: back with us
  if (PROBLEMS[statusId]) return { kind: 'problem', reason: PROBLEMS[statusId] };
  return { kind: 'none' };
}

/**
 * Whether an order may move from `from` to `to` on a courier update.
 *
 * Forward only, because updates can arrive late and out of order: a delayed
 * "in transit" must never pull a delivered order back. A return is accepted
 * from any point after the parcel left us.
 */
const RANK: Record<string, number> = {
  paid: 0,
  pending: 0,
  fulfilled: 1,
  shipped: 2,
  out_for_delivery: 3,
  delivered: 4,
};
export function canAdvance(from: string, to: string): boolean {
  if (to === 'returned') return from === 'shipped' || from === 'out_for_delivery' || from === 'fulfilled';
  return from in RANK && to in RANK && RANK[to] > RANK[from];
}

export type TrackingUpdate = { awb: string; statusId: number; statusLabel: string };

/** Reads the fields we use out of a webhook body, or null if it is not a tracking update. */
export function parseTrackingUpdate(body: unknown): TrackingUpdate | null {
  const b = body as {
    awb?: unknown;
    shipment_status_id?: unknown;
    shipment_status?: unknown;
    current_status?: unknown;
  };
  const awb = typeof b?.awb === 'string' || typeof b?.awb === 'number' ? String(b.awb).trim() : '';
  const statusId = Number(b?.shipment_status_id);
  if (!awb || !Number.isInteger(statusId)) return null;
  return { awb, statusId, statusLabel: String(b.shipment_status ?? b.current_status ?? '') };
}

import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db';
import { orders } from '@/db/schema';

/**
 * Risk scoring for cash on delivery.
 *
 * A prepaid order that turns out to be fake costs a refund. A COD order that
 * turns out to be fake costs the picking, the packing, the courier out, the
 * courier back, and a product that may not be resaleable — all spent before
 * anyone discovers there was never a customer. That asymmetry is why this runs
 * *before* the stockroom sees the order rather than as a report afterwards.
 *
 * Every signal here is computed from data already held: no phone-verification
 * API, no external scoring service, nothing with a bill attached. That is a
 * deliberate constraint rather than a limitation to apologise for — the
 * signals that catch the most fraud per rupee (junk addresses, order velocity,
 * a number with a history of refusing parcels) are all local. A paid
 * phone-intelligence lookup would be a sixth signal, not a replacement.
 *
 * Nothing here is ever shown to the customer. Telling someone which signal
 * flagged them is telling them exactly what to change.
 */

export type RiskSignal = {
  /** Stable identifier, so a reviewer sees the same wording every time. */
  code:
    | 'address_incomplete'
    | 'address_junk'
    | 'velocity'
    | 'prior_returns'
    | 'high_value_first_order';
  /** Plain-language reason, shown to staff reviewing a held order. */
  reason: string;
  /** 0-100 severity of this one signal. */
  weight: number;
};

export type RiskInput = {
  email: string;
  phone: string;
  totalPaise: number;
  address: {
    fullName: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
};

export type RiskStatus = 'approved' | 'review' | 'rejected';

export type RiskAssessment = {
  score: number;
  status: RiskStatus;
  signals: RiskSignal[];
};

/** Repeated characters, keyboard mashing, or obvious placeholder words. */
const JUNK_PATTERNS = [
  /(.)\1{4,}/i,
  /\b(asdf|qwer|zxcv|test|abcd|xyz|dummy|nil)\b/i,
  /^\W+$/,
];

/**
 * Does the address describe somewhere a courier could actually stand?
 *
 * A real Indian address nearly always carries a number — a flat, a house, a
 * plot, a building. Its absence is the strongest cheap signal that an address
 * was typed to get past a form rather than to receive a parcel.
 */
export function scoreAddress(address: RiskInput['address']): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const full = [address.line1, address.line2, address.city].filter(Boolean).join(' ');

  const hasNumber = /\d/.test(`${address.line1} ${address.line2 ?? ''}`);
  const longEnough = full.replace(/\s+/g, '').length >= 15;

  if (!hasNumber || !longEnough) {
    signals.push({
      code: 'address_incomplete',
      reason: hasNumber
        ? 'Address is unusually short for a deliverable address.'
        : 'No house, flat or building number in the address.',
      weight: 35,
    });
  }

  const junky = [address.fullName, address.line1, address.city].some((field) =>
    JUNK_PATTERNS.some((pattern) => pattern.test(field))
  );

  if (junky) {
    signals.push({
      code: 'address_junk',
      reason: 'Name or address looks like filler text rather than real details.',
      weight: 50,
    });
  }

  return signals;
}

/**
 * How many cash-on-delivery orders this person has placed in the last day.
 *
 * The pattern being caught is one person placing many COD orders in a burst —
 * a prank, a competitor, or a bot working through a flash sale. A genuine
 * customer occasionally places two; nobody legitimately places six.
 *
 * Matched on phone *or* email, because changing one and not the other is the
 * laziest and therefore most common evasion.
 */
export async function scoreVelocity(email: string, phone: string): Promise<RiskSignal[]> {
  if (!isDatabaseConfigured()) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.paymentProvider, 'cod'),
        gte(orders.createdAt, since),
        sql`(${orders.email} = ${email} OR right(regexp_replace(coalesce(${orders.shippingAddress}->>'phone', ''), '\\D', '', 'g'), 10) = ${phone})`
      )
    );

  const count = row?.count ?? 0;
  if (count < 3) return [];

  return [
    {
      code: 'velocity',
      reason: `${count} cash-on-delivery orders from this customer in the last 24 hours.`,
      weight: Math.min(30 + (count - 3) * 15, 70),
    },
  ];
}

/**
 * Has this customer refused parcels before?
 *
 * Return-to-origin history is the only signal here with real predictive power
 * rather than heuristic suspicion: someone who has sent back three of four COD
 * orders will very likely send back the fourth. It is also the signal that
 * takes longest to become useful, because it needs the shop to have a history
 * at all. On day one it fires for nobody, and that is correct.
 */
export async function scoreHistory(
  email: string,
  phone: string
): Promise<{ signals: RiskSignal[]; priorOrders: number }> {
  if (!isDatabaseConfigured()) return { signals: [], priorOrders: 0 };

  const [row] = await db
    .select({
      placed: sql<number>`count(*)::int`,
      returned: sql<number>`count(*) filter (where ${orders.status} = 'returned')::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.paymentProvider, 'cod'),
        ne(orders.status, 'pending'),
        sql`(${orders.email} = ${email} OR right(regexp_replace(coalesce(${orders.shippingAddress}->>'phone', ''), '\\D', '', 'g'), 10) = ${phone})`
      )
    );

  const placed = row?.placed ?? 0;
  const returned = row?.returned ?? 0;

  /*
   * Below three completed orders the ratio is noise: one return out of one
   * order is not a 100% return rate, it is a single bad day. Acting on it
   * would punish a new customer for the one time a courier could not find
   * them.
   */
  if (placed < 3 || returned === 0) return { signals: [], priorOrders: placed };

  const rate = returned / placed;
  if (rate < 0.4) return { signals: [], priorOrders: placed };

  return {
    signals: [
      {
        code: 'prior_returns',
        reason: `${returned} of ${placed} previous cash-on-delivery orders came back undelivered.`,
        weight: Math.round(Math.min(rate, 1) * 80),
      },
    ],
    priorOrders: placed,
  };
}

/**
 * An unusually large first order, paid on delivery.
 *
 * Weak on its own — a generous first-time customer looks identical to a fake
 * one. It earns its place as corroboration for the other signals rather than
 * as grounds for anything by itself, which is a decision the scoring function
 * makes, not this one.
 */
export function scoreBasket(totalPaise: number, priorOrders: number): RiskSignal[] {
  const FIRST_ORDER_CEILING = 400_000; // Rupees 4,000, in paise.

  if (priorOrders > 0 || totalPaise < FIRST_ORDER_CEILING) return [];

  return [
    {
      code: 'high_value_first_order',
      reason: 'Large first order with no purchase history, paid on delivery.',
      weight: 25,
    },
  ];
}

/** Bare 10 digits, so +91 and a leading zero compare equal. */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Combines the signals into one decision.
 *
 * Deliberately separate from the signal functions above: those measure, this
 * one judges. Retuning how cautious the shop is should never mean touching the
 * measurements.
 */
export function combineSignals(signals: RiskSignal[]): RiskAssessment {
  // TODO(human): turn `signals` into a { score, status, signals } assessment.
  //
  // Each signal carries a `weight` from 0-100. Produce a single 0-100 `score`
  // and one of three statuses:
  //   'approved' — goes straight to the stockroom
  //   'review'   — held; the customer is asked to confirm before it is picked
  //   'rejected' — cancelled, stock released, customer told
  //
  // Worth deciding deliberately:
  //  - Summing weights reaches 100 fast and rejects real customers. Capping,
  //    or taking the strongest signal plus a fraction of the rest, is gentler.
  //  - Should any single signal reject on its own, or should rejection always
  //    need a second signal agreeing?
  //  - Which way should a near-miss fall? A wrong 'review' costs one message.
  //    A wrong 'rejected' costs a real customer, permanently.
  return { score: 0, status: 'approved', signals };
}

/**
 * Scores a cash-on-delivery order.
 *
 * Prepaid orders never reach here: the money has already moved, so there is
 * nothing left to protect against.
 */
export async function assessCodOrder(input: RiskInput): Promise<RiskAssessment> {
  const phone = normalisePhone(input.phone);

  const [velocity, history] = await Promise.all([
    scoreVelocity(input.email, phone),
    scoreHistory(input.email, phone),
  ]);

  const signals = [
    ...scoreAddress(input.address),
    ...velocity,
    ...history.signals,
    ...scoreBasket(input.totalPaise, history.priorOrders),
  ];

  return combineSignals(signals);
}

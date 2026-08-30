import { db, isDatabaseConfigured } from '@/db';
import { reportError } from '@/lib/observability';
import { activityEvents, routineResults } from '@/db/schema';

/**
 * Behavioural events and saved routine results.
 *
 * Both tables existed but nothing wrote to them, so the site collected no
 * record of what customers actually did.
 *
 * Two rules:
 *
 *  - Recording is best-effort and never blocks the customer. If analytics
 *    writes fail, the page still works; losing an event is acceptable, losing
 *    a sale is not.
 *  - No personal data in `props`. Events are for understanding behaviour, and
 *    a JSON blob is exactly where PII quietly accumulates and then has to be
 *    purged under a deletion request.
 */

export type EventName =
  | 'product_viewed'
  | 'product_added_to_cart'
  | 'cart_viewed'
  | 'checkout_started'
  | 'order_placed'
  | 'routine_completed'
  | 'search_performed';

export type ActivityInput = {
  name: EventName;
  props?: Record<string, string | number | boolean | null>;
  path?: string;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
};

/** Fields that must never reach the events table. */
const FORBIDDEN_PROP_KEYS = new Set([
  'email',
  'phone',
  'name',
  'fullname',
  'address',
  'line1',
  'line2',
  'postalcode',
  'password',
  'token',
  'card',
]);

function sanitiseProps(props: ActivityInput['props']): Record<string, unknown> | null {
  if (!props) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_PROP_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string' && value.length > 200) continue;
    clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

/**
 * Records an event. Never throws — a failed write must not break the request
 * that triggered it.
 */
export async function recordEvent(input: ActivityInput): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    await db.insert(activityEvents).values({
      name: input.name,
      props: sanitiseProps(input.props),
      path: input.path?.slice(0, 500) ?? null,
      userId: input.userId ?? null,
      anonymousId: input.anonymousId ?? null,
      sessionId: input.sessionId ?? null,
    });
  } catch (err) {
    reportError(err, { scope: 'activity.recordEvent' });
  }
}

/**
 * Saves a routine-finder result so a customer can return to it, and so the
 * answers can inform which products to stock.
 *
 * Returns the row id, which is how a saved routine gets a shareable link.
 */
export async function saveRoutineResult(params: {
  answers: unknown;
  result: unknown;
  userId?: string | null;
  anonymousId?: string | null;
}): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    const [row] = await db
      .insert(routineResults)
      .values({
        answers: params.answers as never,
        result: params.result as never,
        userId: params.userId ?? null,
        anonymousId: params.anonymousId ?? null,
      })
      .returning({ id: routineResults.id });

    return row?.id ?? null;
  } catch (err) {
    reportError(err, { scope: 'activity.saveRoutineResult' });
    return null;
  }
}

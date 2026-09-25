import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { drain, type DomainEvent, type DrainResult } from '@/lib/events';
import { getOrderByNumber, restoreOrderStock } from '@/lib/orders';
import { notifyOrderPlaced } from '@/lib/order-notifications';
import { createOrderAccessToken } from '@/lib/order-access';
import { assessCodOrder } from '@/lib/cod-risk';
import { revalidateContent, revalidateProduct } from '@/lib/storefront-cache';
import { eventStreamProducer } from '@/infrastructure/streaming/producer';
import { streamRelay } from '@/modules/analytics/stream-relay';
import { reportError } from '@/lib/observability';

/**
 * The consumers.
 *
 * Each keeps its own offset, which is the whole point of a log rather than a
 * job queue: the notifier having a bad afternoon with an email provider does
 * not hold up the risk gate, and neither of them can hold up checkout. Adding
 * a sixth consumer later costs nothing on the checkout path — that is the
 * property being bought, and the reason this indirection is worth its weight.
 *
 * Events carry an order id and nothing else. The consumer re-reads the order,
 * so it always acts on current state rather than on a snapshot that may be
 * minutes stale by the time it runs.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://avyora-beauty.vercel.app';

/* -------------------------------------------------------------------------- */
/* Notifications                                                                */
/* -------------------------------------------------------------------------- */

async function handleNotification(event: DomainEvent): Promise<void> {
  if (event.name !== 'order.placed') return;

  const orderNumber = String(event.payload.orderNumber ?? '');
  if (!orderNumber) return;

  const order = await getOrderByNumber(orderNumber);
  if (!order) return;

  const address = (order.shippingAddress ?? {}) as Record<string, string>;
  const token = await createOrderAccessToken(orderNumber).catch(() => null);

  const outcome = await notifyOrderPlaced({
    orderNumber,
    email: order.email,
    customerName: address.fullName ?? 'there',
    total: order.total,
    paymentProvider: order.paymentProvider,
    paid: order.paymentStatus === 'paid',
    items: order.items.map((i) => ({
      productName: i.productName,
      size: i.size,
      quantity: i.quantity,
    })),
    address,
    orderUrl: token
      ? `${SITE}/orders/${orderNumber}?t=${encodeURIComponent(token)}`
      : `${SITE}/orders/${orderNumber}`,
  });

  /*
   * A send that failed must not be recorded as delivered.
   *
   * `notifyOrderPlaced` never throws — correct, because it must not be able to
   * fail an order — but this consumer was discarding its result, so a customer
   * whose confirmation was rejected left no trace except a log line. The
   * delivery row said `done`, and the retry machinery built for exactly this
   * never ran.
   *
   * Throwing here hands the event back to `drain`, which records the failure
   * and retries up to MAX_ATTEMPTS before leaving it visibly stuck. Only the
   * customer's own email is worth failing over: the owner's copy going astray
   * is a nuisance, the customer never hearing that their order exists is the
   * thing that generates a support message and a chargeback.
   */
  if (outcome.customerEmailAttempted && !outcome.customerEmailed) {
    throw new Error(`Confirmation email for ${orderNumber} was not accepted`);
  }
}

/* -------------------------------------------------------------------------- */
/* Cash-on-delivery risk gate                                                   */
/* -------------------------------------------------------------------------- */

async function handleCodRisk(event: DomainEvent): Promise<void> {
  if (event.name !== 'order.placed') return;

  const orderId = String(event.payload.orderId ?? '');
  const orderNumber = String(event.payload.orderNumber ?? '');
  if (!orderId || !orderNumber) return;

  const order = await getOrderByNumber(orderNumber);
  if (!order || order.paymentProvider !== 'cod') return;

  // Already decided. Re-running would be harmless but pointless, and a second
  // rejection must not try to release stock twice.
  if (order.fraudStatus !== 'pending') return;

  const address = (order.shippingAddress ?? {}) as Record<string, string>;

  const assessment = await assessCodOrder({
    email: order.email,
    phone: address.phone ?? '',
    totalPaise: order.total,
    address: {
      fullName: address.fullName ?? '',
      line1: address.line1 ?? '',
      line2: address.line2 ?? null,
      city: address.city ?? '',
      state: address.state ?? '',
      postalCode: address.postalCode ?? '',
    },
  });

  await db
    .update(orders)
    .set({
      fraudStatus: assessment.status,
      fraudScore: assessment.score,
      fraudReasons: assessment.signals,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  /*
   * A rejected order must give its stock back.
   *
   * Without this the units sit reserved until the abandonment sweep notices,
   * and for cash on delivery the sweep deliberately never does — a COD order
   * is unpaid by design, so it is excluded there. Rejecting without releasing
   * would quietly consume real stock on every fake order, which is precisely
   * the cost this gate exists to prevent.
   */
  if (assessment.status === 'rejected') {
    await restoreOrderStock(orderId);
    await db
      .update(orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }
}

/* -------------------------------------------------------------------------- */
/* Cache invalidation                                                           */
/* -------------------------------------------------------------------------- */

async function handleRevalidation(event: DomainEvent): Promise<void> {
  if (event.name === 'content.published' || event.name === 'content.unpublished') {
    const type = String(event.payload.type ?? '');
    const slug = String(event.payload.slug ?? '');
    if (type && slug) await revalidateContent(type, slug);
    return;
  }

  // Every event that can change what a customer sees for a product.
  const relevant: ReadonlyArray<DomainEvent['name']> = [
    'inventory.stock_out',
    'inventory.changed',
    'pricing.changed',
  ];
  if (!relevant.includes(event.name)) return;

  const productId = String(event.payload.productId ?? '');
  if (!productId) return;

  /*
   * Product pages are statically regenerated on a 60-second timer, which is
   * fine for prose and wrong for availability: a sold-out serum stays buyable
   * for up to a minute, and every one of those orders fails at checkout after
   * the customer has typed their address. Pushing the invalidation the moment
   * stock hits zero closes that window to about as long as this drain takes.
   */
  await revalidateProduct(productId);
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                       */
/* -------------------------------------------------------------------------- */

const producer = eventStreamProducer();

const CONSUMERS: { name: string; handle: (e: DomainEvent) => Promise<void> }[] = [
  { name: 'notifications', handle: handleNotification },
  { name: 'cod-risk', handle: handleCodRisk },
  { name: 'revalidate', handle: handleRevalidation },
  /*
   * Copies events to Kafka, only when a stream is configured. Registered as
   * a consumer the first time it runs, it starts at the head of the log:
   * wiring up a stream does not replay the shop's history into it (the
   * landing zone already holds that).
   */
  ...(producer ? [{ name: 'stream-relay', handle: streamRelay(producer) }] : []),
];

/**
 * Runs every consumer once.
 *
 * Sequential rather than parallel: on a serverless function each consumer
 * opening its own pooled connection at once is a good way to exhaust the
 * pool, and there is no deadline pressure here — this runs after the customer
 * already has their response.
 */
export async function drainAll(): Promise<DrainResult[]> {
  const results: DrainResult[] = [];

  for (const consumer of CONSUMERS) {
    results.push(await drain(consumer.name, consumer.handle));
  }

  return results;
}

/**
 * Drains without ever throwing into the caller.
 *
 * Used from `after()`, where the work runs once the response has already been
 * flushed. An exception there cannot reach the customer — it can only produce
 * an unhandled rejection and a confusing log line — so it is caught and
 * reported here instead.
 */
export async function drainQuietly(): Promise<void> {
  try {
    await drainAll();
  } catch (err) {
    reportError(err, { scope: 'events.drainQuietly' });
  }
}

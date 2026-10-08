import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { orderItems, orders, paymentEvents } from '@/db/schema';
import { releaseStock, reserveStock } from '@/lib/inventory';
import { emitEvent } from '@/lib/events';
import { currentRequestId } from '@/infrastructure/request-context';
import type { Tx } from '@/infrastructure/idempotency/idempotency';
import { decide, type Decision, type PaymentSignal, type PaymentState } from './state-machine';

/**
 * Applying payment signals to orders.
 *
 * `state-machine.ts` decides; this carries the decision out. Everything for
 * one signal happens in one transaction with the order row locked
 * (`SELECT … FOR UPDATE`), so the webhook and the browser callback for the
 * same payment — which routinely arrive within milliseconds of each other —
 * are applied one after the other rather than both reading "unpaid".
 */

export type AppliedSignal = Decision & {
  orderId: string;
  /** Set when the outcome needs a person; also written to the order. */
  attention: string | null;
};

class StockUnavailable extends Error {}

const ATTENTION_OVERSOLD =
  'Payment was captured after this order’s stock had been released, and the stock has since sold. ' +
  'Refund the customer or fulfil from a backorder.';

const ATTENTION_PAID_AFTER_CANCEL =
  'Payment arrived after this order was cancelled. The stock has been reserved again; ' +
  'confirm with the customer before sending.';

export async function applyPaymentSignalInTx(
  tx: Tx,
  orderId: string,
  signal: PaymentSignal
): Promise<AppliedSignal | null> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for('update')
    .limit(1);

  if (!order) return null;

  const decision = decide(order.paymentStatus as PaymentState, signal, {
    orderTotal: order.total,
    stockReleased: order.stockRestoredAt !== null,
  });

  if (decision.outcome !== 'applied') return { ...decision, orderId, attention: null };

  const lines = (await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId))).map(
    (i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })
  );

  let stockRestoredAt = order.stockRestoredAt;
  let attention: string | null = null;

  if (decision.stock === 'release' && stockRestoredAt === null) {
    await releaseStock(lines, tx as never);
    stockRestoredAt = new Date();
  }

  if (decision.stock === 'reacquire') {
    /*
     * A savepoint, because `reserveStock` decrements line by line and reports
     * a shortfall only after the earlier lines have already been taken. Inside
     * checkout the whole transaction rolls back; here it must not, because the
     * payment itself has to be recorded either way. Rolling back to the
     * savepoint undoes the partial reservation and nothing else.
     */
    try {
      await tx.transaction(async (savepoint) => {
        const reserved = await reserveStock(lines, savepoint as never);
        if (!reserved.ok) throw new StockUnavailable();
      });
      stockRestoredAt = null;
    } catch (err) {
      if (!(err instanceof StockUnavailable)) throw err;
      attention = ATTENTION_OVERSOLD;
    }
  }

  let status = order.status;
  if (decision.next === 'paid' || decision.next === 'authorized') {
    if (order.status === 'cancelled') {
      attention = attention ?? ATTENTION_PAID_AFTER_CANCEL;
      status = 'paid';
    } else if (order.status === 'pending') {
      status = 'paid';
    }
  }

  await tx
    .update(orders)
    .set({
      paymentStatus: decision.next,
      status,
      stockRestoredAt,
      attentionReason: attention ?? order.attentionReason,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  const requestId = await currentRequestId();
  const eventName =
    decision.next === 'paid'
      ? 'order.paid'
      : decision.next === 'failed'
        ? 'order.payment_failed'
        : decision.next === 'refunded'
          ? 'order.refunded'
          : null;

  if (eventName) {
    await emitEvent(eventName, orderId, { orderId, orderNumber: order.orderNumber }, tx, requestId);
  }
  if (attention) {
    await emitEvent(
      'order.needs_attention',
      orderId,
      { orderId, orderNumber: order.orderNumber, reason: attention },
      tx,
      requestId
    );
  }

  return { ...decision, orderId, attention };
}

export async function applyPaymentSignal(
  orderId: string,
  signal: PaymentSignal
): Promise<AppliedSignal | null> {
  return db.transaction((tx) => applyPaymentSignalInTx(tx, orderId, signal));
}

/* -------------------------------------------------------------------------- */
/* Provider events                                                              */
/* -------------------------------------------------------------------------- */

export type ProviderEventInput = {
  provider: string;
  /** The provider's own id for this delivery. The deduplication key. */
  providerEventId: string;
  eventType: string;
  /** The reference stored on our order when the payment session opened. */
  providerOrderRef: string;
  providerPaymentId: string | null;
  amount: number | null;
  payload: unknown;
  /** What this event means for the order, or null if it means nothing. */
  signal: PaymentSignal | null;
};

export type ProviderEventResult =
  | { status: 'unknown_order' }
  | { status: 'duplicate' }
  | { status: 'processed'; applied: AppliedSignal | null };

/**
 * Records a provider event and applies it, exactly once.
 *
 * The event row and the state change commit together. A duplicate delivery
 * conflicts on the provider's event id and changes nothing; a delivery whose
 * transaction failed left no row, so the provider's retry is processed.
 *
 * An event for an order we cannot find is **not** recorded. The webhook may
 * have outrun our own checkout commit, and recording it would make the retry
 * look like a duplicate and be discarded.
 */
export async function recordProviderEvent(input: ProviderEventInput): Promise<ProviderEventResult> {
  const requestId = await currentRequestId();

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.paymentReference, input.providerOrderRef))
      .limit(1);

    if (!order) return { status: 'unknown_order' } as const;

    const inserted = await tx
      .insert(paymentEvents)
      .values({
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        orderId: order.id,
        providerPaymentId: input.providerPaymentId,
        amount: input.amount,
        payload: (input.payload ?? {}) as unknown,
        requestId,
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });

    if (inserted.length === 0) return { status: 'duplicate' } as const;

    const applied = input.signal ? await applyPaymentSignalInTx(tx, order.id, input.signal) : null;

    await tx
      .update(paymentEvents)
      .set({ outcome: applied ? (applied.attention ? 'attention' : applied.outcome) : 'ignored' })
      .where(eq(paymentEvents.id, inserted[0].id));

    return { status: 'processed', applied } as const;
  });
}

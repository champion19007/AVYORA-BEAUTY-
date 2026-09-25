/**
 * The payment state machine.
 *
 * Every change to an order's payment status goes through `decide`. It is a
 * pure function — current state and an incoming signal in, next state and the
 * stock consequence out — so every rule below is tested without a database.
 *
 *     unpaid ──session──▶ pending ──captured──▶ paid ──refunded──▶ refunded
 *        │                   │                   ▲
 *        │                   └──failed──▶ failed ─┘ captured (a later attempt)
 *        └──────────captured / authorized / failed──────────┘
 *
 * The rules that exist because the naive version was wrong:
 *
 *  1. **Paid is sticky.** Razorpay sends a webhook per payment *attempt*, not
 *     per order, and in no guaranteed order. A customer whose first UPI attempt
 *     fails and whose second succeeds can produce `captured` then `failed`.
 *     Once paid, a failure signal changes nothing. It used to release the stock
 *     of a paid order and mark it failed.
 *  2. **Failed is not final.** The reverse ordering — attempt one fails, attempt
 *     two captures — must still end paid. If the failure released the stock,
 *     the capture has to take it back, and if someone else has bought it in the
 *     meantime a person has to decide what happens.
 *  3. **The amount must match.** A capture for anything but the order total is
 *     rejected and recorded, never applied.
 *  4. **Silence is not failure.** Nothing in here moves an order to `failed`
 *     because a provider did not answer. That is reconciliation's job, and it
 *     treats "unknown" as its own outcome.
 */

export type PaymentState = 'unpaid' | 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded';

export type PaymentSignal =
  | { type: 'session_opened' }
  | { type: 'authorized'; amount?: number }
  | { type: 'captured'; amount: number }
  | { type: 'failed' }
  | { type: 'refunded' };

export type StockEffect = 'none' | 'release' | 'reacquire';

export type Decision = {
  next: PaymentState;
  stock: StockEffect;
  /** `applied` changed state; `ignored` was a valid no-op; `rejected` was refused. */
  outcome: 'applied' | 'ignored' | 'rejected';
  reason?: string;
};

export type DecisionContext = {
  orderTotal: number;
  /** Whether the order's stock has already gone back on the shelf. */
  stockReleased: boolean;
};

const OPEN: ReadonlyArray<PaymentState> = ['unpaid', 'pending', 'authorized', 'failed'];

export function decide(
  current: PaymentState,
  signal: PaymentSignal,
  context: DecisionContext
): Decision {
  const stay = (outcome: Decision['outcome'], reason: string): Decision => ({
    next: current,
    stock: 'none',
    outcome,
    reason,
  });

  switch (signal.type) {
    case 'session_opened':
      if (current === 'unpaid' || current === 'failed') {
        return { next: 'pending', stock: 'none', outcome: 'applied' };
      }
      return stay('ignored', `A payment session opened while the order was ${current}.`);

    case 'authorized':
      if (typeof signal.amount === 'number' && signal.amount !== context.orderTotal) {
        return stay('rejected', `Authorised ${signal.amount} against an order total of ${context.orderTotal}.`);
      }
      if (current === 'unpaid' || current === 'pending' || current === 'failed') {
        return {
          next: 'authorized',
          stock: context.stockReleased ? 'reacquire' : 'none',
          outcome: 'applied',
        };
      }
      return stay('ignored', `Authorisation arrived after the order was ${current}.`);

    case 'captured':
      if (signal.amount !== context.orderTotal) {
        return stay('rejected', `Captured ${signal.amount} against an order total of ${context.orderTotal}.`);
      }
      if (current === 'paid') return stay('ignored', 'Already paid; duplicate capture.');
      if (current === 'refunded') {
        return stay('rejected', 'A capture arrived for an order that was already refunded.');
      }
      return {
        next: 'paid',
        stock: context.stockReleased ? 'reacquire' : 'none',
        outcome: 'applied',
      };

    case 'failed':
      if (current === 'paid' || current === 'refunded') {
        // Rule 1: a failed attempt after a successful one changes nothing.
        return stay('ignored', `A failed attempt arrived after the order was ${current}.`);
      }
      if (current === 'failed') return stay('ignored', 'Already failed; duplicate failure.');
      return {
        next: 'failed',
        stock: context.stockReleased ? 'none' : 'release',
        outcome: 'applied',
      };

    case 'refunded':
      if (current === 'paid') return { next: 'refunded', stock: 'none', outcome: 'applied' };
      if (current === 'refunded') return stay('ignored', 'Already refunded.');
      return stay('rejected', `A refund arrived for an order that was ${current}, not paid.`);
  }
}

/** Whether a payment in this state could still turn into money. */
export function isOpen(state: PaymentState): boolean {
  return OPEN.includes(state);
}

import { describe, expect, it } from 'vitest';
import { decide, isOpen, type PaymentState } from '../state-machine';

/**
 * Every payment transition, without a database.
 *
 * Written from the orderings that actually happen. Razorpay reports each
 * payment *attempt* separately and does not order its webhooks, so a customer
 * who fails once and succeeds on retry can produce either sequence.
 */

const TOTAL = 87_800;
const held = { orderTotal: TOTAL, stockReleased: false };
const released = { orderTotal: TOTAL, stockReleased: true };

describe('payment state machine', () => {
  describe('a failure after a success', () => {
    it('leaves a paid order paid and its stock alone', () => {
      // The bug this module exists for: this used to release the stock of a
      // paid order and mark it failed.
      const d = decide('paid', { type: 'failed' }, held);
      expect(d).toMatchObject({ next: 'paid', stock: 'none', outcome: 'ignored' });
    });

    it('leaves a refunded order refunded', () => {
      expect(decide('refunded', { type: 'failed' }, held).next).toBe('refunded');
    });
  });

  describe('a success after a failure', () => {
    it('ends paid, and takes back stock the failure released', () => {
      const d = decide('failed', { type: 'captured', amount: TOTAL }, released);
      expect(d).toMatchObject({ next: 'paid', stock: 'reacquire', outcome: 'applied' });
    });

    it('does not reacquire stock that was never released', () => {
      const d = decide('pending', { type: 'captured', amount: TOTAL }, held);
      expect(d).toMatchObject({ next: 'paid', stock: 'none' });
    });
  });

  describe('the amount', () => {
    it('refuses a capture that does not match the order total', () => {
      const d = decide('pending', { type: 'captured', amount: TOTAL - 1 }, held);
      expect(d).toMatchObject({ next: 'pending', stock: 'none', outcome: 'rejected' });
    });

    it('refuses an authorisation that does not match', () => {
      const d = decide('pending', { type: 'authorized', amount: TOTAL + 100 }, held);
      expect(d.outcome).toBe('rejected');
    });
  });

  describe('duplicates', () => {
    it('treats a second capture as a no-op', () => {
      expect(decide('paid', { type: 'captured', amount: TOTAL }, held).outcome).toBe('ignored');
    });

    it('treats a second failure as a no-op and does not release twice', () => {
      const d = decide('failed', { type: 'failed' }, released);
      expect(d).toMatchObject({ outcome: 'ignored', stock: 'none' });
    });
  });

  describe('failure of an open payment', () => {
    it.each<PaymentState>(['unpaid', 'pending', 'authorized'])(
      'moves %s to failed and releases held stock',
      (state) => {
        expect(decide(state, { type: 'failed' }, held)).toMatchObject({
          next: 'failed',
          stock: 'release',
          outcome: 'applied',
        });
      }
    );
  });

  describe('sessions and refunds', () => {
    it('opens a session only from unpaid or failed', () => {
      expect(decide('unpaid', { type: 'session_opened' }, held).next).toBe('pending');
      expect(decide('failed', { type: 'session_opened' }, released).next).toBe('pending');
      expect(decide('paid', { type: 'session_opened' }, held).outcome).toBe('ignored');
    });

    it('refunds only a paid order', () => {
      expect(decide('paid', { type: 'refunded' }, held)).toMatchObject({
        next: 'refunded',
        outcome: 'applied',
      });
      expect(decide('pending', { type: 'refunded' }, held).outcome).toBe('rejected');
    });

    it('refuses a capture after a refund', () => {
      expect(decide('refunded', { type: 'captured', amount: TOTAL }, held).outcome).toBe(
        'rejected'
      );
    });
  });

  it('never leaves paid except by refund', () => {
    // Exhaustive: whatever arrives, a paid order is paid or refunded after it.
    const signals = [
      { type: 'session_opened' as const },
      { type: 'authorized' as const, amount: TOTAL },
      { type: 'captured' as const, amount: TOTAL },
      { type: 'failed' as const },
      { type: 'refunded' as const },
    ];
    for (const signal of signals) {
      for (const ctx of [held, released]) {
        expect(['paid', 'refunded']).toContain(decide('paid', signal, ctx).next);
      }
    }
  });

  it('knows which states can still become money', () => {
    expect(['unpaid', 'pending', 'authorized', 'failed'].every((s) => isOpen(s as PaymentState))).toBe(true);
    expect(isOpen('paid')).toBe(false);
    expect(isOpen('refunded')).toBe(false);
  });
});

describe('webhooks for orders we do not have', () => {
  it('asks for redelivery while the order may still be committing, then stops', async () => {
    const { shouldRetryUnknownOrder, UNKNOWN_ORDER_GRACE_MS } = await import('../payment-service');
    const now = 1_800_000_000_000;
    expect(shouldRetryUnknownOrder(now / 1000 - 5, now)).toBe(true);
    expect(shouldRetryUnknownOrder((now - UNKNOWN_ORDER_GRACE_MS - 1000) / 1000, now)).toBe(false);
    expect(shouldRetryUnknownOrder(null, now)).toBe(true);
  });
});

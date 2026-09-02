import { describe, expect, it } from 'vitest';
import { CUSTOMER_STEPS, orderProgress } from '@/lib/order-progress';

/**
 * The customer's view of an order's state.
 *
 * This mapping is what stops the storefront showing someone the word
 * "fulfilled" and inviting a support message asking what that means. The cases
 * below pin the two that are easy to get wrong: a cash-on-delivery order that
 * never leaves `pending` must still look like a live order, and a cancelled one
 * must leave the progress track rather than sitting at step one forever.
 */
describe('orderProgress', () => {
  it('walks the steps in order', () => {
    const sequence = ['paid', 'fulfilled', 'shipped', 'out_for_delivery', 'delivered'];
    const indexes = sequence.map((s) => orderProgress(s).currentIndex);

    expect(indexes).toEqual([0, 1, 2, 3, 4]);
    expect(indexes.at(-1)).toBe(CUSTOMER_STEPS.length - 1);
  });

  it('shows an unpaid cash-on-delivery order as placed, not stuck', () => {
    const progress = orderProgress('pending');

    expect(progress.label).toBe('Order placed');
    expect(progress.stopped).toBe(false);
    // pending and paid must look identical: the customer does not care whether
    // our payment webhook has landed.
    expect(progress.currentIndex).toBe(orderProgress('paid').currentIndex);
  });

  it('never shows an internal word to a customer', () => {
    for (const status of ['pending', 'paid', 'fulfilled', 'shipped', 'out_for_delivery']) {
      expect(CUSTOMER_STEPS).toContain(orderProgress(status).label as never);
    }
  });

  it('takes cancelled and refunded off the track', () => {
    for (const status of ['cancelled', 'refunded']) {
      const progress = orderProgress(status);
      expect(progress.stopped).toBe(true);
      expect(progress.currentIndex).toBe(-1);
    }
  });

  it('falls back to a real step for an unknown status', () => {
    const progress = orderProgress('something-new');

    // Must not render an empty tracker, and must not claim to be stopped.
    expect(progress.currentIndex).toBe(0);
    expect(progress.stopped).toBe(false);
    expect(progress.description).toBeTruthy();
  });

  it('gives every step a description', () => {
    for (const status of ['pending', 'fulfilled', 'shipped', 'out_for_delivery', 'delivered']) {
      expect(orderProgress(status).description.length).toBeGreaterThan(10);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { allowedNextStatuses } from '@/app/admin/actions';

/**
 * The fulfilment state machine.
 *
 * `updateOrderStatus` checks the requested transition against this map instead
 * of writing whatever the form posted. That check is the only thing stopping a
 * stale operator tab from marking a cancelled order shipped, or an order that
 * was never paid for delivered — the form is HTML, and its hidden field is
 * whatever the browser last rendered.
 *
 * These assertions pin the shape of the machine, so a later edit that opens a
 * transition has to do it deliberately rather than by widening a list.
 */
describe('order fulfilment transitions', () => {
  it('lets a paid order be packed or cancelled', async () => {
    expect(await allowedNextStatuses('paid')).toEqual(['fulfilled', 'cancelled']);
  });

  it('will not let an order skip straight to delivered', async () => {
    expect(await allowedNextStatuses('paid')).not.toContain('delivered');
    expect(await allowedNextStatuses('paid')).not.toContain('shipped');
  });

  it('will not ship an order that was never paid for', async () => {
    const next = await allowedNextStatuses('pending');
    expect(next).not.toContain('shipped');
    expect(next).not.toContain('fulfilled');
    // Cancelling an unpaid order is the one thing that makes sense.
    expect(next).toEqual(['cancelled']);
  });

  it('treats cancelled, delivered and refunded as final', async () => {
    expect(await allowedNextStatuses('cancelled')).toEqual([]);
    expect(await allowedNextStatuses('delivered')).toEqual([]);
    expect(await allowedNextStatuses('refunded')).toEqual([]);
  });

  it('runs packed → shipped → delivered in order', async () => {
    expect(await allowedNextStatuses('fulfilled')).toContain('shipped');
    expect(await allowedNextStatuses('shipped')).toEqual(['delivered']);
  });

  it('offers nothing for a status it does not know', async () => {
    // An unknown value must not fall through to "anything goes".
    expect(await allowedNextStatuses('not-a-status')).toEqual([]);
  });
});

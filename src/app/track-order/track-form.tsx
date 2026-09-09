'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { OrderTracker } from '@/components/order-tracker';
import { trackOrder, type TrackState } from './actions';

/**
 * Look up a real order.
 *
 * Asks for the email as well as the order number: the result reveals the
 * delivery town, and an order number on its own is short enough to guess.
 */
export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, {});

  if (state.found) {
    const { found } = state;

    return (
      <div>
        <p className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
          Order {found.orderNumber}
        </p>
        <h2 className="mt-2 font-headline text-3xl font-normal tracking-tight">
          {found.progress.label}
        </h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Placed {found.placedOn}
          {found.destination ? ` · to ${found.destination}` : ''}
        </p>

        <div className="mt-8">
          <OrderTracker status={statusFromLabel(found.progress)} />
        </div>

        <p className="mt-6 text-[13px] text-muted-foreground">
          Need the full details?{' '}
          <Link href="/login" className="text-primary underline underline-offset-4">
            Sign in
          </Link>{' '}
          with the email you ordered with, or use the link in your confirmation email.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="max-w-md space-y-5">
      <div>
        <Label htmlFor="orderNumber" className="text-[13px] font-medium">
          Order number
        </Label>
        <Input
          id="orderNumber"
          name="orderNumber"
          required
          autoFocus
          placeholder="AVY-2A4F91"
          className="mt-1.5 h-12 rounded-md"
        />
      </div>

      <div>
        <Label htmlFor="email" className="text-[13px] font-medium">
          Email used for the order
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1.5 h-12 rounded-md"
        />
      </div>

      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
      >
        {pending ? 'Looking up…' : 'Track order'}
      </Button>
    </form>
  );
}

/**
 * The tracker takes an internal status; the action returns a customer-facing
 * step. Mapping back keeps a second copy of the step list out of this file —
 * two lists would eventually disagree.
 */
function statusFromLabel(progress: TrackState['found'] extends undefined ? never : NonNullable<TrackState['found']>['progress']): string {
  if (progress.stopped) return progress.label === 'Refunded' ? 'refunded' : 'cancelled';

  return (
    ['paid', 'fulfilled', 'shipped', 'out_for_delivery', 'delivered'][progress.currentIndex] ??
    'paid'
  );
}

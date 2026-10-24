'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { bookCourierAction, type CourierFormState } from './actions';

/** "Book courier" for a packed order, with Shiprocket's answer shown in place. */
export function BookCourier({ orderNumber }: { orderNumber: string }) {
  const [state, action, pending] = useActionState<CourierFormState, FormData>(bookCourierAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <Button
        type="submit"
        disabled={pending}
        className="rounded-md px-5 py-5 text-[11px] font-semibold uppercase tracking-[0.16em]"
      >
        {pending ? 'Booking…' : 'Book courier'}
      </Button>
      {state.error && (
        <p role="alert" className="text-[13px] font-medium text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}

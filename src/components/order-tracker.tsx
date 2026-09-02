import { Check, XCircle } from 'lucide-react';
import { CUSTOMER_STEPS, orderProgress } from '@/lib/order-progress';
import { cn } from '@/lib/utils';

/**
 * The five-step progress bar a customer sees on their order.
 *
 * Steps are always all shown, with the ones not yet reached greyed rather than
 * hidden. Someone waiting for a parcel wants to know how much is left as much
 * as where it is now, and a tracker that reveals steps as they happen answers
 * only half of that.
 *
 * Cancelled and refunded orders leave the track entirely instead of sitting
 * greyed at step one, which would read as "still coming".
 */
export function OrderTracker({ status }: { status: string }) {
  const progress = orderProgress(status);

  if (progress.stopped) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-6">
        <p className="flex items-center gap-2 font-medium">
          <XCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {progress.label}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          {progress.description}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <ol className="flex flex-col gap-0 sm:flex-row sm:gap-2">
        {CUSTOMER_STEPS.map((step, index) => {
          const done = index < progress.currentIndex;
          const current = index === progress.currentIndex;

          return (
            <li key={step} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-start">
              {/* The connector doubles as the progress bar on wide screens. */}
              <span className="flex items-center gap-2 sm:w-full">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                    done && 'border-primary bg-primary text-primary-foreground',
                    current && 'border-primary text-primary',
                    !done && !current && 'border-border text-muted-foreground'
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="h-4 w-4" /> : index + 1}
                </span>

                {index < CUSTOMER_STEPS.length - 1 && (
                  <span
                    className={cn(
                      'hidden h-0.5 flex-1 sm:block',
                      index < progress.currentIndex ? 'bg-primary' : 'bg-border'
                    )}
                    aria-hidden="true"
                  />
                )}
              </span>

              <span
                className={cn(
                  'py-1 text-[13px] leading-snug sm:py-0',
                  current ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {step}
                {current && <span className="sr-only"> — current step</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 border-t border-border pt-4 text-[15px] leading-relaxed text-muted-foreground">
        {progress.description}
      </p>
    </div>
  );
}

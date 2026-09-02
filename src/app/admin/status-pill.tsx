import { cn } from '@/lib/utils';

/**
 * A coloured label for order state.
 *
 * Payment and fulfilment are shown as two separate pills and never merged into
 * one "status", because they answer different questions and can disagree: a
 * cash-on-delivery order is unpaid and perfectly ready to ship, while a paid
 * order may still be sitting unpacked. Collapsing them into a single word is
 * how an operator ends up shipping something that was never paid for.
 */

/** Amber means "someone needs to act", red means "something is wrong". */
const PAYMENT_TONE: Record<string, string> = {
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  authorized: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
  unpaid: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  refunded: 'bg-muted text-muted-foreground border-border',
};

const FULFILMENT_TONE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  paid: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  fulfilled: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
  shipped: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  delivered: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  refunded: 'bg-muted text-muted-foreground border-border',
};

/** Fulfilment "paid" means paid-but-unpacked, which reads oddly beside the payment pill. */
const FULFILMENT_LABEL: Record<string, string> = {
  paid: 'to fulfil',
};

export function StatusPill({
  kind,
  value,
}: {
  kind: 'payment' | 'fulfilment';
  value: string;
}) {
  const tone =
    kind === 'payment'
      ? (PAYMENT_TONE[value] ?? 'bg-muted text-muted-foreground border-border')
      : (FULFILMENT_TONE[value] ?? 'bg-muted text-muted-foreground border-border');

  const label = kind === 'fulfilment' ? (FULFILMENT_LABEL[value] ?? value) : value;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
        tone
      )}
    >
      {/* Say which axis this is, so the two pills are never confused. */}
      <span className="sr-only">{kind === 'payment' ? 'Payment: ' : 'Fulfilment: '}</span>
      {label}
    </span>
  );
}

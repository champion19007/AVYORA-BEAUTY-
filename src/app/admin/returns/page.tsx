import type { Metadata } from 'next';
import Link from 'next/link';
import { isDatabaseConfigured } from '@/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StockError } from '@/components/admin/stock-batches';
import { formatPaise } from '@/lib/money';
import { KIND_LABEL, listReturnCases, type ReturnCase, type ReturnKind } from '@/modules/returns/returns';
import { decideReturnAction, receiveReturnAction, refreshRefundAction, refundReturnAction } from './actions';

export const metadata: Metadata = { title: 'Returns & refunds' };
export const dynamic = 'force-dynamic';

const small = 'h-9 rounded-md px-4 text-sm';

const STATUS_LABEL: Record<string, string> = {
  requested: 'Waiting for your decision',
  approved: 'Approved, waiting for the parcel',
  received: 'Back and inspected, refund due',
  rejected: 'Rejected',
  refunded: 'Closed',
};

/** One form per action, the choice in a hidden field. */
function Act({
  action,
  id,
  fields,
  label,
  primary,
}: {
  action: (f: FormData) => Promise<void>;
  id: string;
  fields?: Record<string, string>;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {Object.entries(fields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={primary ? 'default' : 'outline'} className={small}>
        {label}
      </Button>
    </form>
  );
}

function Case({ c }: { c: ReturnCase }) {
  const { request: r, order } = c;
  const cod = order.paymentProvider === 'cod';
  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded';
  const canRefund =
    (r.status === 'received' || (r.status === 'approved' && r.kind !== 'unopened')) && r.refundStatus === null;
  const parcelDue = r.status === 'approved' && r.kind !== 'cancelled';

  return (
    <li className="space-y-3 p-5 text-[14px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium text-primary">
          {order.orderNumber}
        </Link>
        <span>{c.customerName}</span>
        <span className="text-muted-foreground">{KIND_LABEL[r.kind as ReturnKind]}</span>
        <span className="ml-auto text-[13px] font-medium">{STATUS_LABEL[r.status]}</span>
      </div>
      <p className="text-muted-foreground">
        {c.lines.map((l) => `${l.quantity} × ${l.name} (${l.size})`).join(', ')} ·{' '}
        {cod ? 'Cash on delivery' : 'Paid online'} · requested{' '}
        {r.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}
      </p>
      {r.customerNote && <p className="rounded-md bg-muted/50 p-3">“{r.customerNote}”</p>}

      {r.status === 'requested' && (
        <div className="flex flex-wrap items-center gap-2">
          <Act action={decideReturnAction} id={r.id} fields={{ decision: 'approve' }} label="Approve" primary />
          <form action={decideReturnAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="decision" value="reject" />
            <Input name="note" placeholder="Reason, sent to the customer" className="h-9 w-72 rounded-md" />
            <Button type="submit" variant="outline" className={small}>
              Reject
            </Button>
          </form>
        </div>
      )}

      {parcelDue && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Parcel back?</span>
          <Act action={receiveReturnAction} id={r.id} fields={{ restock: 'yes' }} label="Sealed: put back on sale" />
          <Act action={receiveReturnAction} id={r.id} fields={{ restock: 'no' }} label="Opened or damaged: write off" />
        </div>
      )}

      {canRefund && (
        <form action={refundReturnAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={r.id} />
          <label className="grid gap-1 text-[12px] text-muted-foreground">
            Refund (₹)
            <Input
              name="amount"
              type="number"
              step="0.01"
              min={0}
              defaultValue={(paid ? c.suggested : 0) / 100}
              className="h-9 w-32 rounded-md"
            />
          </label>
          {cod && paid && (
            <label className="grid gap-1 text-[12px] text-muted-foreground">
              UPI reference, after paying {r.refundTo ?? 'the customer'}
              <Input name="reference" className="h-9 w-56 rounded-md" />
            </label>
          )}
          <Button type="submit" className={small}>
            {!paid ? 'Close, nothing to refund' : cod ? 'Record UPI refund' : 'Refund through Cashfree'}
          </Button>
        </form>
      )}

      {r.status === 'refunded' && (
        <p className="text-muted-foreground">
          {r.refundAmount ? `Refunded ${formatPaise(r.refundAmount)}` : 'Closed with no refund'}
          {r.refundMethod === 'cashfree' && ` through Cashfree${r.refundReference ? ` (${r.refundReference})` : ''}`}
          {r.refundMethod === 'upi' && ` by UPI (${r.refundReference})`}
          {r.restockedUnits > 0 && ` · ${r.restockedUnits} back on sale`}
          {r.refundStatus === 'pending' && ' · Cashfree is still processing it'}
          {r.refundStatus === 'failed' && ' · Cashfree cancelled it: refund from the Cashfree dashboard'}
        </p>
      )}
      {r.refundStatus === 'pending' && r.status === 'refunded' && (
        <Act action={refreshRefundAction} id={r.id} label="Check refund status" />
      )}
      {r.status === 'rejected' && r.staffNote && <p className="text-muted-foreground">Reason given: {r.staffNote}</p>}
    </li>
  );
}

/**
 * Returns, cancellations that need a refund, and parcels the courier brought back.
 *
 * Laid out as a queue: open cases first, each showing only the next step it
 * needs, so nothing sits half-done because the right button was three clicks away.
 */
export default async function AdminReturnsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }
  const cases = await listReturnCases();
  const open = cases.filter((c) => ['requested', 'approved', 'received'].includes(c.request.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">Returns & refunds</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {open === 0 ? 'Nothing waiting.' : `${open} open.`} Sealed returns go back on sale into the batch they came
          from; anything opened or damaged is written off.
        </p>
      </div>
      <StockError error={error} />
      {cases.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          No returns yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {cases.map((c) => (
            <Case key={c.request.id} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

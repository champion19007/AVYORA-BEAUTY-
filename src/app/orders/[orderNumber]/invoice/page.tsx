import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { getOrderByNumber } from '@/lib/orders';
import { verifyOrderAccessToken } from '@/lib/order-access';
import { buildInvoice } from '@/lib/invoice';
import { formatPaise } from '@/lib/money';
import { PrintButton } from './print-button';

export const metadata: Metadata = {
  title: 'Tax invoice',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * A printable GST tax invoice.
 *
 * A page rather than a generated PDF: browsers print to PDF perfectly well,
 * this stays readable on a phone, and it avoids shipping a PDF toolchain into
 * a serverless function for a document most customers never open.
 *
 * Access is the same as the order page — the signed link or the customer's own
 * session. An invoice carries a name, a full address and a phone number, so an
 * order number alone must never be enough.
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNumber } = await params;
  const { t } = await searchParams;

  if (!isDatabaseConfigured()) notFound();

  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  const session = await auth().catch(() => null);
  const ownsOrder = Boolean(session?.user?.id && order.userId === session.user.id);
  const hasToken = await verifyOrderAccessToken(orderNumber, t);

  if (!ownsOrder && !hasToken) notFound();

  const invoice = buildInvoice({
    ...order,
    shippingAddress: order.shippingAddress as Record<string, string> | null,
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 print:px-0 print:py-0">
      <style>{`@media print { @page { margin: 16mm; } .no-print { display: none !important; } }`}</style>

      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-headline text-3xl font-normal tracking-tight">Tax invoice</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {invoice.invoiceNumber} · {invoice.issuedOn.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="text-right text-[13px] leading-relaxed">
          <p className="font-medium">{invoice.seller.name}</p>
          {invoice.seller.gstin ? (
            <p className="text-muted-foreground">GSTIN {invoice.seller.gstin}</p>
          ) : (
            /* Said plainly rather than left blank: an invoice without a GSTIN
               is not a valid tax invoice, and the seller needs to know. */
            <p className="text-destructive">GSTIN not configured</p>
          )}
          <p className="text-muted-foreground">{invoice.seller.state}</p>
        </div>
      </div>

      <div className="mb-8 border-y border-border py-5 text-[14px] leading-relaxed">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Billed to
        </p>
        <p className="mt-2 font-medium">{invoice.buyer.name}</p>
        {invoice.buyer.address.map((line, i) => (
          <p key={i} className="text-muted-foreground">
            {line}
          </p>
        ))}
        <p className="text-muted-foreground">{invoice.buyer.email}</p>
      </div>

      <table className="w-full text-left text-[14px]">
        <thead className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 font-semibold">HSN</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Rate</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoice.lines.map((line, i) => (
            <tr key={i}>
              <td className="py-3">
                {line.productName}
                <span className="block text-[12px] text-muted-foreground">{line.size}</span>
              </td>
              <td className="py-3 text-muted-foreground">{line.hsn}</td>
              <td className="py-3 text-right tabular-nums">{line.quantity}</td>
              <td className="py-3 text-right tabular-nums">{formatPaise(line.unitPrice)}</td>
              <td className="py-3 text-right tabular-nums">{formatPaise(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-6 space-y-1.5 border-t border-border pt-5 text-[14px]">
        <Row label="Taxable value" value={formatPaise(invoice.taxableValue)} />
        {invoice.split.intraState ? (
          <>
            <Row
              label={`CGST @ ${invoice.split.ratePercent / 2}%`}
              value={formatPaise(invoice.split.cgst)}
            />
            <Row
              label={`SGST @ ${invoice.split.ratePercent / 2}%`}
              value={formatPaise(invoice.split.sgst)}
            />
          </>
        ) : (
          <Row
            label={`IGST @ ${invoice.split.ratePercent}%`}
            value={formatPaise(invoice.split.igst)}
          />
        )}
        {invoice.shipping > 0 && <Row label="Delivery" value={formatPaise(invoice.shipping)} />}
        <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPaise(invoice.total)}</dd>
        </div>
      </dl>

      <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">
        Prices are inclusive of GST. {invoice.paid ? 'Paid.' : 'Payment due on delivery.'}
        {' '}This is a computer-generated invoice and needs no signature.
      </p>

      <PrintButton />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

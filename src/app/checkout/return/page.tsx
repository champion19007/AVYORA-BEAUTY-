'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useApp } from '@/lib/store';

/**
 * Where Cashfree sends the customer after checkout. The query string is not
 * evidence of payment: this asks our server, which asks Cashfree. A pending
 * answer is retried for a short while (UPI can take a few seconds to settle);
 * after that the webhook and reconciliation still finish the job.
 */
function ReturnInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { clearCart } = useApp();
  const orderNumber = params.get('order') ?? '';
  const [state, setState] = useState<'checking' | 'failed' | 'pending' | 'error'>(orderNumber ? 'checking' : 'error');

  useEffect(() => {
    let cancelled = false;
    const check = async (attempt: number) => {
      const res = await fetch('/api/payments/cashfree/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber }),
      })
        .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
        .catch(() => ({ ok: false, body: null as any }));
      if (cancelled) return;
      if (res.ok && res.body?.status === 'paid') {
        clearCart();
        let token: string | null = null;
        try {
          token = sessionStorage.getItem(`order-token:${orderNumber}`);
          sessionStorage.removeItem(`order-token:${orderNumber}`);
        } catch {}
        router.replace(token ? `/orders/${orderNumber}?t=${encodeURIComponent(token)}` : `/orders/${orderNumber}`);
        return;
      }
      if (res.ok && res.body?.status === 'pending' && attempt < 5) {
        setTimeout(() => check(attempt + 1), 2000);
        return;
      }
      setState(!res.ok ? 'error' : res.body?.status === 'failed' ? 'failed' : 'pending');
    };
    if (orderNumber) check(0);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const copy = {
    checking: 'Confirming your payment…',
    failed: 'That payment did not go through. Your bag is still here: try again, or choose cash on delivery.',
    pending: 'Your payment has not been confirmed yet. If you were charged, the order will update by itself within a few minutes.',
    error: 'We could not check this payment. If you were charged, the order will update by itself within a few minutes.',
  }[state];

  return (
    <div className="container mx-auto max-w-xl px-4 py-24 text-center" role="status" aria-live="polite">
      {state === 'checking' && <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />}
      <p className="mt-6 text-base">{copy}</p>
      {state !== 'checking' && (
        <Link href="/checkout" className="mt-8 inline-block text-sm underline underline-offset-4">
          Back to checkout
        </Link>
      )}
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnInner />
    </Suspense>
  );
}

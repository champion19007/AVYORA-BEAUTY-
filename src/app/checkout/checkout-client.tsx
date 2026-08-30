'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculateTotals, formatPaise } from '@/lib/money';
import { placeOrder } from './actions';
import { Loader2, Lock, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

type Errors = Record<string, string>;

const FIELDS = [
  { name: 'fullName', label: 'Full name', autoComplete: 'name', span: 2 },
  { name: 'phone', label: 'Mobile number', autoComplete: 'tel', span: 1 },
  { name: 'email', label: 'Email', autoComplete: 'email', type: 'email', span: 1 },
  { name: 'line1', label: 'Address', autoComplete: 'address-line1', span: 2 },
  { name: 'line2', label: 'Apartment, landmark (optional)', autoComplete: 'address-line2', span: 2 },
  { name: 'city', label: 'City', autoComplete: 'address-level2', span: 1 },
  { name: 'state', label: 'State', autoComplete: 'address-level1', span: 1 },
  { name: 'postalCode', label: 'PIN code', autoComplete: 'postal-code', span: 1 },
] as const;

/**
 * Confirmation URL. Guests carry a signed token because the order page shows
 * their address and phone number and must not be readable by URL alone.
 */
function orderUrl(orderNumber: string, accessToken?: string | null) {
  return accessToken
    ? `/orders/${orderNumber}?t=${encodeURIComponent(accessToken)}`
    : `/orders/${orderNumber}`;
}

/** Loads Razorpay's checkout script once, on demand. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CheckoutClient({ razorpayEnabled }: { razorpayEnabled: boolean }) {
  const { cart, updateQuantity, removeFromCart } = useApp();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [method, setMethod] = useState<'razorpay' | 'cod'>(razorpayEnabled ? 'razorpay' : 'cod');

  const totals = useMemo(
    () =>
      calculateTotals(
        cart.map((item) => ({
          unitPrice:
            item.salePrice ??
            (item.sizes.find((s) => s.label === item.selectedSize)?.price ?? item.price),
          quantity: item.quantity,
        }))
      ),
    [cart]
  );

  const set = (name: string, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  };

  const validate = () => {
    const e: Errors = {};
    if (!values.fullName || values.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test((values.phone || '').trim()))
      e.phone = 'Enter a valid Indian mobile number';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((values.email || '').trim()))
      e.email = 'Enter a valid email address';
    if (!values.line1 || values.line1.trim().length < 4) e.line1 = 'Enter your address';
    if (!values.city || values.city.trim().length < 2) e.city = 'Enter your city';
    if (!values.state || values.state.trim().length < 2) e.state = 'Enter your state';
    if (!/^\d{6}$/.test((values.postalCode || '').trim()))
      e.postalCode = 'Enter a valid 6-digit PIN code';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    email: values.email.trim(),
    address: {
      fullName: values.fullName.trim(),
      line1: values.line1.trim(),
      line2: values.line2?.trim() || '',
      city: values.city.trim(),
      state: values.state.trim(),
      postalCode: values.postalCode.trim(),
      country: 'IN',
      phone: values.phone.trim(),
    },
    items: cart.map((i) => ({
      productId: i.id,
      size: i.selectedSize,
      quantity: i.quantity,
    })),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);

    if (method === 'cod') {
      const result = await placeOrder({ ...buildPayload(), paymentMethod: 'cod' });
      if (result.ok) {
        router.push(orderUrl(result.orderNumber, result.accessToken));
        return;
      }
      setFormError(result.error);
      setSubmitting(false);
      return;
    }

    // Online payment. The server creates our order and a matching Razorpay
    // order; the amount charged is whatever the server calculated, never a
    // figure supplied by this browser.
    const created = await fetch('/api/payments/razorpay/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...buildPayload(), paymentMethod: 'razorpay' }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .catch(() => ({ ok: false, body: null as any }));

    if (!created.ok) {
      setFormError(created.body?.error ?? 'We could not start the payment. Please try again.');
      setSubmitting(false);
      return;
    }

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setFormError('Could not reach the payment provider. Check your connection and try again.');
      setSubmitting(false);
      return;
    }

    const { keyId, razorpayOrderId, amount, currency, orderNumber, accessToken } = created.body;

    const rzp = new (window as any).Razorpay({
      key: keyId,
      order_id: razorpayOrderId,
      amount,
      currency,
      name: 'Avyora',
      description: `Order ${orderNumber}`,
      image: '/logo-mark.png',
      prefill: {
        name: values.fullName.trim(),
        email: values.email.trim(),
        contact: values.phone.trim(),
      },
      theme: { color: '#C9A227' },
      handler: async (response: Record<string, string>) => {
        // Confirmation goes through our server, which checks the signature.
        // Nothing is trusted because the browser reported success.
        const verified = await fetch('/api/payments/razorpay/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        })
          .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
          .catch(() => ({ ok: false, body: null as any }));

        if (verified.ok) {
          router.push(orderUrl(orderNumber, accessToken));
          return;
        }

        // The webhook may still settle this independently, so say so rather
        // than implying the money is lost.
        setFormError(
          verified.body?.error ??
            'We could not confirm your payment. If you were charged, it will be reconciled shortly.'
        );
        setSubmitting(false);
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
    });

    rzp.on('payment.failed', () => {
      setFormError('That payment did not go through. Try again, or choose cash on delivery.');
      setSubmitting(false);
    });

    rzp.open();
  };

  if (cart.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-24 text-center">
        <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-6 font-headline text-3xl font-normal tracking-[0.02em]">
          Your bag is empty
        </h1>
        <p className="mt-4 text-muted-foreground">Add a formulation before checking out.</p>
        <Link href="/collections">
          <Button className="mt-8 rounded-md px-10 py-6 text-xs font-semibold uppercase tracking-[0.2em]">
            Browse products
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-14">
      <header className="mb-12 text-center">
        <span className="eyebrow">Checkout</span>
        <h1 className="mt-3 font-headline text-3xl font-normal tracking-[0.02em] md:text-4xl">
          Complete your order
        </h1>
      </header>

      <form onSubmit={submit} className="grid grid-cols-1 gap-12 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h2 className="font-headline text-xl font-normal tracking-[0.02em]">Delivery details</h2>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.name} className={cn(f.span === 2 && 'sm:col-span-2')}>
                <Label htmlFor={f.name} className="text-xs font-medium">
                  {f.label}
                </Label>
                <Input
                  id={f.name}
                  name={f.name}
                  type={'type' in f ? f.type : 'text'}
                  autoComplete={f.autoComplete}
                  value={values[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                  aria-invalid={!!errors[f.name]}
                  aria-describedby={errors[f.name] ? `${f.name}-error` : undefined}
                  className="mt-1.5 h-11 rounded-md"
                />
                {errors[f.name] && (
                  <p id={`${f.name}-error`} className="mt-1.5 text-xs text-destructive">
                    {errors[f.name]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <h2 className="mt-12 font-headline text-xl font-normal tracking-[0.02em]">Payment</h2>
          <div className="mt-4 space-y-3" role="radiogroup" aria-label="Payment method">
            {razorpayEnabled && (
              <button
                type="button"
                role="radio"
                aria-checked={method === 'razorpay'}
                onClick={() => setMethod('razorpay')}
                className={cn(
                  'w-full rounded-lg border p-5 text-left transition-colors',
                  method === 'razorpay'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <p className="text-sm font-medium">Pay online</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  UPI, cards, net banking and wallets, secured by Razorpay.
                </p>
              </button>
            )}
            <button
              type="button"
              role="radio"
              aria-checked={method === 'cod'}
              onClick={() => setMethod('cod')}
              className={cn(
                'w-full rounded-lg border p-5 text-left transition-colors',
                method === 'cod'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <p className="text-sm font-medium">Cash on delivery</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Pay the courier when your order arrives.
              </p>
            </button>
          </div>
          {!razorpayEnabled && (
            <p className="mt-3 text-xs text-muted-foreground">
              Online payment is not enabled on this deployment yet.
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------- summary */}
        <aside className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-headline text-xl font-normal tracking-[0.02em]">Your order</h2>

            <ul className="mt-5 space-y-4">
              {cart.map((item) => {
                const unit =
                  item.salePrice ??
                  (item.sizes.find((s) => s.label === item.selectedSize)?.price ?? item.price);
                return (
                  <li key={`${item.id}-${item.selectedSize}`} className="flex gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={item.images[0]}
                        alt={item.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.selectedSize}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.name}`}
                          onClick={() => updateQuantity(item.id, item.selectedSize, -1)}
                          className="h-6 w-6 rounded border border-border text-xs"
                        >
                          −
                        </button>
                        <span className="text-xs tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.name}`}
                          onClick={() => updateQuantity(item.id, item.selectedSize, 1)}
                          className="h-6 w-6 rounded border border-border text-xs"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id, item.selectedSize)}
                          className="ml-2 text-xs text-muted-foreground underline hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <span className="text-sm tabular-nums">
                      {formatPaise(Math.round(unit * 100) * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-6 space-y-2 border-t border-border pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatPaise(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="tabular-nums">
                  {totals.shipping === 0 ? 'Free' : formatPaise(totals.shipping)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPaise(totals.total)}</dd>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Includes {formatPaise(totals.tax)} GST
              </p>
            </dl>

            {formError && (
              <p
                role="alert"
                className="mt-5 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {formError}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full gap-2 rounded-md py-6 text-xs font-semibold uppercase tracking-[0.2em]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {method === 'razorpay' ? 'Opening payment' : 'Placing order'}
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  {method === 'razorpay' ? `Pay ${formatPaise(totals.total)}` : 'Place order'}
                </>
              )}
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}

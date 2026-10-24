'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { offerProblems, type Offer, type OfferKind, type SkuForCheck } from '@/modules/offers/engine';
import type { ProfitSettings } from '@/modules/offers/profit';
import { saveOfferAction, type OfferFormState } from './actions';

const KINDS: { value: OfferKind; label: string; example: string }[] = [
  { value: 'percent_off', label: 'Percentage off', example: 'e.g. 15% off moisturisers' },
  { value: 'amount_off', label: 'Amount off the order', example: 'e.g. ₹150 off orders over ₹999' },
  { value: 'buy_x_get_y', label: 'Buy some, get some free', example: 'e.g. buy 2, get 1 free (cheapest free)' },
  { value: 'free_delivery', label: 'Free delivery', example: 'e.g. free delivery over ₹599' },
];

/** The offers shops run most, one tap away. */
const PRESETS: { label: string; kind: OfferKind; buy?: number; get?: number; percent?: number }[] = [
  { label: 'Buy 1, get 1 free', kind: 'buy_x_get_y', buy: 1, get: 1 },
  { label: 'Buy 2, get 1 free', kind: 'buy_x_get_y', buy: 2, get: 1 },
  { label: 'Buy 3, get 1 free', kind: 'buy_x_get_y', buy: 3, get: 1 },
  { label: 'Buy 2, get 2 free', kind: 'buy_x_get_y', buy: 2, get: 2 },
  { label: '10% off', kind: 'percent_off', percent: 10 },
  { label: 'Free delivery', kind: 'free_delivery' },
];

const field = 'mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm';
const label = 'block text-sm font-medium';
const hint = 'mt-1 text-xs text-muted-foreground';

/** `datetime-local` wants local time without a zone. */
const toLocalInput = (d: Date | null) =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';

/**
 * Builds an offer. The profit check runs as you type, with today's prices
 * and cost prices; the server runs it again on save, and checkout caps the
 * discount besides, so nothing sells below the floor.
 */
export function OfferEditor({
  offer,
  products,
  skus,
  settings,
}: {
  offer: Offer | null;
  products: { id: string; name: string }[];
  skus: SkuForCheck[];
  settings: ProfitSettings;
}) {
  const [name, setName] = useState(offer?.name ?? '');
  const [kind, setKind] = useState<OfferKind>(offer?.kind ?? 'percent_off');
  const [percentOff, setPercent] = useState(String(offer?.percentOff ?? 10));
  const [amount, setAmount] = useState(offer?.amountPaise ? String(offer.amountPaise / 100) : '');
  const [buyQty, setBuy] = useState(String(offer?.buyQty ?? 2));
  const [getQty, setGet] = useState(String(offer?.getQty ?? 1));
  const [allProducts, setAll] = useState(!offer?.productIds?.length);
  const [productIds, setProducts] = useState<string[]>(offer?.productIds ?? []);
  const [minSpend, setMinSpend] = useState(offer?.minSubtotalPaise ? String(offer.minSubtotalPaise / 100) : '0');
  const [minQuantity, setMinQty] = useState(String(offer?.minQuantity ?? 1));
  const [code, setCode] = useState(offer?.couponCode ?? '');
  const [firstOrderOnly, setFirst] = useState(offer?.firstOrderOnly ?? false);
  const [maxUses, setMaxUses] = useState(offer?.maxUses ? String(offer.maxUses) : '');
  const [startsAt, setStarts] = useState(toLocalInput(offer?.startsAt ?? null));
  const [endsAt, setEnds] = useState(toLocalInput(offer?.endsAt ?? null));
  const [active, setActive] = useState(offer?.active ?? true);
  const [state, save, saving] = useActionState<OfferFormState, FormData>(saveOfferAction, {});

  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const draft: Offer = {
    id: offer?.id ?? 'new',
    name,
    kind,
    percentOff: kind === 'percent_off' ? num(percentOff) : null,
    amountPaise: kind === 'amount_off' && num(amount) !== null ? Math.round(num(amount)! * 100) : null,
    buyQty: kind === 'buy_x_get_y' ? num(buyQty) : null,
    getQty: kind === 'buy_x_get_y' ? num(getQty) : null,
    productIds: allProducts ? null : productIds,
    minSubtotalPaise: Math.round((num(minSpend) ?? 0) * 100),
    minQuantity: num(minQuantity) ?? 1,
    couponCode: code.trim().toUpperCase() || null,
    firstOrderOnly,
    maxUses: num(maxUses),
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
    active,
  };
  // Cheap: a few dozen SKUs, so it simply runs on every keystroke.
  const problems = offerProblems(draft, skus, settings);

  const payload = JSON.stringify({
    ...(offer ? { id: offer.id } : {}),
    name,
    kind,
    percentOff: draft.percentOff,
    amountRupees: kind === 'amount_off' ? num(amount) : null,
    buyQty: draft.buyQty,
    getQty: draft.getQty,
    productIds: allProducts ? [] : productIds,
    minSubtotalRupees: num(minSpend) ?? 0,
    minQuantity: draft.minQuantity,
    couponCode: code,
    firstOrderOnly,
    maxUses: draft.maxUses,
    startsAt: draft.startsAt?.toISOString() ?? null,
    endsAt: draft.endsAt?.toISOString() ?? null,
    active,
  });

  return (
    <form action={save} className="space-y-6">
      <input type="hidden" name="offer" value={payload} />
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All offers
      </Link>
      <h1 className="font-headline text-3xl font-normal tracking-tight">{offer ? 'Edit offer' : 'New offer'}</h1>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium">Quick start</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => {
                setKind(p.kind);
                if (p.buy) setBuy(String(p.buy));
                if (p.get) setGet(String(p.get));
                if (p.percent) setPercent(String(p.percent));
                setName((n) => n || p.label);
                setCode('');
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <p className={hint}>
          Fills the form; then choose the products. In buy-and-get offers the lowest-priced items are the free ones, and
          customers can mix and match any eligible products.
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <label className={label}>
          Name customers see
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Launch week: 15% off"
          />
        </label>
        <fieldset>
          <legend className={label}>Type of offer</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${kind === k.value ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <input type="radio" name="kind" checked={kind === k.value} onChange={() => setKind(k.value)} />
                <span>
                  <span className="font-medium">{k.label}</span>
                  <span className="block text-xs text-muted-foreground">{k.example}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {kind === 'percent_off' && (
          <label className={label}>
            Percent off
            <input
              className={field}
              inputMode="numeric"
              value={percentOff}
              onChange={(e) => setPercent(e.target.value)}
            />
          </label>
        )}
        {kind === 'amount_off' && (
          <label className={label}>
            Amount off (₹)
            <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        )}
        {kind === 'buy_x_get_y' && (
          <div className="grid grid-cols-2 gap-4">
            <label className={label}>
              Customer buys
              <input className={field} inputMode="numeric" value={buyQty} onChange={(e) => setBuy(e.target.value)} />
            </label>
            <label className={label}>
              and gets this many free
              <input className={field} inputMode="numeric" value={getQty} onChange={(e) => setGet(e.target.value)} />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium">Which products</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allProducts} onChange={(e) => setAll(e.target.checked)} /> Every product on
          the shop
        </label>
        {!allProducts && (
          <div className="grid gap-2 sm:grid-cols-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={(e) =>
                    setProducts((list) => (e.target.checked ? [...list, p.id] : list.filter((x) => x !== p.id)))
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Minimum spend on these products (₹)
            <input
              className={field}
              inputMode="decimal"
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value)}
            />
          </label>
          <label className={label}>
            Minimum number of items
            <input
              className={field}
              inputMode="numeric"
              value={minQuantity}
              onChange={(e) => setMinQty(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium">Who and when</h2>
        <label className={label}>
          Coupon code (leave empty to apply automatically and show it on the shop)
          <input
            className={`${field} uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={30}
            placeholder="WELCOME10"
          />
        </label>
        <p className={hint}>
          {code.trim()
            ? 'With a code, the offer stays private: only customers you give the code to can use it.'
            : 'Without a code, eligible products get a badge (e.g. "Buy 2, get 1 free"), their pages explain the offer, and the bag tells customers how close they are.'}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirst(e.target.checked)} /> First order
          only
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Starts
            <input
              type="datetime-local"
              className={field}
              value={startsAt}
              onChange={(e) => setStarts(e.target.value)}
            />
          </label>
          <label className={label}>
            Ends
            <input type="datetime-local" className={field} value={endsAt} onChange={(e) => setEnds(e.target.value)} />
          </label>
          <label className={label}>
            Stop after this many orders
            <input
              className={field}
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="No limit"
            />
          </label>
        </div>
        <p className={hint}>Leave the dates empty to start now and run until you stop it.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Switched on
        </label>
      </section>

      <section
        aria-live="polite"
        className={`rounded-xl border p-5 text-sm ${problems.length ? 'border-destructive/40 bg-destructive/5' : 'border-emerald-300 bg-emerald-50'}`}
      >
        <h2 className="font-medium">Profit check</h2>
        {problems.length === 0 ? (
          <p className="mt-1 flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Every product it covers keeps at least cost +{' '}
            {settings.floorPercent}%.
          </p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Checkout also caps every discount at the floor, so a mixed bag can never sell at a loss.
        </p>
      </section>

      {state.errors?.length ? (
        <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" disabled={saving || (active && problems.length > 0)}>
        {saving ? 'Saving…' : active ? 'Save and run offer' : 'Save (switched off)'}
      </Button>
    </form>
  );
}

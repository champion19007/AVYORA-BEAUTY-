import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { db, isDatabaseConfigured } from '@/db';
import { Button } from '@/components/ui/button';
import { formatPaise } from '@/lib/money';
import { offerLive } from '@/modules/offers/engine';
import { listOffers, type OfferRow } from '@/modules/offers/store';
import { getProfitSettings } from '@/modules/offers/settings';
import { OfferSwitch, ProfitSettingsForm } from './offer-controls';

export const metadata: Metadata = { title: 'Offers' };
export const dynamic = 'force-dynamic';

function describe(o: OfferRow): string {
  const what =
    o.kind === 'percent_off'
      ? `${o.percentOff}% off`
      : o.kind === 'amount_off'
        ? `${formatPaise(o.amountPaise ?? 0)} off`
        : o.kind === 'buy_x_get_y'
          ? `Buy ${o.buyQty}, get ${o.getQty} free`
          : 'Free delivery';
  const scope = o.productIds?.length ? `${o.productIds.length} products` : 'all products';
  const rules = [
    o.minSubtotalPaise ? `over ${formatPaise(o.minSubtotalPaise)}` : null,
    o.minQuantity > 1 ? `${o.minQuantity}+ items` : null,
    o.couponCode ? `code ${o.couponCode}` : 'automatic',
    o.firstOrderOnly ? 'first order only' : null,
  ].filter(Boolean);
  return `${what} · ${scope} · ${rules.join(' · ')}`;
}

function status(o: OfferRow, now: Date): { text: string; tone: string } {
  if (!o.active) return { text: 'Off', tone: 'bg-muted text-muted-foreground' };
  if (o.startsAt && o.startsAt > now)
    return {
      text: `Starts ${o.startsAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}`,
      tone: 'bg-sky-100 text-sky-900',
    };
  if (o.endsAt && o.endsAt <= now) return { text: 'Ended', tone: 'bg-muted text-muted-foreground' };
  if (!offerLive(o, now, o.used)) return { text: 'Used up', tone: 'bg-muted text-muted-foreground' };
  return { text: 'Running', tone: 'bg-emerald-100 text-emerald-900' };
}

/**
 * Offers the owner runs. Each is checked against cost prices when saved and
 * when switched on, and checkout caps every discount at the profit floor.
 */
export default async function OffersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  if (!isDatabaseConfigured()) {
    return <p className="text-[15px] text-muted-foreground">No database is configured on this deployment.</p>;
  }
  const { saved } = await searchParams;
  const [offers, settings] = await Promise.all([listOffers(db), getProfitSettings(db)]);
  const now = new Date();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-normal tracking-tight">Offers</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
            Run any offer you like. Each one is checked so every sale still makes at least cost +{' '}
            {settings.floorPercent}%, and checkout gives each order the single best offer.
          </p>
        </div>
        <Link href="/admin/offers/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> New offer
          </Button>
        </Link>
      </div>
      {saved && <p className="text-sm text-emerald-700">Offer saved.</p>}

      {offers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-[15px] text-muted-foreground">
          No offers yet. Products need a cost price before an offer can cover them.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {offers.map((o) => {
            const s = status(o, now);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/offers/${o.id}`} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{describe(o)}</p>
                  <p className="text-xs text-muted-foreground">
                    Used on {o.used} {o.used === 1 ? 'order' : 'orders'}
                    {o.maxUses ? ` of ${o.maxUses}` : ''}
                    {o.endsAt ? ` · ends ${o.endsAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.text}</span>
                <OfferSwitch id={o.id} active={o.active} />
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium">Profit floor</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The least each sale must make over its cost, after 18% GST and the payment fee. Raising it does not stop
          offers already running, but checkout caps their discount at the new floor straight away.
        </p>
        <ProfitSettingsForm settings={settings} />
      </section>
    </div>
  );
}

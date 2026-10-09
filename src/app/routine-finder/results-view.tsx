'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Loader2, RefreshCw, RotateCcw, ShoppingBag, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/price';
import { PRODUCTS } from '@/data/mock-data';
import { catalogRecords } from '@/modules/catalog/catalog-records';
import type { RoutineSnapshot } from '@/modules/personalization/core/routine';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatPaise } from '@/lib/money';
import { PRIORITY_LABELS } from './quiz';
import dynamic from 'next/dynamic';

const AssistantPanel = dynamic(() => import('@/components/assistant/assistant-panel').then((m) => m.AssistantPanel), { ssr: false });
import type { RoutineSession, SessionState } from './routine-session';

const PRODUCT = new Map(PRODUCTS.map((p) => [p.id, p]));
const SKU = new Map(catalogRecords(PRODUCTS).variants.map((v) => [v.id, v]));
const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ROLE: Record<string, string> = { cleanse: 'Cleanse', moisturise: 'Moisturise', protect: 'Protect', treatment: 'Treatment', optional: 'Optional' };
const UNKNOWN_ANSWER: Record<string, string> = {
  pregnancy: 'pregnancy',
  nursing: 'breastfeeding',
  currentlyIrritated: 'current irritation',
  reactivity: 'how easily your skin reacts',
  ageBand: 'age',
  allergyHistory: 'allergies',
  prescribedTreatment: 'prescribed treatments',
};
const rupees = (paise: number) => paise / 100;
/** The counted stock to cap an add at; undefined when not counted (saved routines carry no quote). */
const stockCap = (stock: SessionState['stock'], skuId: string) => {
  const n = stock[skuId];
  return typeof n === 'number' ? n : undefined;
};

type Slot = RoutineSnapshot['days'][number]['am'][number];
type Line = { key: string; slot: Slot; skuId?: string; pricePaise?: number; unavailable?: boolean; reasons: string[] };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Each scheduled product or owned item once, with its first occurrence's slot. */
function linesOf(result: RoutineSnapshot, quote: SessionState['quote']) {
  const current = new Map((quote ?? []).map((q) => [q.skuId, q]));
  const seen = new Map<string, Slot>();
  for (const d of result.days) for (const s of [...d.am, ...d.pm]) seen.set(s.productId ?? s.ownedItemId!, seen.get(s.productId ?? s.ownedItemId!) ?? s);
  const price = new Map(result.purchaseList.map((p) => [p.productId, p]));
  const why = new Map(result.inclusions.map((i) => [i.id, i.reasons]));
  const lines: Line[] = [...seen].map(([key, slot]) => ({
    key,
    slot,
    skuId: price.get(key)?.skuId ?? slot.skuId,
    // A saved routine shows today's price, not the one it was saved with.
    pricePaise: quote ? (current.get(price.get(key)?.skuId ?? '')?.currentPaise ?? undefined) : price.get(key)?.pricePaise,
    unavailable: quote ? current.get(price.get(key)?.skuId ?? '')?.available === false : false,
    reasons: why.get(key) ?? [],
  }));
  return {
    essential: lines.filter((l) => l.slot.source === 'catalogue' && !l.slot.optional),
    optional: lines.filter((l) => l.slot.source === 'catalogue' && l.slot.optional),
    owned: lines.filter((l) => l.slot.source === 'owned'),
  };
}

export function ResultsView({ state, session, onEdit, onRestart }: { state: SessionState; session: RoutineSession; onEdit: () => void; onRestart: () => void }) {
  const now = useNow(5_000);
  const { result, profile } = state;
  const busy = state.phase === 'computing';
  const saving = state.save.status === 'saving';
  const pricesStale = state.pricesExpireAt !== null && now > state.pricesExpireAt;

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        {busy ? (
          <p role="status" className="flex items-center justify-center gap-3 text-lg">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Building your routine
          </p>
        ) : state.saved?.validity === 'revoked' ? (
          <SavedRevoked onRecalculate={() => session.compute(state.saved!.profile)} />
        ) : (
          <div role="alert">
            <h1 className="font-headline text-3xl font-normal">We could not build your routine</h1>
            <p className="mt-4 text-muted-foreground">{state.error}</p>
            <div className="mt-8 flex justify-center gap-3">
              {profile && (
                <Button className="rounded-full" onClick={() => session.refresh()}>
                  Try again
                </Button>
              )}
              <Button variant="outline" className="rounded-full" onClick={onEdit}>
                Edit answers
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const { essential, optional, owned } = linesOf(result, state.quote);
  const noMatch = result.status === 'no_match';
  // An invalid plan breaks a hard rule: nothing in it is offered as a routine, saved or added to the bag.
  const invalid = result.status === 'invalid';
  const actionable = !noMatch && !invalid;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your routine</p>
          <h1 className="mt-3 font-headline text-5xl font-normal leading-tight tracking-tight">
            {invalid ? 'We cannot offer this routine' : noMatch ? 'Nothing fits yet' : result.status === 'partial' ? 'A partial routine' : 'Your weekly routine'}
          </h1>
          {profile && profile.priorities.length > 0 && (
            <p className="mt-3 text-muted-foreground">For {profile.priorities.map((p) => PRIORITY_LABELS[p].toLowerCase()).join(', ')}</p>
          )}
        </div>
        <SaveBadge state={state} />
      </header>

      <div className="mt-6 space-y-3" aria-live="polite">
        {busy && (
          <Notice icon={<Loader2 className="h-4 w-4 animate-spin" />} role="status">
            Recalculating your whole week with current prices…
          </Notice>
        )}
        {state.error && <Notice tone="warn">{state.error}</Notice>}
        {state.published === false && (
          <Notice>This is a preview for this visit only. Saving opens once our routine guidance is published.</Notice>
        )}
        {state.saved?.validity === 'outdated' && (
          <Notice tone="warn" action={<Button size="sm" variant="outline" className="rounded-full" onClick={() => session.compute(state.saved!.profile, state.excluded)}>Recalculate</Button>}>
            Our guidance has been updated since you saved this routine. It is shown as saved; recalculate for a current routine.
          </Notice>
        )}
        {state.saved && <Notice>Saved routine, kept until {new Date(state.saved.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}.</Notice>}
        {pricesStale && !busy && (
          <Notice tone="warn" action={<Button size="sm" variant="outline" className="gap-2 rounded-full" onClick={() => session.refresh()}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh prices</Button>}>
            Prices may have changed since this routine was calculated.
          </Notice>
        )}
        {state.pricesChangedOnSave && <Notice tone="warn">Prices changed while saving; the totals below are the current ones.</Notice>}
        {state.quote && <QuoteChanges quote={state.quote} onRecalculate={() => state.saved && session.compute(state.saved.profile, state.excluded)} />}
        {state.scanId && state.save.status !== 'saved' && (
          <Notice action={<Button size="sm" variant="ghost" className="rounded-full" onClick={() => session.useScan(null)}>Leave it out</Button>}>
            Your photo check is attached. This preview uses your answers only; its findings are added when you save, and they cannot override safety answers.
          </Notice>
        )}
      </div>

      <div className={cn('mt-10 grid grid-cols-[1fr_22rem] gap-12', busy && 'opacity-60')} aria-busy={busy}>
        <div className="min-w-0 space-y-14">
          {invalid ? (
            <InvalidPlan result={result} onEdit={onEdit} />
          ) : noMatch ? (
            <NoMatch result={result} onEdit={onEdit} />
          ) : (
            <>
              <WeekTable result={result} />
              <ProductGroup title="Essentials" lines={essential} result={result} stock={state.stock} session={session} disabled={busy || saving} />
              {owned.length > 0 && <ProductGroup title="Already yours" lines={owned} result={result} session={session} stock={state.stock} disabled />}
              {optional.length > 0 && (
                <ProductGroup title="Optional additions" note="Not needed for the routine to work." lines={optional} result={result} stock={state.stock} session={session} disabled={busy || saving} />
              )}
            </>
          )}
          <OwnedNotScheduled result={result} />
          <NotIncluded result={result} />
          <AnswersThatMattered result={result} />
          <Uncertainty result={result} />
          <AssistantPanel routine={{ result, validity: state.saved?.validity ?? (state.save.status === 'saved' ? 'current' : 'session') }} />
        </div>

        <aside className="space-y-6">
          {actionable && <Totals result={result} essential={essential} optional={optional} stock={state.stock} />}
          <BudgetForm key={result.budgetPaise} budgetPaise={result.budgetPaise} disabled={busy || saving} onSubmit={(p) => session.setBudget(p)} />
          {state.excluded.length > 0 && (
            <Button variant="outline" className="w-full gap-2 rounded-full" disabled={busy || saving} onClick={() => session.undoSwaps()}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Undo swaps ({state.excluded.length})
            </Button>
          )}
          {actionable && <SavePanel state={state} session={session} stale={pricesStale} />}
          <div className="flex flex-col gap-2">
            <Button variant="ghost" className="rounded-full" onClick={onEdit}>
              Edit answers
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={onRestart}>
              Start over
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Notice({ children, tone, icon, action, role }: { children: React.ReactNode; tone?: 'warn'; icon?: React.ReactNode; action?: React.ReactNode; role?: string }) {
  return (
    <div role={role} className={cn('flex items-center gap-3 rounded-2xl px-5 py-3 text-sm', tone === 'warn' ? 'bg-primary/10' : 'bg-muted')}>
      {icon ?? (tone === 'warn' && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />)}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function SaveBadge({ state }: { state: SessionState }) {
  const s = state.save;
  const text = s.status === 'saved' ? 'Saved to your routines' : s.status === 'saving' ? 'Saving…' : 'Not saved: this visit only';
  return (
    <p className={cn('rounded-full border px-4 py-2 text-sm', s.status === 'saved' ? 'border-foreground' : 'border-border text-muted-foreground')}>
      {s.status === 'saved' && <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />}
      {text}
    </p>
  );
}

function WeekTable({ result }: { result: RoutineSnapshot }) {
  const cell = (slots: Slot[]) =>
    slots.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <ol className="space-y-1">
        {slots.map((s) => (
          <li key={s.position} className={cn(s.role === 'treatment' && 'font-medium', s.optional && 'text-muted-foreground')}>
            <span className="sr-only">Step {s.position}: </span>
            {s.label}
            {s.optional && <span className="text-xs"> (optional)</span>}
          </li>
        ))}
      </ol>
    );
  return (
    <section aria-labelledby="week-heading">
      <h2 id="week-heading" className="font-headline text-3xl font-normal tracking-tight">
        Your week
      </h2>
      <ul className="mt-3 space-y-1 text-[15px] text-muted-foreground">
        {result.schedule.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Morning and evening steps for each day, in order</caption>
          <thead className="bg-muted/50 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th scope="col" className="w-36 px-4 py-3">Day</th>
              <th scope="col" className="px-4 py-3">Morning</th>
              <th scope="col" className="px-4 py-3">Evening</th>
            </tr>
          </thead>
          <tbody>
            {result.days.map((d) => (
              <tr key={d.day} className="border-t border-border align-top">
                <th scope="row" className="px-4 py-3 font-medium">{DAY[d.day]}</th>
                <td className="px-4 py-3">{cell(d.am)}</td>
                <td className="px-4 py-3">{cell(d.pm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductGroup({ title, note, lines, result, session, disabled, stock }: { title: string; note?: string; lines: Line[]; result: RoutineSnapshot; session: RoutineSession; disabled: boolean; stock: SessionState['stock'] }) {
  const { addToCart, cart } = useApp();
  const inBag = (productId: string, size: string) => cart.some((c) => c.productId === productId && c.size === size);
  if (lines.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="font-headline text-3xl font-normal tracking-tight">{title}</h2>
      {note && <p className="mt-1 text-muted-foreground">{note}</p>}
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
        {lines.map((l) => {
          const product = l.slot.productId ? PRODUCT.get(l.slot.productId) : undefined;
          const sku = l.skuId ? SKU.get(l.skuId) : undefined;
          const used = (k: 'am' | 'pm') => result.days.some((d) => d[k].some((s) => (s.productId ?? s.ownedItemId) === l.key));
          const sessions = [used('am') && 'Morning', used('pm') && 'Evening'].filter(Boolean);
          return (
            <li key={l.key} className="grid grid-cols-[1fr_auto] gap-6 p-6">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {ROLE[l.slot.role] ?? l.slot.role} · {sessions.join(' and ')}
                </p>
                <h3 className="mt-1 text-lg font-medium">
                  {product ? <Link href={`/products/${product.slug}`} className="hover:underline">{product.name}</Link> : l.slot.label}
                </h3>
                {sku && <p className="text-sm text-muted-foreground">{sku.sizeLabel}</p>}
                {l.reasons.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[15px] text-muted-foreground">
                    {l.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-sm">
                  {l.slot.directions ? (
                    <>
                      <span className="font-medium">{l.slot.directions.frequency}.</span> {l.slot.directions.text}
                    </>
                  ) : l.slot.source === 'owned' ? (
                    'Use as you do now.'
                  ) : (
                    <span className="text-muted-foreground">Our reviewed directions are not published yet; follow the directions on the pack.</span>
                  )}
                </p>
              </div>
              {l.slot.source === 'catalogue' && product && sku && (
                <div className="flex flex-col items-end gap-3">
                  {l.pricePaise !== undefined && <Price amount={rupees(l.pricePaise)} size="base" />}
                  <Button
                    size="sm"
                    variant={inBag(product.id, sku.sizeLabel) ? 'secondary' : 'outline'}
                    className="gap-2 rounded-full"
                    // "In bag" is read from the bag itself, so a repeat click cannot add another unit.
                    disabled={inBag(product.id, sku.sizeLabel) || l.unavailable}
                    onClick={() => addToCart(product.id, sku.sizeLabel, 1, stockCap(stock, sku.id))}
                  >
                    {inBag(product.id, sku.sizeLabel) ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />}
                    {l.unavailable ? 'Unavailable now' : inBag(product.id, sku.sizeLabel) ? 'In bag' : 'Add to bag'}
                    <span className="sr-only"> {product.name}</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-2 rounded-full" disabled={disabled} onClick={() => session.swap(product.id)}>
                    <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Swap<span className="sr-only"> {product.name} for another product</span>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Totals({ result, essential, optional, stock }: { result: RoutineSnapshot; essential: Line[]; optional: Line[]; stock: SessionState['stock'] }) {
  const { addToCart, cart } = useApp();
  const sum = (ls: Line[]) => ls.reduce((n, l) => n + (l.pricePaise ?? 0), 0);
  const toBuy = essential.filter((l) => l.pricePaise !== undefined && !l.unavailable);
  const missing = toBuy
    .map((l) => SKU.get(l.skuId!))
    .filter((sku): sku is NonNullable<typeof sku> => Boolean(sku) && !cart.some((c) => c.productId === sku!.productId && c.size === sku!.sizeLabel));
  return (
    <section className="rounded-3xl bg-muted/60 p-6" aria-labelledby="totals-heading">
      <h2 id="totals-heading" className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
        New purchases
      </h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt>Essentials</dt>
          <dd><Price amount={rupees(sum(essential))} size="sm" /></dd>
        </div>
        {optional.length > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <dt>Optional additions</dt>
            <dd><Price amount={rupees(sum(optional))} size="sm" /></dd>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 font-medium">
          <dt>Total new spend</dt>
          <dd><Price amount={rupees(sum(essential) + sum(optional))} size="base" /></dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Your budget</dt>
          <dd><Price amount={rupees(result.budgetPaise)} size="sm" /></dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Prices are confirmed again at checkout.</p>
      {toBuy.length > 0 && (
        <Button
          className="mt-5 w-full rounded-full"
          // Adds only essentials not already in the bag, so repeat clicks cannot raise quantities.
          disabled={missing.length === 0}
          onClick={() => {
            for (const sku of missing) addToCart(sku.productId, sku.sizeLabel, 1, stockCap(stock, sku.id));
          }}
        >
          {missing.length === 0 ? 'Essentials in your bag' : 'Add essentials to bag'}
        </Button>
      )}
    </section>
  );
}

function BudgetForm({ budgetPaise, disabled, onSubmit }: { budgetPaise: number; disabled: boolean; onSubmit: (paise: number) => void }) {
  const [value, setValue] = useState(String(budgetPaise / 100));
  const n = Number(value);
  const problem = value === '' || !Number.isInteger(n) || n < 0 || n > 10_000 ? 'Enter whole rupees from 0 to 10,000.' : null;
  return (
    <form
      className="rounded-3xl border border-border p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onSubmit(n * 100);
      }}
      noValidate
    >
      <label htmlFor="result-budget" className="text-sm font-medium">
        Change your budget
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="result-budget"
          type="number"
          min={0}
          max={10_000}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(problem) || undefined}
          aria-describedby={problem ? 'result-budget-error' : undefined}
          className="w-full rounded-full border border-border bg-transparent px-4 py-2"
        />
        <Button type="submit" variant="outline" className="rounded-full" disabled={disabled || Boolean(problem)}>
          Update
        </Button>
      </div>
      {problem && (
        <p id="result-budget-error" className="mt-2 text-sm text-destructive">
          {problem}
        </p>
      )}
    </form>
  );
}

function SavePanel({ state, session, stale }: { state: SessionState; session: RoutineSession; stale: boolean }) {
  const s = state.save;
  if (s.status === 'saved') return null;
  return (
    <section className="rounded-3xl border border-border p-6" aria-labelledby="save-heading">
      <h2 id="save-heading" className="text-lg font-medium">
        Save this routine
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Saving stores your answers and this routine so you can return to it: 30 days without an account, 180 days with one. You can delete it at any time.
      </p>
      {s.status === 'failed' && (
        <p role="alert" className="mt-3 rounded-2xl bg-primary/10 px-4 py-3 text-sm">
          {s.message}
        </p>
      )}
      <Button
        className="mt-4 w-full rounded-full"
        disabled={s.status === 'saving' || state.phase === 'computing' || state.published === false}
        onClick={() => session.save()}
      >
        {s.status === 'saving' ? 'Saving…' : s.status === 'failed' ? 'Try saving again' : 'Allow saving and save'}
      </Button>
      {stale && <p className="mt-2 text-xs text-muted-foreground">Saving recalculates with current prices.</p>}
    </section>
  );
}

function NoMatch({ result, onEdit }: { result: RoutineSnapshot; onEdit: () => void }) {
  return (
    <section className="rounded-3xl bg-muted/60 p-8" aria-labelledby="nomatch-heading">
      <h2 id="nomatch-heading" className="font-headline text-3xl font-normal">
        We could not build a routine from these answers
      </h2>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Rather than suggest something that does not fit, we are showing nothing. The reasons are below.
      </p>
      {result.unfilled.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-[15px]">
          {[...new Set(result.unfilled.flatMap((u) => u.reasons))].map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[15px]">You can change your budget, add products you already use, or edit your answers.</p>
      <Button variant="outline" className="mt-6 rounded-full" onClick={onEdit}>
        Edit answers
      </Button>
    </section>
  );
}

function NotIncluded({ result }: { result: RoutineSnapshot }) {
  const unfilled = result.status === 'no_match' ? [] : result.unfilled;
  if (result.exclusions.length === 0 && unfilled.length === 0) return null;
  return (
    <section aria-labelledby="excluded-heading">
      <h2 id="excluded-heading" className="font-headline text-3xl font-normal tracking-tight">
        Not included, and why
      </h2>
      {unfilled.length > 0 && (
        <ul className="mt-4 space-y-2 text-[15px]">
          {unfilled.map((u) => (
            <li key={u.role}>
              <span className="font-medium">{ROLE[u.role] ?? u.role} step:</span> {u.reasons.join(' ')}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-4 rounded-2xl border border-border p-5">
        <summary className="cursor-pointer text-[15px] font-medium">
          {result.exclusions.length} products left out
        </summary>
        <ul className="mt-4 space-y-3 text-sm">
          {result.exclusions.map((e) => (
            <li key={e.productId}>
              <span className="font-medium">{PRODUCT.get(e.productId)?.name ?? e.productId}:</span>{' '}
              <span className="text-muted-foreground">{e.messages.join(' ')}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Uncertainty({ result }: { result: RoutineSnapshot }) {
  const unknown = result.unknownSafetyAnswers.map((a) => UNKNOWN_ANSWER[a] ?? a);
  return (
    <section aria-labelledby="uncertainty-heading" className="rounded-3xl border border-border p-6">
      <h2 id="uncertainty-heading" className="text-lg font-medium">
        What we are unsure about
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
        {result.beliefs.every((b) => b.basis === 'reported') && (
          <li>Your priorities come from your answers alone; we have not estimated anything from them.</li>
        )}
        {unknown.length > 0 && <li>You left these unanswered or unsure, so we kept active treatments out: {unknown.join(', ')}.</li>}
        {result.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
        {result.missingKnowledge.length > 0 && <li>Some products are held back until their full formulation and directions have been reviewed.</li>}
      </ul>
      {result.missingKnowledge.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">What is still under review</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {result.missingKnowledge.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SavedRevoked({ onRecalculate }: { onRecalculate: () => void }) {
  return (
    <div role="alert">
      <h1 className="font-headline text-3xl font-normal">This saved routine is no longer valid</h1>
      <p className="mt-4 text-muted-foreground">
        The guidance it was built on has been withdrawn, so we will not show it as a recommendation. You can recalculate from your saved answers.
      </p>
      <Button className="mt-8 rounded-full" onClick={onRecalculate}>
        Recalculate
      </Button>
    </div>
  );
}

function InvalidPlan({ result, onEdit }: { result: RoutineSnapshot; onEdit: () => void }) {
  return (
    <section role="alert" className="rounded-[18px] border border-destructive/40 p-8">
      <h2 className="text-2xl font-medium">These answers lead to a plan that breaks a safety rule</h2>
      <p className="mt-3 text-[15px] text-muted-foreground">Nothing here can be saved or bought as a routine. Change your answers or the products you listed, and we will check again.</p>
      <ul className="mt-5 list-disc space-y-1 pl-5 text-[15px]">
        {result.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <Button className="mt-6 rounded-full" onClick={onEdit}>
        Edit answers
      </Button>
    </section>
  );
}

function OwnedNotScheduled({ result }: { result: RoutineSnapshot }) {
  const items = result.ownedNotScheduled ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="owned-out-heading">
      <h2 id="owned-out-heading" className="text-xl font-medium">Your products we did not schedule</h2>
      <p className="mt-2 text-sm text-muted-foreground">The same ingredient checks apply to what you own as to what we sell. This is not a judgement of the product, only of what we can verify.</p>
      <ul className="mt-4 space-y-3">
        {items.map((o) => (
          <li key={o.ownedItemId} className="rounded-2xl border border-border p-4 text-[15px]">
            <p className="font-medium">{o.label}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              {o.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ANSWER_LABELS: Record<string, string> = {
  currentlyIrritated: 'Skin irritated right now',
  reactivity: 'How easily your skin reacts',
  'pregnancy / nursing': 'Pregnancy or breastfeeding',
  pregnancy: 'Pregnancy',
  nursing: 'Breastfeeding',
  ageBand: 'Age',
  ageRange: 'Age',
  allergyIngredientIds: 'Allergies you named',
  allergyHistory: 'Allergy history',
  prescribedTreatment: 'Prescribed treatment',
  ownedItems: 'Products you already use',
  budgetPaise: 'Budget',
  excludeProductIds: 'Products you swapped out',
  experienceLevel: 'Experience',
  adherence: 'How regularly you expect to follow it',
  currentCondition: 'Skin irritated right now',
  skinType: 'Skin type',
};

/** The answers that actually changed this result, from the engine's decision trace. */
function AnswersThatMattered({ result }: { result: RoutineSnapshot }) {
  const items = result.answersThatMattered ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="mattered-heading">
      <h2 id="mattered-heading" className="text-xl font-medium">What shaped this routine</h2>
      <dl className="mt-4 space-y-3 text-[15px]">
        {items.map((a) => (
          <div key={a.answer}>
            <dt className="font-medium">{ANSWER_LABELS[a.answer] ?? a.answer}</dt>
            <dd className="text-sm text-muted-foreground">{a.effects.slice(0, 4).join(' ')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A saved routine's purchases against today's quote: every change is shown, nothing is silently swapped. */
function QuoteChanges({ quote, onRecalculate }: { quote: NonNullable<SessionState['quote']>; onRecalculate: () => void }) {
  const changed = quote.filter((q) => q.currentPaise !== null && q.currentPaise !== q.savedPaise);
  const unavailable = quote.filter((q) => !q.available);
  if (changed.length === 0 && unavailable.length === 0) {
    return <Notice>Prices and availability checked just now; nothing has changed since you saved this routine.</Notice>;
  }
  const name = (id: string) => PRODUCT.get(id)?.name ?? id;
  return (
    <Notice
      tone="warn"
      action={
        unavailable.length > 0 ? (
          <Button size="sm" variant="outline" className="rounded-full" onClick={onRecalculate}>
            Find alternatives
          </Button>
        ) : undefined
      }
    >
      <span className="block">Since you saved this routine:</span>
      <ul className="mt-1 list-disc pl-5">
        {changed.map((q) => (
          <li key={q.skuId}>
            {name(q.productId)} is now {formatPaise(q.currentPaise!)} (was {formatPaise(q.savedPaise)}).
          </li>
        ))}
        {unavailable.map((q) => (
          <li key={q.skuId}>{name(q.productId)} is not available right now, so it cannot be added to your bag.</li>
        ))}
      </ul>
      <span className="mt-1 block">Your saved schedule is unchanged. Totals use current prices.</span>
    </Notice>
  );
}

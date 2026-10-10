'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/price';
import { PRODUCTS } from '@/data/mock-data';
import type { ReleaseResponse } from '@/app/api/catalog/release/route';
import { trackOrder, type TrackState } from '@/app/track-order/actions';
import { requestQuote } from '@/lib/quote-client';
import { cn } from '@/lib/utils';
import { answer, buildIndex, MAX_QUERY_CHARS, type Answer, type RoutineContext } from '@/modules/assistant/assistant';

/**
 * The desktop knowledge assistant. Questions are answered on this device
 * from the published knowledge release; they are not sent to any server,
 * logged or cached. Prices come from the live quote service and orders
 * only through the existing order lookup (order number and email). All
 * text renders as text: nothing here uses HTML from an answer.
 */

type Turn = { id: number; question: string; answer: Answer };

export function AssistantPanel({ routine, className }: { routine?: RoutineContext; className?: string }) {
  const [release, setRelease] = useState<ReleaseResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const logRef = useRef<HTMLOListElement>(null);
  const inputId = useId();

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog/release', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setRelease)
      .catch((e) => e?.name !== 'AbortError' && setFailed(true));
    return () => controller.abort();
  }, []);

  const index = useMemo(() => (release ? buildIndex(release, PRODUCTS) : null), [release]);

  const ask = (q: string) => {
    if (!index || !q.trim()) return;
    setTurns((t) => [
      ...t.slice(-19),
      { id: Date.now(), question: q.slice(0, MAX_QUERY_CHARS), answer: answer(index, q, routine ?? null) },
    ]);
    setQuestion('');
  };

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className={cn('flex flex-col rounded-3xl border border-border bg-card', className)}
    >
      <header className="border-b border-border px-6 py-5">
        <h2 id={`${inputId}-heading`} className="text-lg font-medium">
          Ask about ingredients, products{routine ? ' and your routine' : ''}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers come only from our reviewed information. Not medical advice.
        </p>
      </header>

      <ol ref={logRef} aria-live="polite" className="max-h-[28rem] flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {turns.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {failed
              ? 'The assistant could not load. Try again later.'
              : !index
                ? 'Loading…'
                : 'Try: "What is niacinamide?", "How much is the sunscreen?" or "Where is my order?"'}
          </li>
        )}
        {turns.map((t) => (
          <li key={t.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm">
              <span className="sr-only">You asked: </span>
              {t.question}
            </p>
            <AnswerView a={t.answer} onAsk={ask} />
          </li>
        ))}
      </ol>

      <form
        className="flex gap-2 border-t border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <input
          id={inputId}
          value={question}
          maxLength={MAX_QUERY_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!index}
          autoComplete="off"
          className="flex-1 rounded-full border border-border bg-transparent px-4 py-2 text-sm"
          placeholder="Ask a question"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          disabled={!index || !question.trim()}
          aria-label="Ask"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}

function AnswerView({ a, onAsk }: { a: Answer; onAsk: (q: string) => void }) {
  return (
    <div className="max-w-[90%] space-y-2 text-[15px] leading-relaxed">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {a.personalized
          ? 'About your routine'
          : a.kind === 'unsupported'
            ? 'Not something we can answer'
            : 'General information'}
      </p>
      {a.text.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {a.action?.type === 'price' && <PriceCheck productId={a.action.productId} />}
      {a.action?.type === 'order' && <OrderCheck />}
      {a.options && a.options.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1">
          {a.options.map((o) => (
            <li key={o.label}>
              {o.query === 'routine finder' ? (
                <Link
                  href="/routine-finder"
                  className="inline-block rounded-full border border-border px-3 py-1 text-sm hover:border-foreground"
                >
                  {o.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => onAsk(o.query)}
                  className="rounded-full border border-border px-3 py-1 text-sm hover:border-foreground"
                >
                  {o.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {a.sources.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Sources</summary>
          <ul className="mt-1 list-disc pl-5">
            {a.sources.map((s) => (
              <li key={s.id}>
                {s.url && /^https:\/\//.test(s.url) ? (
                  <a href={s.url} rel="noopener noreferrer" target="_blank" className="underline">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Knowledge release {a.release.id}
        {a.release.published ? '' : ' (preview)'}
      </p>
    </div>
  );
}

/** Current price and stock for each size, from the live quote service. */
function PriceCheck({ productId }: { productId: string }) {
  const product = PRODUCTS.find((p) => p.id === productId)!;
  const [state, setState] = useState<
    { size: string; paise: number | undefined; stock: number | null }[] | 'error' | null
  >(null);
  useEffect(() => {
    const controller = new AbortController();
    const keys = product.sizes.map((s) => `${product.id}::${s.label}`);
    requestQuote(keys.sort().join(','), { signal: controller.signal })
      .then(({ quote }) =>
        setState(
          product.sizes.map((s) => ({
            size: s.label,
            paise: quote.prices[`${product.id}::${s.label}`]?.price,
            stock: quote.stock ? (quote.stock[`${product.id}::${s.label}`] ?? 0) : null,
          }))
        )
      )
      .catch((e) => e?.name !== 'AbortError' && setState('error'));
    return () => controller.abort();
  }, [product]);
  if (state === null)
    return (
      <p role="status">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />
        Checking current prices…
      </p>
    );
  if (state === 'error') return <p>We could not load current prices. Please try again.</p>;
  return (
    <ul className="space-y-1 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
      {state.map((s) => (
        <li key={s.size} className="flex justify-between gap-4">
          <span>
            {product.name}, {s.size}
          </span>
          <span className="flex items-center gap-3">
            {s.paise !== undefined && <Price amount={s.paise / 100} size="sm" />}
            <span className="text-muted-foreground">
              {s.stock === null ? 'Stock not confirmed' : s.stock > 0 ? 'In stock' : 'Out of stock'}
            </span>
          </span>
        </li>
      ))}
      <li className="pt-1 text-xs text-muted-foreground">Prices are confirmed again at checkout.</li>
    </ul>
  );
}

/** The existing order lookup: both the order number and the email it was placed with, rate limited server-side. */
function OrderCheck() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, {});
  const id = useId();
  return (
    <form action={action} className="space-y-2 rounded-2xl bg-muted/60 p-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1" htmlFor={`${id}-n`}>
          <span className="block font-medium">Order number</span>
          <input
            id={`${id}-n`}
            name="orderNumber"
            required
            maxLength={40}
            autoComplete="off"
            className="w-full rounded-full border border-border bg-background px-3 py-1.5"
          />
        </label>
        <label className="space-y-1" htmlFor={`${id}-e`}>
          <span className="block font-medium">Email used for the order</span>
          <input
            id={`${id}-e`}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className="w-full rounded-full border border-border bg-background px-3 py-1.5"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" className="rounded-full" disabled={pending}>
          {pending ? 'Checking…' : 'Check order'}
        </Button>
        <Link href="/account/orders" className="underline">
          Or see your orders when signed in
        </Link>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {state.found && (
        <p role="status">
          Order {state.found.orderNumber}, placed {state.found.placedOn}: {state.found.progress.label}.{' '}
          {state.found.progress.description}
        </p>
      )}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Review = { id: string; rating: number; title: string | null; body: string | null; createdAt: Date | string };

const stars = (n: number) => (
  <span className="inline-flex" aria-label={`${n} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`h-3.5 w-3.5 ${i <= n ? 'fill-foreground text-foreground' : 'text-muted-foreground/40'}`}
        aria-hidden="true"
      />
    ))}
  </span>
);

/**
 * Published reviews (all from verified purchases) and a form. Anyone may
 * try the form; the server accepts it only from an account whose order of
 * this product was delivered, and holds it for moderation.
 */
export function ProductReviews({
  productId,
  productName,
  reviews,
}: {
  productId: string;
  productName: string;
  reviews: { count: number; average: number | null; items: Review[] };
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'sent' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: 'busy' });
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, rating, title: title || undefined, body }),
    }).catch(() => null);
    if (res?.status === 201) return setState({ kind: 'sent' });
    const json = await res?.json().catch(() => null);
    setState({ kind: 'error', message: json?.error?.message ?? 'Could not send your review. Try again.' });
  };

  return (
    <section aria-labelledby="reviews-heading" className="container mx-auto max-w-4xl py-16">
      <h2 id="reviews-heading" className="text-2xl font-medium tracking-tight">
        Reviews
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {reviews.count > 0
          ? `${reviews.average} out of 5 from ${reviews.count} verified ${reviews.count === 1 ? 'purchase' : 'purchases'}.`
          : 'No reviews yet.'}{' '}
        Only customers whose order was delivered can review, and every review is read before it appears.
      </p>

      <ul className="mt-8 space-y-6">
        {reviews.items.map((r) => (
          <li key={r.id} className="border-b border-border pb-6">
            <div className="flex items-center gap-3">
              {stars(r.rating)}
              <span className="text-xs text-muted-foreground">
                Verified purchase ·{' '}
                {new Date(r.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            {r.title && <p className="mt-2 font-medium">{r.title}</p>}
            <p className="mt-1 text-[15px] leading-relaxed">{r.body}</p>
          </li>
        ))}
      </ul>

      {state.kind === 'sent' ? (
        <p className="mt-8 text-[15px]">Thank you. Your review will appear once it has been read.</p>
      ) : !open ? (
        <Button variant="outline" className="mt-8 rounded-full" onClick={() => setOpen(true)}>
          Write a review
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-8 max-w-xl space-y-4">
          <fieldset>
            <legend className="text-sm font-medium">Your rating of {productName}</legend>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    autoComplete="off"
                    checked={rating === n}
                    onChange={() => setRating(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            Title (optional)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Your review (at least 20 characters)
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              minLength={20}
              maxLength={2000}
              rows={5}
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Describe your own experience. Do not include personal details or medical claims.
          </p>
          <Button
            type="submit"
            className="rounded-full"
            disabled={rating === 0 || body.trim().length < 20 || state.kind === 'busy'}
          >
            {state.kind === 'busy' ? 'Sending…' : 'Send review'}
          </Button>
          {state.kind === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

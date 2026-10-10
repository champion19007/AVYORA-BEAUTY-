'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Email sign-up (double opt-in: the server emails a confirmation link). Used
 * in the footer and the routine finder's unlock step, so labels and size are
 * props. Always on a dark surface.
 */
export function NewsletterForm({
  heading = 'Newsletter',
  buttonLabel = 'Sign up',
  placeholder = 'you@example.com',
  large = false,
  onSubscribed,
}: {
  heading?: string | null;
  buttonLabel?: string;
  placeholder?: string;
  large?: boolean;
  /** Called once the server has accepted the address. */
  onSubscribed?: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, consent }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    setMessage(
      res?.ok
        ? { ok: true, text: json?.message }
        : { ok: false, text: json?.error?.message ?? 'Could not sign you up. Try again.' }
    );
    if (res?.ok) onSubscribed?.();
  };

  const control = large ? 'h-[52px] text-nv-label' : 'h-10 text-sm';
  return (
    <form
      onSubmit={submit}
      className={cn(large ? 'w-full max-w-[560px]' : 'mt-8 max-w-sm')}
      aria-labelledby={heading ? `${id}-heading` : undefined}
      aria-label={heading ? undefined : buttonLabel}
    >
      {heading && (
        <p id={`${id}-heading`} className="text-nv-label text-nv-faint">
          {heading}
        </p>
      )}
      <div className={cn('flex gap-2', heading && 'mt-2', large && 'flex-col sm:flex-row')}>
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(
            'nv-focus-light flex-1 rounded-full bg-white/10 px-5 text-white placeholder:text-white/55',
            control
          )}
          placeholder={placeholder}
        />
        <button
          type="submit"
          disabled={!consent || busy}
          className={cn(
            'nv-focus-light rounded-full bg-white px-6 text-nv-ink transition-colors hover:bg-white/90 disabled:opacity-50',
            control
          )}
        >
          {buttonLabel}
        </button>
      </div>
      <label className={cn('mt-3 flex items-start gap-2 text-white/70', large ? 'text-nv-small' : 'text-xs')}>
        <input
          type="checkbox"
          autoComplete="off"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        Email me Avyora news. I can unsubscribe from any email.
      </label>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={cn('mt-2 text-white/90', large ? 'text-nv-small' : 'text-xs')}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

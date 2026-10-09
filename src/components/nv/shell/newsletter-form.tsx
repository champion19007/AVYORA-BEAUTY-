'use client';

import { useState } from 'react';

/** Footer sign-up (NEXT_PUBLIC_NEWSLETTER=1). Double opt-in: the server emails a confirmation link. */
export function NewsletterForm() {
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
    setMessage(res?.ok ? { ok: true, text: json?.message } : { ok: false, text: json?.error?.message ?? 'Could not sign you up. Try again.' });
  };

  return (
    <form onSubmit={submit} className="mt-8 max-w-sm" aria-labelledby="newsletter-heading">
      <p id="newsletter-heading" className="text-nv-label text-nv-faint">
        Newsletter
      </p>
      <div className="mt-2 flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="nv-focus-light h-10 flex-1 rounded-full bg-white/10 px-4 text-sm text-white placeholder:text-white/50"
          placeholder="you@example.com"
        />
        <button type="submit" disabled={!consent || busy} className="nv-focus-light h-10 rounded-full bg-white px-5 text-sm text-nv-ink disabled:opacity-50">
          Sign up
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-white/70">
        <input type="checkbox" autoComplete="off" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        Email me Avyora news. I can unsubscribe from any email.
      </label>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className="mt-2 text-xs">
          {message.text}
        </p>
      )}
    </form>
  );
}

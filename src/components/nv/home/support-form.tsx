'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { cn } from '@/lib/utils';

type Errors = Partial<Record<'name' | 'email' | 'message' | 'contactConsent', string>>;

const field =
  'nv-focus-light w-full border-0 border-b border-white/40 bg-transparent px-0 py-3 text-nv-body text-white placeholder:text-white/50 focus:border-white';

/**
 * The consultation form, sent to POST /api/support. A real request staff
 * answer by email; no response time is promised because none is
 * confirmed. Input is kept on failure so nothing has to be retyped.
 */
export function SupportForm() {
  const [values, setValues] = useState({ name: '', email: '', message: '', contactConsent: false });
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'failed'; text?: string }>({ kind: 'idle' });

  const validate = (): Errors => {
    const e: Errors = {};
    if (!values.name.trim()) e.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) e.email = 'Enter an email address like name@example.com.';
    if (!values.message.trim()) e.message = 'Tell us how we can help.';
    if (!values.contactConsent) e.contactConsent = 'Please agree so we can reply to you.';
    return e;
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const body = (await res.json().catch(() => ({}))) as { reference?: string; error?: { message?: string } };
      if (res.ok) return setState({ kind: 'sent', text: `Received. Your reference is ${body.reference}. We will reply to ${values.email.trim()} by email.` });
      setState({ kind: 'failed', text: res.status === 429 ? 'You have sent several requests just now. Please try again later.' : (body.error?.message ?? 'We could not send your request.') });
    } catch {
      setState({ kind: 'failed', text: 'We could not reach the server. Your message is still here; try again.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <p role="status" className="max-w-[500px] text-nv-intro text-white">
        {state.text}
      </p>
    );
  }

  const describe = (k: keyof Errors) => (errors[k] ? `support-${k}-error` : undefined);
  const err = (k: keyof Errors) =>
    errors[k] && (
      <p id={`support-${k}-error`} className="mt-2 text-nv-small text-[#ffb4a8]">
        {errors[k]}
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[500px] flex-col gap-6">
      <div>
        <label htmlFor="support-name" className="text-nv-label text-white">
          Name <span aria-hidden="true">*</span>
        </label>
        <input id="support-name" autoComplete="name" required maxLength={80} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} aria-invalid={Boolean(errors.name) || undefined} aria-describedby={describe('name')} className={field} />
        {err('name')}
      </div>
      <div>
        <label htmlFor="support-email" className="text-nv-label text-white">
          Email <span aria-hidden="true">*</span>
        </label>
        <input id="support-email" type="email" autoComplete="email" required maxLength={254} value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} aria-invalid={Boolean(errors.email) || undefined} aria-describedby={describe('email')} className={field} />
        {err('email')}
      </div>
      <div>
        <label htmlFor="support-message" className="text-nv-label text-white">
          Message <span aria-hidden="true">*</span>
        </label>
        <textarea id="support-message" required maxLength={2000} rows={3} value={values.message} onChange={(e) => setValues({ ...values, message: e.target.value })} aria-invalid={Boolean(errors.message) || undefined} aria-describedby={describe('message')} className={cn(field, 'resize-y')} />
        {err('message')}
        <p className="mt-2 text-nv-small text-white/60">Please do not include medical history; we cannot give medical advice.</p>
      </div>
      <div>
        <label className="flex items-start gap-3 text-nv-label text-white/90">
          <input type="checkbox" checked={values.contactConsent} onChange={(e) => setValues({ ...values, contactConsent: e.target.checked })} aria-invalid={Boolean(errors.contactConsent) || undefined} aria-describedby={describe('contactConsent')} className="mt-1 h-4 w-4 accent-white" />
          Reply to me by email about this request. No marketing.
        </label>
        {err('contactConsent')}
      </div>
      {state.kind === 'failed' && (
        <p role="alert" className="text-nv-label text-[#ffb4a8]">
          {state.text} You can also email {SUPPORT_EMAIL}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-6">
        <button type="submit" disabled={state.kind === 'sending'} className="nv-focus-light inline-flex h-[60px] items-center gap-2 rounded-[40px] bg-white px-6 text-nv-label text-nv-ink transition-colors hover:bg-white/90 disabled:opacity-70">
          {state.kind === 'sending' && <Loader2 className="nv-motion h-4 w-4 animate-spin" aria-hidden="true" />}
          {state.kind === 'sending' ? 'Sending…' : 'Send request'}
        </button>
        <p className="text-nv-label text-white/60">
          Used only to answer you.{' '}
          <Link href="/privacy" className="nv-focus-light text-white underline-offset-4 hover:underline">
            Privacy policy
          </Link>
        </p>
      </div>
    </form>
  );
}

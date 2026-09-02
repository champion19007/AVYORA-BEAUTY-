'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, Phone, ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoDark } from '@/components/logo';
import { GoogleSignInButton } from '@/components/account-menu';
import type { AccountMethods } from '@/lib/customer-accounts';
import {
  lookupAccount,
  passwordSignIn,
  passwordSignUp,
  requestCode,
  verifyCode,
  type ActionState,
} from './actions';

/**
 * Customer sign-in and sign-up.
 *
 * Email-first, the pattern Google and Amazon both use: ask for the address,
 * then show only the ways *that* address can actually get in. Showing every
 * method at once means a customer who registered with Google is offered a
 * password box that will never work, and a new visitor cannot tell whether
 * they are supposed to sign in or register.
 *
 * Methods whose delivery channel is unconfigured are not offered at all.
 * Nothing is worse than typing a phone number and waiting for an SMS that no
 * one is sending.
 */

type Step = 'email' | 'choose' | 'password' | 'signup' | 'code' | 'phone' | 'phone-code';

export function CustomerAuth({
  googleEnabled,
  emailCodesEnabled,
  smsCodesEnabled,
  passwordsEnabled,
  mode,
}: {
  googleEnabled: boolean;
  emailCodesEnabled: boolean;
  smsCodesEnabled: boolean;
  /** False when there is no database, in which case nothing but Google works. */
  passwordsEnabled: boolean;
  mode: 'signin' | 'signup';
}) {
  const searchParams = useSearchParams();

  // Only same-site paths: an absolute URL here would let a crafted link bounce
  // a freshly authenticated customer onto an attacker's page.
  const requested = searchParams.get('callbackUrl') ?? '/account';
  const callbackUrl =
    requested.startsWith('/') && !requested.startsWith('//') ? requested : '/account';

  const [step, setStep] = useState<Step>(mode === 'signup' ? 'signup' : 'email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // What the looked-up account can actually do, so the picker offers only
  // methods that will work for it.
  const [methods, setMethods] = useState<AccountMethods | null>(null);

  return (
    <div className="w-full px-4 py-12">
      <Card className="mx-auto w-full max-w-md border-border/60">
        <CardHeader className="items-center text-center">
          <LogoDark className="mb-4" />
          <CardTitle className="font-headline text-3xl font-normal tracking-tight">
            {step === 'signup' ? 'Create your account' : 'Welcome back'}
          </CardTitle>
          <CardDescription className="text-[15px] leading-relaxed">
            {step === 'signup'
              ? 'Save your addresses, follow your orders, and keep your routine in one place.'
              : 'Sign in to see your orders, addresses and routine.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 'email' && (
            <EmailStep
              passwordsEnabled={passwordsEnabled}
              googleEnabled={googleEnabled}
              smsCodesEnabled={smsCodesEnabled}
              callbackUrl={callbackUrl}
              onFound={(value, next, found) => {
                setEmail(value);
                setMethods(found);
                setStep(next);
              }}
              onPhone={() => setStep('phone')}
            />
          )}

          {step === 'choose' && (
            <ChooseStep
              email={email}
              methods={methods}
              googleEnabled={googleEnabled}
              emailCodesEnabled={emailCodesEnabled}
              callbackUrl={callbackUrl}
              onBack={() => setStep('email')}
              onPassword={() => setStep('password')}
              onCode={() => setStep('code')}
            />
          )}

          {step === 'password' && (
            <PasswordStep email={email} onBack={() => setStep('choose')} next={callbackUrl} />
          )}

          {step === 'signup' && (
            <SignUpStep
              googleEnabled={googleEnabled}
              passwordsEnabled={passwordsEnabled}
              callbackUrl={callbackUrl}
              next={callbackUrl}
            />
          )}

          {step === 'code' && (
            <CodeStep
              channel="email"
              identifier={email}
              onBack={() => setStep('choose')}
              next={callbackUrl}
            />
          )}

          {step === 'phone' && (
            <PhoneStep
              onSent={(value) => {
                setPhone(value);
                setStep('phone-code');
              }}
              onBack={() => setStep('email')}
            />
          )}

          {step === 'phone-code' && (
            <CodeStep
              channel="sms"
              identifier={phone}
              onBack={() => setStep('phone')}
              next={callbackUrl}
            />
          )}

          <p className="mt-6 border-t border-border pt-5 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
              terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
              privacy policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

/** Step one: the email address, which decides what comes next. */
function EmailStep({
  passwordsEnabled,
  googleEnabled,
  smsCodesEnabled,
  callbackUrl,
  onFound,
  onPhone,
}: {
  passwordsEnabled: boolean;
  googleEnabled: boolean;
  smsCodesEnabled: boolean;
  callbackUrl: string;
  onFound: (email: string, next: Step, methods: AccountMethods) => void;
  onPhone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(lookupAccount, {});

  // Held in state, not a local: the component re-renders when the action
  // resolves, and a plain variable would be back to '' by the time the effect
  // below reads it.
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!state.methods) return;
    // A known account goes to the method picker; an unknown one to sign-up,
    // so a new customer is not told "no account" and left with nowhere to go.
    onFound(typed, state.methods.exists ? 'choose' : 'signup', state.methods);
  }, [state.methods]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!passwordsEnabled) {
    return (
      <>
        <GoogleSignInButton enabled={googleEnabled} callbackUrl={callbackUrl} />
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Email and phone sign-in need a database, which is not configured here.
        </p>
      </>
    );
  }

  return (
    <>
      <form action={action}>
        <Label htmlFor="email" className="text-[13px] font-medium">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={typed}
          onChange={(e) => setTyped(e.target.value.trim().toLowerCase())}
          className="mt-1.5 h-12 rounded-md"
        />
        {state.error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {state.error}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="mt-4 h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
        >
          {pending ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      <Divider />

      <GoogleSignInButton enabled={googleEnabled} callbackUrl={callbackUrl} />

      {smsCodesEnabled && (
        <Button
          type="button"
          variant="outline"
          onClick={onPhone}
          className="mt-3 h-12 w-full gap-2 rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
        >
          <Phone className="h-4 w-4" />
          Use mobile number
        </Button>
      )}
    </>
  );
}

/** Step two for a known account: which of its methods to use. */
/**
 * Step two for a known account: which of *its* methods to use.
 *
 * Only the methods the account actually has are offered. Showing "use
 * password" to someone who registered with Google sends them to a box no
 * password will ever open — they cannot tell whether they have forgotten a
 * password or never had one.
 */
function ChooseStep({
  email,
  methods,
  googleEnabled,
  emailCodesEnabled,
  callbackUrl,
  onBack,
  onPassword,
  onCode,
}: {
  email: string;
  methods: AccountMethods | null;
  googleEnabled: boolean;
  emailCodesEnabled: boolean;
  callbackUrl: string;
  onBack: () => void;
  onPassword: () => void;
  onCode: () => void;
}) {
  const hasPassword = methods?.hasPassword ?? false;
  const hasGoogle = methods?.hasGoogle ?? false;

  return (
    <>
      <Back onClick={onBack} label={email} />

      {hasPassword && (
        <Button
          type="button"
          onClick={onPassword}
          className="h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
        >
          Use password
        </Button>
      )}

      {emailCodesEnabled && (
        <Button
          type="button"
          variant={hasPassword ? 'outline' : 'default'}
          onClick={onCode}
          className="mt-3 h-12 w-full gap-2 rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
        >
          <Mail className="h-4 w-4" />
          Email me a code
        </Button>
      )}

      {hasGoogle && (
        <>
          {(hasPassword || emailCodesEnabled) && <Divider />}
          <p className="mb-3 text-center text-[13px] text-muted-foreground">
            This account was created with Google.
          </p>
          <GoogleSignInButton enabled={googleEnabled} callbackUrl={callbackUrl} />
        </>
      )}

      {/* Nothing available: an account with no password, no Google link, and
          no code delivery configured. Say so rather than showing an empty card. */}
      {!hasPassword && !hasGoogle && !emailCodesEnabled && (
        <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
          This account has no sign-in method available on this deployment.
          Please contact us.
        </p>
      )}
    </>
  );
}

function PasswordStep({
  email,
  onBack,
  next,
}: {
  email: string;
  onBack: () => void;
  next: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(passwordSignIn, {});

  useEffect(() => {
    if (state.done) completeSignIn(next);
  }, [state.done, next]);

  return (
    <form action={action}>
      <Back onClick={onBack} label={email} />
      <input type="hidden" name="email" value={email} />

      <Label htmlFor="password" className="text-[13px] font-medium">
        Password
      </Label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className="mt-1.5 h-12 rounded-md"
      />

      {state.error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="mt-4 h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function SignUpStep({
  googleEnabled,
  passwordsEnabled,
  callbackUrl,
  next,
}: {
  googleEnabled: boolean;
  passwordsEnabled: boolean;
  callbackUrl: string;
  next: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(passwordSignUp, {});

  useEffect(() => {
    if (state.done) completeSignIn(next);
  }, [state.done, next]);

  if (!passwordsEnabled) return <GoogleSignInButton enabled={googleEnabled} callbackUrl={callbackUrl} />;

  return (
    <>
      <form action={action}>
        <Label htmlFor="su-name" className="text-[13px] font-medium">
          Name
        </Label>
        <Input id="su-name" name="name" autoComplete="name" className="mb-4 mt-1.5 h-12 rounded-md" />

        <Label htmlFor="su-email" className="text-[13px] font-medium">
          Email
        </Label>
        <Input
          id="su-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mb-4 mt-1.5 h-12 rounded-md"
        />

        <Label htmlFor="su-password" className="text-[13px] font-medium">
          Password
        </Label>
        <Input
          id="su-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1.5 h-12 rounded-md"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          At least 10 characters. A phrase you will remember beats a short, complicated one.
        </p>

        {state.error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="mt-4 h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
        >
          {pending ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <Divider />
      <GoogleSignInButton enabled={googleEnabled} callbackUrl={callbackUrl} />

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}

/** Phone number entry, before the code is sent. */
function PhoneStep({ onSent, onBack }: { onSent: (phone: string) => void; onBack: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestCode, {});
  const [value, setValue] = useState('');

  useEffect(() => {
    if (state.sent) onSent(value);
  }, [state.sent]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action}>
      <Back onClick={onBack} label="Use another method" />
      <input type="hidden" name="channel" value="sms" />

      <Label htmlFor="phone" className="text-[13px] font-medium">
        Mobile number
      </Label>
      <Input
        id="phone"
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        required
        autoFocus
        placeholder="10-digit number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1.5 h-12 rounded-md"
      />

      {state.error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="mt-4 h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
      >
        {pending ? 'Sending…' : 'Send code'}
      </Button>
    </form>
  );
}

/** The six-digit code step, shared by email and SMS. */
function CodeStep({
  channel,
  identifier,
  onBack,
  next,
}: {
  channel: 'email' | 'sms';
  identifier: string;
  onBack: () => void;
  next: string;
}) {
  const [verifyState, verifyAction, verifying] = useActionState<ActionState, FormData>(
    verifyCode,
    {}
  );
  const [resendState, resendAction, resending] = useActionState<ActionState, FormData>(
    requestCode,
    {}
  );

  useEffect(() => {
    if (verifyState.done) completeSignIn(next);
  }, [verifyState.done, next]);

  const field = channel === 'sms' ? 'phone' : 'email';

  return (
    <>
      <Back onClick={onBack} label={identifier} />

      <form action={verifyAction}>
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name={field} value={identifier} />

        <Label htmlFor="code" className="text-[13px] font-medium">
          6-digit code
        </Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          required
          autoFocus
          className="mt-1.5 h-12 rounded-md text-center text-lg tracking-[0.4em]"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Sent to {identifier}. It expires in 10 minutes.
        </p>

        {verifyState.error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {verifyState.error}
          </p>
        )}

        <Button
          type="submit"
          disabled={verifying}
          className="mt-4 h-12 w-full rounded-md text-xs font-semibold uppercase tracking-[0.18em]"
        >
          {verifying ? 'Checking…' : 'Sign in'}
        </Button>
      </form>

      <form action={resendAction} className="mt-3">
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name={field} value={identifier} />
        <Button
          type="submit"
          variant="ghost"
          disabled={resending}
          className="h-10 w-full rounded-md text-[11px] font-semibold uppercase tracking-[0.18em]"
        >
          {resending ? 'Sending…' : 'Send a new code'}
        </Button>
      </form>

      {resendState.error && (
        <p className="mt-1 text-center text-xs text-destructive" role="alert">
          {resendState.error}
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared pieces                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Leaves the sign-in page after a successful password or code sign-in.
 *
 * A full document load, not `router.push`. These flows set the session cookie
 * from a server action, and SessionProvider caches the session it fetched when
 * the page first loaded — which was "signed out". A client-side navigation
 * keeps that stale value, so the header would still offer "Sign in" to a
 * customer who had just signed in, until they reloaded by hand.
 *
 * Google sign-in does not need this: it leaves the site and comes back, which
 * is a document load by definition.
 */
function completeSignIn(next: string): void {
  window.location.assign(next);
}

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 flex w-full items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

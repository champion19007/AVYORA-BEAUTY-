'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LogoDark } from '@/components/logo';
import { GoogleSignInButton } from '@/components/account-menu';

/**
 * Customer sign-in and sign-up.
 *
 * One component serves both: the only difference between signing in and
 * creating an account with Google is the wording, because the OAuth round trip
 * is identical and the adapter creates the user row on first return. Rendering
 * two near-identical pages from one component keeps them from drifting apart.
 *
 * The admin credential form used to live on this page, which meant every
 * customer was shown a username and password box for an operator account they
 * could never have — confusing at best, and it advertised that an admin panel
 * exists. That form now lives at /admin/login.
 */
export function CustomerAuth({
  googleEnabled,
  mode,
}: {
  googleEnabled: boolean;
  mode: 'signin' | 'signup';
}) {
  /**
   * Where to land afterwards.
   *
   * Pages that require an account send the visitor here with their own path in
   * `callbackUrl`, so signing in returns them to what they were trying to do.
   *
   * Only same-site paths are honoured: an absolute URL here would let a crafted
   * link bounce a freshly authenticated customer onto an attacker's page.
   */
  const searchParams = useSearchParams();
  const requested = searchParams.get('callbackUrl') ?? '/account';
  const callbackUrl = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/account';

  const isSignUp = mode === 'signup';

  return (
    <div className="w-full px-4 py-12">
      <Card className="mx-auto w-full max-w-md border-border/60">
        <CardHeader className="items-center text-center">
          <LogoDark className="mb-4" />
          <CardTitle className="font-headline text-3xl font-normal tracking-tight">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </CardTitle>
          <CardDescription className="text-[15px] leading-relaxed">
            {isSignUp
              ? 'Save your addresses, follow your orders, and keep your routine in one place.'
              : 'Sign in to see your orders, addresses and routine.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <GoogleSignInButton enabled={googleEnabled} callbackUrl={callbackUrl} />

          <p className="mt-6 text-center text-[13px] leading-relaxed text-muted-foreground">
            {isSignUp ? 'Already have an account? ' : 'New to Avyora? '}
            <Link
              href={isSignUp ? '/login' : '/signup'}
              className="text-primary underline underline-offset-4"
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </Link>
          </p>

          <p className="mt-6 border-t border-border pt-5 text-center text-xs leading-relaxed text-muted-foreground">
            {isSignUp
              ? 'By continuing you agree to our '
              : 'Protected by Google. By continuing you agree to our '}
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

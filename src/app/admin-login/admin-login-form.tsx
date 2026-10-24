'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoDark } from '@/components/logo';
import { useApp } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

/**
 * Operator sign-in.
 *
 * Separate from the customer flow on purpose. This form previously sat on
 * /login, so every shopper was shown a username and password box for an
 * account they could never hold — and its presence advertised that an admin
 * panel exists. Customers now get /login (Google); this is staff only.
 */
export function AdminLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Owner two-step sign-in: set once the server has emailed a code.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  /**
   * Admin credentials are checked on the server.
   *
   * This previously compared `qwerty` / `12345678` here in the browser, which
   * put both values into the JavaScript bundle every visitor downloads. The
   * server now verifies them and issues an httpOnly session cookie; the client
   * never sees the credentials or the session token.
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(needsCode ? { code } : {}) }),
      });

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { role?: string; step?: string };
        if (body.step === 'code') {
          setNeedsCode(true);
          setIsLoading(false);
          toast({ title: 'Check your email', description: 'We sent a 6-digit sign-in code to the owner’s email.' });
          return;
        }
        login(username, true);
        toast({
          title: 'Admin access granted',
          description: 'Welcome to the Avyora control panel.',
        });
        /*
         * Land on the console the role can actually use.
         *
         * A manager sent to /admin would be bounced straight back out by the
         * owner-only layout, which reads as a broken login rather than as a
         * permission boundary. The role comes from the server's response, not
         * from anything the form could set.
         */
        router.push(body?.role === 'manager' ? '/manager' : '/admin');
        return;
      }

      // 503 means the deployment has no admin credentials configured. Say so,
      // rather than implying the password was wrong.
      if (response.status === 503) {
        toast({
          variant: 'destructive',
          title: 'Admin access unavailable',
          description: 'Admin credentials are not configured on this deployment.',
        });
        setIsLoading(false);
        return;
      }

      // There is deliberately no customer fallback here.
      //
      // This branch used to sign anyone in as a "customer" if they typed any
      // username and any password of six characters or more — no lookup, no
      // password check, no account required. It granted a session to a person
      // who had never registered, on a credential nobody had ever set.
      //
      // Customer identity is Google sign-in, which verifies the person and
      // writes a real session row. This form is the admin credential only.
      const failure = (await response.json().catch(() => ({}))) as { error?: string };
      toast({
        variant: 'destructive',
        title: needsCode ? 'Code not accepted' : 'Authentication failed',
        description: needsCode
          ? (failure.error ?? 'Check the code and try again.')
          : 'Please check your credentials and try again.',
      });
      setIsLoading(false);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Could not reach the server',
        description: 'Check your connection and try again.',
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto max-w-sm w-full rounded-md border border-border shadow-luxe">
      <CardHeader className="space-y-4 text-center pb-8 border-b border-border mb-6">
        <LogoDark className="justify-center" />
        <div className="space-y-2">
          <CardTitle className="font-semibold text-2xl uppercase tracking-tighter">Welcome Back</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase tracking-widest">
            Enter your clinical credentials to proceed
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="username" className="text-[10px] font-semibold uppercase tracking-widest">
              Username / Email
            </Label>
            <Input
              id="username"
              placeholder="Username or email"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-md border border-border h-12 text-xs focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[10px] font-semibold uppercase tracking-widest">
                Password
              </Label>
              <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">Forgot? Ask the owner</span>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-border h-12 text-xs focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>
          {needsCode && (
            <div className="grid gap-2">
              <Label htmlFor="code" className="text-[10px] font-semibold uppercase tracking-widest">
                Code from your email
              </Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="rounded-md border border-border h-12 text-xs tracking-[0.4em] focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-foreground text-background hover:bg-primary hover:text-primary-foreground h-14 rounded-md font-semibold uppercase tracking-widest text-[10px] transition-all"
          >
            {isLoading ? 'Authenticating...' : needsCode ? 'Confirm code' : 'Login'}
          </Button>
        </form>
        <div className="mt-8 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            Shopping?{' '}
            <Link href="/login" className="underline font-semibold text-foreground opacity-100">
              Customer sign in
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

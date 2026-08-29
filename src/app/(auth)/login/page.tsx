'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoDark } from '@/components/logo';
import { useApp } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        login(username, true);
        toast({
          title: 'Admin access granted',
          description: 'Welcome to the Avyora control panel.',
        });
        router.push('/admin');
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

      // Not an admin: fall back to the ordinary customer session.
      if (username && password.length >= 6) {
        login(username, false);
        router.push('/');
        return;
      }

      toast({
        variant: 'destructive',
        title: 'Authentication failed',
        description: 'Please check your credentials and try again.',
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
            <Label htmlFor="username" className="text-[10px] font-semibold uppercase tracking-widest">Username / Email</Label>
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
              <Label htmlFor="password" className="text-[10px] font-semibold uppercase tracking-widest">Password</Label>
              <Link
                href="#"
                className="text-[8px] font-bold uppercase tracking-widest underline opacity-60 hover:opacity-100"
              >
                Forgot?
              </Link>
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
          <Button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-foreground text-background hover:bg-primary hover:text-white h-14 rounded-md font-semibold uppercase tracking-widest text-[10px] transition-all"
          >
            {isLoading ? "Authenticating..." : "Login"}
          </Button>
          <Button variant="outline" type="button" className="w-full border border-border h-14 rounded-md font-semibold uppercase tracking-widest text-[10px]">
            Login with Google
          </Button>
        </form>
        <div className="mt-8 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            No account?{' '}
            <Link href="/signup" className="underline font-semibold text-foreground opacity-100">
              Join the Circle
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

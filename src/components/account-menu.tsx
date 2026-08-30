'use client';

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import { User, LogOut, Package, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApp } from '@/lib/store';

/**
 * Account control in the header.
 *
 * Google sign-in worked end to end — button, OAuth round trip, session row in
 * Postgres — but nothing in the interface read the session, so a signed-in
 * customer still saw an anonymous person icon and had no way to sign out. This
 * is the missing half.
 *
 * `useSession` is the authority on identity. The `useApp` store also holds a
 * user, but that is the older localStorage mock kept for the admin flow; it is
 * cleared alongside the real session so the two cannot disagree.
 */
export function AccountMenu() {
  const { data: session, status } = useSession();
  const { logout } = useApp();

  // Render the same neutral control during loading as when signed out, so the
  // header does not shift once the session resolves.
  if (status !== 'authenticated' || !session.user) {
    return (
      <Link href="/login" className="hidden sm:flex">
        <Button variant="ghost" size="icon" aria-label="Sign in" className="hover:text-primary">
          <User className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  const { name, email, image } = session.user;
  const initial = (name ?? email ?? '?').trim().charAt(0).toUpperCase();

  const handleSignOut = async () => {
    // Clear the local mock user too, or the header would keep showing a stale
    // identity after the real session is gone.
    logout();
    await signOut({ callbackUrl: '/' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={`Account menu for ${name ?? email}`}
        >
          <Avatar className="h-7 w-7">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{name ?? 'Your account'}</p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/track-order" className="cursor-pointer gap-2">
            <Package className="h-4 w-4" />
            Your orders
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Sign-in button for the login page. Reports when the deployment has no Google
 * credentials configured rather than opening a broken OAuth round trip.
 */
export function GoogleSignInButton({
  enabled,
  callbackUrl = '/',
}: {
  enabled: boolean;
  callbackUrl?: string;
}) {
  if (!enabled) {
    return (
      <p className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
        Google sign-in is not configured on this deployment.
      </p>
    );
  }

  return (
    <Button
      variant="outline"
      type="button"
      onClick={() => signIn('google', { callbackUrl })}
      className="h-14 w-full gap-3 rounded-md border border-border text-[10px] font-semibold uppercase tracking-widest"
    >
      <GoogleMark />
      Continue with Google
    </Button>
  );
}

/** Google's mark, inlined so the button needs no external request. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v7.4h12.7c-.3 2.1-1.6 5.3-4.7 7.4l7.6 5.9c4.5-4.2 7.1-10.3 7.1-16.6z"
      />
      <path fill="#FBBC05" d="M10.4 28.7a14.8 14.8 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2 1.4-4.8 2.4-8.3 2.4-6.3 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export { LogIn };

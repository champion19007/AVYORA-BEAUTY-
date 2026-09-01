'use client';

import { SessionProvider } from 'next-auth/react';
import { AppProvider } from '@/lib/store';
import { AnnouncementBar } from './announcement-bar';
import { Header } from './header';
import { Footer } from './footer';
import { CartDrawer } from '../cart-drawer';
import { Toaster } from '@/components/ui/toaster';
import { usePathname } from 'next/navigation';

import { createContext, useContext } from 'react';

/**
 * Tells descendants whether a SessionProvider is mounted above them.
 *
 * `useSession` throws when there is no provider, and hooks cannot be called
 * conditionally, so components that need the session read this first and only
 * render their session-aware child when it is true.
 */
const AuthAvailableContext = createContext(false);
export const useAuthAvailable = () => useContext(AuthAvailableContext);

/** Wraps children in SessionProvider only when sign-in is actually available. */
function MaybeSession({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return (
    <AuthAvailableContext.Provider value={enabled}>
      {enabled ? <SessionProvider>{children}</SessionProvider> : children}
    </AuthAvailableContext.Provider>
  );
}

/**
 * This used to gate everything behind `if (!mounted) return null`, which meant
 * the server rendered an empty document: no header, no footer, no product
 * copy. Search engines saw a blank page, the prerendered HTML was a shell, and
 * nothing painted until hydration finished.
 *
 * The gate was presumably there to dodge a theme hydration mismatch, but
 * next-themes already handles that via `suppressHydrationWarning` on <html>
 * plus its inline pre-paint script. Client-only state (cart, wishlist, user)
 * starts empty on both server and client and is filled from localStorage in an
 * effect, so it hydrates consistently without a gate.
 */
export function ClientLayoutWrapper({
  children,
  authEnabled,
  deliverTo,
}: {
  children: React.ReactNode;
  /**
   * SessionProvider polls /api/auth/session. When auth is unconfigured that
   * endpoint returns 500, so mounting the provider anyway would log an error
   * on every page load. Gate it instead.
   */
  authEnabled: boolean;
  /**
   * The "deliver to" indicator, rendered on the server and passed in as an
   * element. This wrapper is a client component, so it cannot await the
   * customer's default address itself — receiving it as a prop keeps the
   * query, and the address, on the server.
   */
  deliverTo?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  if (isAuthPage) {
    return (
      <MaybeSession enabled={authEnabled}>
      <AppProvider>
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center transition-colors duration-300">
          <main className="w-full animate-in fade-in duration-700">
            {children}
          </main>
          <Toaster />
        </div>
      </AppProvider>
      </MaybeSession>
    );
  }

  return (
    <MaybeSession enabled={authEnabled}>
    <AppProvider>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground transition-colors duration-300">
        <AnnouncementBar />
        <Header deliverTo={deliverTo} />
        <main key={pathname} className="flex-1 w-full animate-in fade-in duration-700">
          {children}
        </main>
        <Footer />
        <CartDrawer />
        <Toaster />
      </div>
    </AppProvider>
    </MaybeSession>
  );
}

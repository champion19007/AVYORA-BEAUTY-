'use client';

import { AppProvider } from '@/lib/store';
import { AnnouncementBar } from './announcement-bar';
import { Header } from './header';
import { Footer } from './footer';
import { CartDrawer } from '../cart-drawer';
import { Toaster } from '@/components/ui/toaster';
import { usePathname } from 'next/navigation';

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
export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  if (isAuthPage) {
    return (
      <AppProvider>
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center transition-colors duration-300">
          <main className="w-full animate-in fade-in duration-700">
            {children}
          </main>
          <Toaster />
        </div>
      </AppProvider>
    );
  }

  return (
    <AppProvider>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground transition-colors duration-300">
        <AnnouncementBar />
        <Header />
        <main key={pathname} className="flex-1 w-full animate-in fade-in duration-700">
          {children}
        </main>
        <Footer />
        <CartDrawer />
        <Toaster />
      </div>
    </AppProvider>
  );
}

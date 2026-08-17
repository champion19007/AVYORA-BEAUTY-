'use client';

import { AppProvider } from '@/lib/store';
import { AnnouncementBar } from './announcement-bar';
import { Header } from './header';
import { Footer } from './footer';
import { CartDrawer } from '../cart-drawer';
import { Toaster } from '@/components/ui/toaster';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

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

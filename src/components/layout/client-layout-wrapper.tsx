'use client';

import { AppProvider } from '@/lib/store';
import { AnnouncementBar } from './announcement-bar';
import { Header } from './header';
import { Footer } from './footer';
import { CartDrawer } from '../cart-drawer';
import { Toaster } from '@/components/ui/toaster';
import { usePathname } from 'next/navigation';

export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  if (isAuthPage) {
    return (
      <AppProvider>
        <div className="min-h-screen bg-background flex items-center justify-center">
          {children}
          <Toaster />
        </div>
      </AppProvider>
    );
  }

  return (
    <AppProvider>
      <div className="flex min-h-screen w-full flex-col">
        <AnnouncementBar />
        <Header />
        <main className="flex-1 w-full">
          {children}
        </main>
        <Footer />
        <CartDrawer />
        <Toaster />
      </div>
    </AppProvider>
  );
}

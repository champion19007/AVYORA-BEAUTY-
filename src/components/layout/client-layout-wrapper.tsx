'use client';

import { AppProvider } from '@/lib/store';
import { AnnouncementBar } from './announcement-bar';
import { Header } from './header';
import { Footer } from './footer';
import { CartDrawer } from '../cart-drawer';
import { Toaster } from '@/components/ui/toaster';

export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AnnouncementBar />
      <Header />
      <main className="min-h-screen">
        {children}
      </main>
      <Footer />
      <CartDrawer />
      <Toaster />
    </AppProvider>
  );
}

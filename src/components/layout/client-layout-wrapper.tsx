
'use client';

import { AppProvider } from '@/lib/store';
import { AnnouncementBar } from './announcement-bar';
import { Header } from './header';
import { Footer } from './footer';
import { CartDrawer } from '../cart-drawer';
import { Toaster } from '@/components/ui/toaster';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './sidebar';
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
      <SidebarProvider>
        <div className="flex min-h-screen w-full overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex flex-col bg-background relative overflow-y-auto">
            <AnnouncementBar />
            <Header />
            <main className="flex-1 w-full">
              {children}
            </main>
            <Footer />
            <CartDrawer />
            <Toaster />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AppProvider>
  );
}

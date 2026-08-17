
'use client';

import { Search, Bell, HelpCircle, Keyboard, ShoppingBag } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from '@/components/user-nav';
import { useApp } from '@/lib/store';
import Link from 'next/link';

export function Header() {
  const pathname = usePathname();
  const { cart, setCartOpen } = useApp();
  
  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean);
    if (paths.length === 0) return null;
    
    return paths.map((path, index) => {
      const href = `/${paths.slice(0, index + 1).join('/')}`;
      const isLast = index === paths.length - 1;
      const label = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
      
      return (
        <span key={href} className="flex items-center gap-2">
          {index > 0 && <span className="text-muted-foreground">/</span>}
          <Link 
            href={href}
            className={isLast ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground transition-colors"}
          >
            {label}
          </Link>
        </span>
      );
    });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="lg:hidden" />
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium uppercase tracking-widest">
            {getBreadcrumbs() || (
              <div className="flex items-center gap-6">
                <Link href="/collections" className="hover:text-primary transition-colors">Shop</Link>
                <Link href="/collections?filter=bestsellers" className="hover:text-primary transition-colors">Best Sellers</Link>
                <Link href="/assistant" className="hover:text-primary transition-colors">AI Assistant</Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search... (Ctrl K)" className="pl-8 h-9 bg-muted/50 rounded-none border-none focus-visible:ring-1 focus-visible:ring-primary" />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Keyboard className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag className="h-4 w-4" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <div className="ml-2 border-l pl-4 hidden sm:block">
              <UserNav />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

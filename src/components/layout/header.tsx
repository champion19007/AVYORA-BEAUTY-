'use client';

import Link from 'next/link';
import { Search, User, Heart, ShoppingBag, Menu } from 'lucide-react';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { LogoDark } from '@/components/logo';

const NAV_ITEMS = [
  { name: 'Shop', href: '/collections' },
  { name: 'Best Sellers', href: '/collections?filter=bestsellers' },
  { name: 'Skin Care', href: '/collections?category=skin' },
  { name: 'Hair Care', href: '/collections?category=hair' },
  { name: 'AI Assistants', href: '#ai' },
  { name: 'Track Order', href: '/track-order' },
];

export function Header() {
  const { cart, wishlist, setCartOpen } = useApp();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/">
            <LogoDark className="text-xl" />
          </Link>

          <nav className="hidden lg:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <Link 
                key={item.name} 
                href={item.href}
                className="text-sm font-bold uppercase tracking-widest hover:text-accent transition-colors"
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <Search className="h-5 w-5" />
          </Button>
          <Link href="/wishlist">
            <Button variant="ghost" size="icon" className="hidden sm:flex relative">
              <Heart className="h-5 w-5" />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                  {wishlist.length}
                </span>
              )}
            </Button>
          </Link>
          <Link href="/account">
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="relative" onClick={() => setCartOpen(true)}>
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <div className="flex flex-col gap-6 mt-10">
                {NAV_ITEMS.map((item) => (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className="text-lg font-bold uppercase tracking-widest hover:text-accent"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

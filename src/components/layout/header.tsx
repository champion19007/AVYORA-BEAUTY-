'use client';

import React, { useState } from 'react';
import { Search, ShoppingBag, Heart, User, Menu, ChevronDown, ChevronRight, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/store';
import { Logo } from '@/components/logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Shop', href: '/collections' },
  { name: 'Best Sellers', href: '/collections?filter=bestsellers' },
  { 
    name: 'Skin & Body Care', 
    href: '/collections?category=skin',
    mega: true,
    concerns: ['Cleanse', 'Brightening', 'Dullness', 'Sun Protection', 'Dryness'],
    ingredients: ['Vitamin C', 'UV Filters', 'Ceramide', 'LHA'],
    categories: ['Cleanse', 'Treat', 'Moisturize', 'SPF', 'Body Lotion']
  },
  { 
    name: 'Hair Care', 
    href: '/collections?category=hair',
    mega: true,
    concerns: ['Damaged Hair'],
    ingredients: ['Peptide'],
    categories: ['Serum']
  },
  { name: 'AI Assistants', href: '/assistant' },
  { name: 'Track Order', href: '/track-order' },
];

export function Header() {
  const { cart, setCartOpen } = useApp();
  const pathname = usePathname();
  const [isSearchOpen, setSearchOpen] = useState(false);

  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, index) => {
    const href = `/${pathSegments.slice(0, index + 1).join('/')}`;
    const name = segment.replace(/-/g, ' ');
    return { name: name.charAt(0).toUpperCase() + name.slice(1), href };
  });

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0">
              <div className="flex flex-col p-6 space-y-4">
                <Logo className="mb-8" />
                {NAV_ITEMS.map((item) => (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className={cn(
                      "text-sm font-bold uppercase tracking-[0.2em] py-3 border-b border-muted transition-colors",
                      pathname === item.href ? "text-primary" : "text-foreground"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Logo className="hidden sm:flex" />
          
          <nav className="hidden lg:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <div key={item.name} className="group relative py-5">
                  <Link 
                    href={item.href}
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center gap-1 relative",
                      isActive 
                        ? "text-primary after:absolute after:bottom-[-20px] after:left-0 after:right-0 after:h-[2px] after:bg-primary" 
                        : "text-foreground hover:text-primary"
                    )}
                  >
                    {item.name}
                    {item.mega && <ChevronDown className="h-3 w-3" />}
                  </Link>
                  
                  {item.mega && (
                    <div className="absolute top-[100%] left-0 w-[650px] bg-background border shadow-2xl p-10 opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300 grid grid-cols-3 gap-8">
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] pb-3 border-b">Shop by Concern</h4>
                        <ul className="space-y-3">
                          {item.concerns?.map(c => (
                            <li key={c}><Link href={`/collections?concern=${c.toLowerCase().replace(' ', '-')}`} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">{c}</Link></li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] pb-3 border-b">Shop by Ingredient</h4>
                        <ul className="space-y-3">
                          {item.ingredients?.map(i => (
                            <li key={i}><Link href={`/collections?ingredient=${i.toLowerCase().replace(' ', '-')}`} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">{i}</Link></li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] pb-3 border-b">Category</h4>
                        <ul className="space-y-3">
                          {item.categories?.map(cat => (
                            <li key={cat}><Link href={`/collections?cat=${cat.toLowerCase().replace(' ', '-')}`} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">{cat}</Link></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-6">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(!isSearchOpen)} className="group">
              <Search className="h-4 w-4 group-hover:text-primary" />
            </Button>
            
            <Button variant="ghost" size="icon" className="hidden sm:flex group">
              <Heart className="h-4 w-4 group-hover:fill-primary group-hover:text-primary" />
            </Button>
            
            <Button variant="ghost" size="icon" className="relative group" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="h-4 w-4 group-hover:text-primary" />
              {cart.length > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground font-black">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              )}
            </Button>

            <Link href="/login" className="hidden sm:flex">
              <Button variant="ghost" size="icon" className="group">
                <User className="h-4 w-4 group-hover:text-primary" />
              </Button>
            </Link>

            <ThemeToggle />
          </div>
        </div>
      </div>

      {isSearchOpen && (
        <div className="absolute top-full left-0 w-full bg-background border-b p-4 animate-in slide-in-from-top-2 duration-300">
          <div className="container mx-auto flex gap-4">
            <Input 
              placeholder="Search products, ingredients, concerns..." 
              autoFocus
              className="rounded-none border-2 focus-visible:ring-0 text-sm"
            />
            <Button variant="ghost" onClick={() => setSearchOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {breadcrumbs.length > 0 && (
        <div className="bg-muted/30 py-2 border-t">
          <div className="container mx-auto px-4 flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            <Link href="/" className="hover:text-primary">Home</Link>
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={bc.href}>
                <ChevronRight className="h-2 w-2" />
                <Link 
                  href={bc.href} 
                  className={cn(i === breadcrumbs.length - 1 ? "text-foreground" : "hover:text-primary")}
                >
                  {bc.name}
                </Link>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

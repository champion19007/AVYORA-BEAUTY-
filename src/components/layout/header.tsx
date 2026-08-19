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
import { PRODUCTS } from '@/data/mock-data';

const NAV_ITEMS = [
  { name: 'Shop', href: '/collections' },
  { name: 'Best Sellers', href: '/collections?filter=bestsellers' },
  { 
    name: 'Skin & Body Care', 
    href: '/collections?category=skin',
    mega: true,
    concerns: ['Face Wash', 'Vitamin C Serum', 'Sunscreen', 'Body Lotion', 'Acne Control', 'Pigmentation', 'Fine Lines'],
    ingredients: ['Vitamin C Serum', 'Sunscreen', 'Body Lotion', 'Face Wash', 'Retinol', 'Niacinamide', 'Salicylic Acid'],
    categories: ['Face Wash', 'Vitamin C Serum', 'Sunscreen', 'Body Lotion', 'Under Eye']
  },
  { 
    name: 'Hair Care', 
    href: '/collections?category=hair',
    mega: true,
    concerns: ['Hair Serum', 'Hair Fall', 'Dandruff', 'Scalp Irritation'],
    ingredients: ['Hair Serum', 'Capixyl', 'Maleic Acid'],
    categories: ['Hair Serum', 'Shampoo', 'Oil']
  },
  { name: 'Routine Finder', href: '/routine-finder' },
  { name: 'Track Order', href: '/track-order' },
];

const labelToId = (label: string) => {
  const map: Record<string, string> = {
    'Face Wash': 'face-wash',
    'Vitamin C Serum': 'vitamin-c-serum',
    'Hair Serum': 'hair-serum',
    'Retinol': 'retinol',
    'Sunscreen': 'sunscreen',
    'Body Lotion': 'body-lotion',
  };
  return map[label] || label.toLowerCase().replace(/ /g, '-');
};

export function Header() {
  const { cart, setCartOpen } = useApp();
  const pathname = usePathname();
  const [isSearchOpen, setSearchOpen] = useState(false);

  const activeConcerns = new Set();
  const activeIngredients = new Set();
  const activeCategories = new Set();
  
  PRODUCTS.forEach(p => {
    p.concerns.forEach(c => activeConcerns.add(c.toLowerCase()));
    p.ingredients.forEach(i => activeIngredients.add(i.toLowerCase()));
    activeCategories.add(p.id.toLowerCase());
  });

  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, index) => {
    const href = `/${pathSegments.slice(0, index + 1).join('/')}`;
    const name = segment.replace(/-/g, ' ');
    return { name: name.charAt(0).toUpperCase() + name.slice(1), href };
  });

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-colors duration-300">
      <div className="container mx-auto px-4 flex h-20 items-center justify-between">
        <div className="flex items-center gap-10">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0 bg-background border-r-2 border-foreground">
              <div className="flex flex-col p-6 space-y-4">
                <Logo className="mb-8" />
                {NAV_ITEMS.map((item) => (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-[0.2em] py-4 border-b border-border transition-colors",
                      pathname === item.href ? "text-primary" : "text-foreground"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Logo />
          
          <nav className="hidden lg:flex items-center gap-8">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <div key={item.name} className="group relative py-7">
                  <Link 
                    href={item.href}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-1 relative",
                      isActive 
                        ? "text-primary after:absolute after:bottom-[-24px] after:left-0 after:right-0 after:h-[2.5px] after:bg-primary" 
                        : "text-foreground/70 hover:text-primary"
                    )}
                  >
                    {item.name}
                    {item.mega && <ChevronDown className="h-3 w-3 opacity-50" />}
                  </Link>
                  
                  {item.mega && (
                    <div className="absolute top-[100%] left-[-50px] w-[800px] bg-card border-2 border-foreground shadow-[20px_20px_0px_0px_rgba(0,0,0,0.1)] p-12 opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-500 grid grid-cols-3 gap-12 z-50">
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] pb-3 border-b-2 border-foreground">Shop by Concern</h4>
                        <ul className="space-y-3">
                          {item.concerns?.map(c => {
                            const id = labelToId(c);
                            const isComingSoon = !activeConcerns.has(id);
                            return (
                              <li key={c} className="flex items-center justify-between group/link">
                                <Link 
                                  href={isComingSoon ? '#' : `/collections?concern=${id}`} 
                                  className={cn(
                                    "text-[9px] uppercase tracking-widest transition-colors",
                                    isComingSoon ? "text-muted-foreground/50 cursor-default" : "text-muted-foreground hover:text-primary"
                                  )}
                                  onClick={(e) => isComingSoon && e.preventDefault()}
                                >
                                  {c}
                                </Link>
                                {isComingSoon && <span className="text-[6px] font-black text-primary opacity-0 group-hover/link:opacity-100 transition-opacity">SOON</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] pb-3 border-b-2 border-foreground">Ingredients</h4>
                        <ul className="space-y-3">
                          {item.ingredients?.map(i => {
                            const product = PRODUCTS.find(p => p.name === i);
                            const isComingSoon = !product;
                            return (
                              <li key={i} className="flex items-center justify-between group/link">
                                <Link 
                                  href={isComingSoon ? '#' : `/products/${product.slug}`} 
                                  className={cn(
                                    "text-[9px] uppercase tracking-widest transition-colors",
                                    isComingSoon ? "text-muted-foreground/50 cursor-default" : "text-muted-foreground hover:text-primary"
                                  )}
                                  onClick={(e) => isComingSoon && e.preventDefault()}
                                >
                                  {i}
                                </Link>
                                {isComingSoon && <span className="text-[6px] font-black text-primary opacity-0 group-hover/link:opacity-100 transition-opacity">SOON</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] pb-3 border-b-2 border-foreground">Category</h4>
                        <ul className="space-y-3">
                          {item.categories?.map(cat => {
                            const product = PRODUCTS.find(p => p.name === cat);
                            const isComingSoon = !product;
                            return (
                              <li key={cat} className="flex items-center justify-between group/link">
                                <Link 
                                  href={isComingSoon ? '#' : `/products/${product.slug}`} 
                                  className={cn(
                                    "text-[9px] uppercase tracking-widest transition-colors",
                                    isComingSoon ? "text-muted-foreground/50 cursor-default" : "text-muted-foreground hover:text-primary"
                                  )}
                                  onClick={(e) => isComingSoon && e.preventDefault()}
                                >
                                  {cat}
                                </Link>
                                {isComingSoon && <span className="text-[6px] font-black text-primary opacity-0 group-hover/link:opacity-100 transition-opacity">SOON</span>}
                              </li>
                            );
                          })}
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
          <div className="flex items-center gap-1 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(!isSearchOpen)} className="group">
              <Search className="h-4 w-4 group-hover:text-primary" />
            </Button>
            
            <Button variant="ghost" size="icon" className="hidden sm:flex group">
              <Heart className="h-4 w-4 group-hover:fill-primary group-hover:text-primary" />
            </Button>
            
            <Button variant="ghost" size="icon" className="relative group" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="h-4 w-4 group-hover:text-primary" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground font-black border border-white">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              )}
            </Button>

            <Link href="/login" className="hidden sm:flex">
              <Button variant="ghost" size="icon" className="group">
                <User className="h-4 w-4 group-hover:text-primary" />
              </Button>
            </Link>

            <div className="border-l border-border h-6 mx-2 hidden sm:block" />
            
            <ThemeToggle />
          </div>
        </div>
      </div>

      {isSearchOpen && (
        <div className="absolute top-full left-0 w-full bg-background border-b-2 border-foreground p-8 animate-in slide-in-from-top-4 duration-500 z-50">
          <div className="container mx-auto flex gap-6 max-w-4xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 opacity-30" />
              <Input 
                placeholder="Search Avyora products, ingredients, concerns..." 
                autoFocus
                className="rounded-none border-2 border-foreground focus-visible:ring-0 text-xs h-14 pl-12 uppercase tracking-widest font-black"
              />
            </div>
            <Button variant="ghost" onClick={() => setSearchOpen(false)} className="h-14 px-6"><X className="h-6 w-6" /></Button>
          </div>
        </div>
      )}

      {breadcrumbs.length > 0 && (
        <div className="bg-muted/30 py-3 border-t border-border transition-colors duration-300">
          <div className="container mx-auto px-4 flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={bc.href}>
                <ChevronRight className="h-2 w-2 opacity-30" />
                <Link 
                  href={bc.href} 
                  className={cn(
                    i === breadcrumbs.length - 1 ? "text-foreground" : "hover:text-primary transition-colors"
                  )}
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
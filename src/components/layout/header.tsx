'use client';

import { Search, ShoppingBag, Heart, User, Menu, X, ChevronDown, Zap } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/store';
import { Logo } from '@/components/logo';
import Link from 'next/link';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Shop', href: '/collections' },
  { name: 'Best Sellers', href: '/collections?filter=bestsellers' },
  { 
    name: 'Skin & Body Care', 
    href: '/collections?category=skin',
    mega: true,
    concerns: ['Acne', 'Pigmentation', 'Dryness', 'UV Damage', 'Oiliness', 'Dullness', 'Aging'],
    ingredients: ['Vitamin C', 'Salicylic Acid', 'Retinol', 'Niacinamide', 'Ceramide']
  },
  { name: 'Baby Care', href: '/collections?category=baby' },
  { 
    name: 'Hair Care', 
    href: '/collections?category=hair',
    mega: true,
    concerns: ['Hair Fall', 'Damaged Hair', 'Dandruff', 'Frizzy Hair', 'Thinning'],
    ingredients: ['Capixyl', 'Maleic Acid', 'Peptide', 'Carnitine']
  },
  { name: 'AI Assistants', href: '/assistant' },
  { name: 'Track Order', href: '/track-order' },
];

export function Header() {
  const { cart, setCartOpen } = useApp();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-8 flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-4 mt-8">
                {NAV_ITEMS.map((item) => (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className="text-lg font-bold uppercase tracking-widest hover:text-primary transition-colors py-2 border-b"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Logo className="hidden sm:flex" />
          
          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <div key={item.name} className="group relative py-4">
                <Link 
                  href={item.href}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] hover:text-primary transition-colors flex items-center gap-1"
                >
                  {item.name}
                  {item.mega && <ChevronDown className="h-3 w-3" />}
                </Link>
                
                {item.mega && (
                  <div className="absolute top-full left-0 w-[600px] bg-background border shadow-xl p-8 opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300 grid grid-cols-3 gap-8">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 border-b pb-2">Shop by Concern</h4>
                      <ul className="space-y-2">
                        {item.concerns?.map(c => (
                          <li key={c}><Link href={`/collections?concern=${c.toLowerCase()}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">{c}</Link></li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 border-b pb-2">Shop by Ingredient</h4>
                      <ul className="space-y-2">
                        {item.ingredients?.map(i => (
                          <li key={i}><Link href={`/collections?ingredient=${i.toLowerCase()}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">{i}</Link></li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-muted p-4 flex flex-col justify-center items-center text-center">
                      <Zap className="h-8 w-8 text-primary mb-2" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest mb-1">New Launch</h4>
                      <p className="text-[8px] uppercase tracking-widest opacity-60 mb-4">Discover our latest science</p>
                      <Button size="sm" className="w-full text-[8px] font-bold uppercase tracking-widest">Shop Now</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex relative w-48 xl:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search..." 
              className="pl-8 h-9 bg-muted/50 rounded-none border-none focus-visible:ring-1 focus-visible:ring-primary text-xs" 
            />
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" className="relative group">
              <Heart className="h-4 w-4 group-hover:fill-primary group-hover:text-primary transition-all" />
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

            <Link href="/login">
              <Button variant="ghost" size="icon">
                <User className="h-4 w-4" />
              </Button>
            </Link>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

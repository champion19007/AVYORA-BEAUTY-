'use client';

import React, { useState } from 'react';
import { Search, ShoppingBag, Heart, Menu, ChevronDown, ChevronRight, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/store';
import { Logo } from '@/components/logo';
import { AccountMenu } from '@/components/account-menu';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';

const NAV_ITEMS = [
  { name: 'Shop', href: '/collections' },
  { name: 'Best Sellers', href: '/collections?filter=bestsellers' },
  {
    name: 'Shop by Category',
    href: '/collections',
    mega: true,
  },
  { name: 'Routine Finder', href: '/routine-finder' },
  { name: 'Track Order', href: '/track-order' },
];

/**
 * The menus are derived from the catalogue rather than hardcoded label lists.
 *
 * The previous version listed labels by hand, which drifted: a whole "Hair
 * Care" mega menu advertised four concerns and three categories with zero
 * products behind any of them, and several links resolved to nothing. Deriving
 * the menu means an entry cannot outlive the products it points at.
 *
 * The catalogue is static, so these are computed once, not per render.
 */
const CATEGORIES_WITH_PRODUCTS = CATEGORIES.filter((c) =>
  PRODUCTS.some((p) => p.category === c.id)
);

const CONCERNS_WITH_PRODUCTS = CONCERNS.filter((c) =>
  PRODUCTS.some((p) => p.concerns.includes(c.id))
);

const BESTSELLERS = PRODUCTS.filter((p) => p.isBestSeller).slice(0, 7);

/** One column of the mega menu. */
function MegaColumn({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string | null }[];
}) {
  return (
    <div>
      <h3 className="mb-4 border-b border-primary/25 pb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
        {heading}
      </h3>
      <ul className="space-y-2.5">
        {links.map(({ label, href }) => (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {label}
              </Link>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted-foreground/50">
                {label}
                <span className="text-[9px] uppercase tracking-[0.16em] text-primary/60">Soon</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Header() {
  const { cart, setCartOpen } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');


  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    setQuery('');
    router.push(`/collections?q=${encodeURIComponent(q)}`);
  };

  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, index) => {
    const href = `/${pathSegments.slice(0, index + 1).join('/')}`;
    const name = segment.replace(/-/g, ' ');
    return { name: name.charAt(0).toUpperCase() + name.slice(1), href };
  });

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/90 backdrop-blur-md transition-colors duration-300">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <div className="flex items-center gap-10">
          <Logo className="shrink-0" />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <div key={item.name} className="group relative py-7">
                  <Link
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors',
                      'after:absolute after:-bottom-1 after:left-0 after:h-px after:bg-primary after:transition-all after:duration-300',
                      isActive
                        ? 'text-primary after:w-full'
                        : 'text-foreground/75 after:w-0 hover:text-primary hover:after:w-full'
                    )}
                  >
                    {item.name}
                    {item.mega && <ChevronDown className="h-3 w-3 opacity-50" />}
                  </Link>

                  {item.mega && (
                    <div className="pointer-events-none absolute left-1/2 top-full z-50 grid w-[760px] -translate-x-1/2 translate-y-3 grid-cols-3 gap-10 rounded-xl border border-border bg-popover p-10 opacity-0 shadow-luxe-lg transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                      <MegaColumn
                        heading="By category"
                        links={CATEGORIES_WITH_PRODUCTS.map((c) => ({
                          label: c.name,
                          href: `/collections?category=${c.id}`,
                        }))}
                      />
                      <MegaColumn
                        heading="By concern"
                        links={CONCERNS_WITH_PRODUCTS.slice(0, 8).map((c) => ({
                          label: c.name,
                          href: `/collections?concern=${c.id}`,
                        }))}
                      />
                      <MegaColumn
                        heading="Best sellers"
                        links={BESTSELLERS.map((p) => ({
                          label: p.name,
                          href: `/products/${p.slug}`,
                        }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            aria-expanded={isSearchOpen}
            onClick={() => setSearchOpen(!isSearchOpen)}
            className="hover:text-primary"
          >
            <Search className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" aria-label="Wishlist" className="hidden hover:text-primary sm:flex">
            <Heart className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative hover:text-primary"
            aria-label={`Shopping bag, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                {cartCount}
              </span>
            )}
          </Button>

          <AccountMenu />

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-background p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex flex-col p-6">
                <Logo className="mb-8" />
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'border-b border-border py-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors',
                      pathname === item.href ? 'text-primary' : 'text-foreground hover:text-primary'
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
          <ThemeToggle />
        </div>
      </div>

      {isSearchOpen && (
        <div className="absolute left-0 top-full z-50 w-full animate-in border-b border-border bg-background/98 p-6 backdrop-blur-md slide-in-from-top-2 duration-300">
          <form onSubmit={submitSearch} className="container mx-auto flex max-w-3xl gap-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, ingredients or concerns…"
                aria-label="Search products"
                autoFocus
                className="h-12 rounded-md pl-11 text-sm"
              />
            </div>
            <Button type="submit" className="h-12 px-8 text-xs font-semibold uppercase tracking-[0.18em]">
              Search
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close search"
              onClick={() => setSearchOpen(false)}
              className="h-12 w-12"
            >
              <X className="h-5 w-5" />
            </Button>
          </form>
        </div>
      )}

      {breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="border-t border-border/60 bg-muted/30 py-2.5 transition-colors duration-300"
        >
          <ol className="container mx-auto flex items-center gap-1.5 px-4 text-[11px] text-muted-foreground">
            <li>
              <Link href="/" className="transition-colors hover:text-primary">
                Home
              </Link>
            </li>
            {breadcrumbs.map((bc, i) => (
              <li key={bc.href} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 opacity-40" aria-hidden="true" />
                {i === breadcrumbs.length - 1 ? (
                  <span className="text-foreground" aria-current="page">
                    {bc.name}
                  </span>
                ) : (
                  <Link href={bc.href} className="transition-colors hover:text-primary">
                    {bc.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </header>
  );
}

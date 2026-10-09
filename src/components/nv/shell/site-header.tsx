'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Heart, Search, ShoppingBag, User, X } from 'lucide-react';
import { CATEGORIES, CONCERNS } from '@/data/mock-data';
import { activeCategories, activeConcerns } from '@/lib/catalogue';
import { useApp } from '@/lib/store';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV } from './nav';

/**
 * The redesign header (measured: 76 px high, 20/40 padding, wordmark at the
 * left gutter, menu button at the right). It stays in the page flow and
 * scrolls away, as in the reference.
 *
 * Avyora adds compact bag, wishlist and account controls beside the menu
 * button (the reference has none; a shop needs them). The account control
 * is a plain link: /account sends signed-out visitors to sign in, so the
 * header never has to fetch the session, and public pages stay static.
 *
 * The home page opens on the full-bleed hero, so there the header is laid
 * over the photograph in white (`light`); elsewhere it sits on the page.
 * A "Shop" text link keeps the catalogue one click away from the hero.
 */
export function SiteHeader() {
  const { cart, wishlist, setCartOpen } = useApp();
  const count = cart.reduce((n, l) => n + l.quantity, 0);
  const light = usePathname() === '/';
  const control = cn(
    'relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-nv-control nv-motion',
    light ? 'nv-focus-light text-white hover:bg-white/15' : 'nv-focus text-nv-ink hover:bg-nv-accent/5'
  );
  const badge = (n: number) =>
    n > 0 && (
      <span
        aria-hidden="true"
        className={cn('absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[11px] font-medium leading-[18px]', light ? 'bg-white text-nv-ink' : 'bg-nv-ink text-white')}
      >
        {n > 99 ? '99+' : n}
      </span>
    );

  return (
    <header className={cn('z-30 h-nv-header w-full font-nv', light ? 'absolute inset-x-0 top-0 text-white' : 'relative bg-nv-page text-nv-ink')}>
      {/* 20 px top, 22 px bottom: the wordmark box (34 px) starts at y = 20 and the menu button centres on y = 37, as measured. */}
      <div className="flex h-full items-center justify-between px-nv-gutter pb-[22px] pt-5">
        <Link href="/" className={cn('font-wordmark text-nv-wordmark', light ? 'nv-focus-light' : 'nv-focus')}>
          Avyora
        </Link>
        <nav aria-label="Shortcuts" className="flex items-center gap-0 sm:gap-2">
          <Link href="/collections" className={cn('mr-4 hidden text-nv-label sm:inline', light ? 'nv-focus-light hover:text-white/80' : 'nv-focus hover:text-nv-muted')}>
            Shop
          </Link>
          <SearchDialog control={control} />
          <Link href="/account" className={control} aria-label="Account">
            <User className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link href="/wishlist" className={control} aria-label={`Wishlist${wishlist.length ? `, ${wishlist.length} saved` : ''}`}>
            <Heart className="h-5 w-5" aria-hidden="true" />
            {badge(wishlist.length)}
          </Link>
          <button type="button" className={control} onClick={() => setCartOpen(true)} aria-label={`Bag${count ? `, ${count} item${count === 1 ? '' : 's'}` : ', empty'}`}>
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            {badge(count)}
          </button>
          <MenuOverlay light={light} bagCount={count} openBag={() => setCartOpen(true)} wishlistCount={wishlist.length} />
        </nav>
      </div>
    </header>
  );
}

/**
 * The reference's menu overlay: a white panel sliding down from the top,
 * centred 40/52 links, support details bottom-left, legal links bottom-right,
 * and the close control in place of the menu button. Radix supplies the
 * focus trap, Escape, scroll lock and focus return.
 */
function MenuOverlay({ light, bagCount, openBag, wishlistCount }: { light: boolean; bagCount: number; openBag: () => void; wishlistCount: number }) {
  const [open, setOpen] = useState(false);

  /*
   * Background scroll lock. Radix's lock did not stop wheel scrolling under
   * this panel (verified: a wheel event scrolled the page 600 px), so the
   * root is locked directly while the menu is open. The scrollbar's width is
   * replaced by padding so the page behind does not shift sideways.
   */
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const gap = window.innerWidth - root.clientWidth;
    const previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    root.style.overflow = 'hidden';
    if (gap > 0) root.style.paddingRight = `${gap}px`;
    return () => {
      root.style.overflow = previous.overflow;
      root.style.paddingRight = previous.paddingRight;
    };
  }, [open]);
  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger
        className={cn('ml-2 flex h-10 w-10 flex-col items-end justify-center gap-[6px]', light ? 'nv-focus-light' : 'nv-focus')}
        aria-label="Menu"
      >
        <span aria-hidden="true" className={cn('block h-[2px] w-[34px]', light ? 'bg-white' : 'bg-nv-ink')} />
        <span aria-hidden="true" className={cn('block h-[2px] w-[34px]', light ? 'bg-white' : 'bg-nv-ink')} />
        <span aria-hidden="true" className={cn('block h-[2px] w-[34px]', light ? 'bg-white' : 'bg-nv-ink')} />
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Content
          className="nv-motion fixed inset-x-0 top-0 z-50 flex h-[675px] flex-col bg-white font-nv text-nv-ink data-[state=open]:animate-nv-overlay-in data-[state=closed]:animate-nv-overlay-out"
          aria-describedby={undefined}
        >
          <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
          <div className="flex h-nv-header items-center justify-between px-nv-gutter pb-[22px] pt-5">
            <Link href="/" onClick={() => setOpen(false)} className="nv-focus font-wordmark text-nv-wordmark">
              Avyora
            </Link>
            <RadixDialog.Close className="nv-focus flex h-10 w-10 items-center justify-center" aria-label="Close menu">
              <X className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {/* Measured: the panel is 675 px tall at every width; the first link line box starts at y = 153 (77 px below the header), then a 68 px pitch. */}
          <nav aria-label="Main" className="flex flex-1 justify-center pt-[77px]">
            <ul className="flex flex-col items-center gap-4">
              {PRIMARY_NAV.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="nv-focus text-nv-statement transition-colors hover:text-nv-muted">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-wrap items-end justify-between gap-6 px-nv-gutter pb-10">
            <div>
              <p className="text-nv-label text-nv-muted">Support</p>
              <Link href="/contact" onClick={() => setOpen(false)} className="nv-focus text-nv-contact">
                {SUPPORT_EMAIL}
              </Link>
            </div>
            {/* The reference has legal links here; a shop needs account, wishlist and bag instead (legal links are in the footer). */}
            <ul className="flex gap-8 text-nv-label">
              <li>
                <Link href="/account" onClick={() => setOpen(false)} className="nv-focus hover:text-nv-muted">
                  Account
                </Link>
              </li>
              <li>
                <Link href="/wishlist" onClick={() => setOpen(false)} className="nv-focus hover:text-nv-muted">
                  Wishlist{wishlistCount ? ` (${wishlistCount})` : ''}
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openBag();
                  }}
                  className="nv-focus hover:text-nv-muted"
                >
                  Bag{bagCount ? ` (${bagCount})` : ''}
                </button>
              </li>
            </ul>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Search and browse entry points (re-audit A18): the redesign had dropped
 * the old header's search and category/concern links. A compact dialog
 * keeps the measured header unchanged; results open in the shop with the
 * query in the URL, so they can be refined, shared and reloaded.
 */
function SearchDialog({ control }: { control: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const router = useRouter();
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const categories = CATEGORIES.filter((c) => activeCategories().has(c.id));
  const concerns = CONCERNS.filter((c) => activeConcerns().has(c.id));
  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger className={control} aria-label="Search">
        <Search className="h-5 w-5" aria-hidden="true" />
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <RadixDialog.Content
          className="fixed left-1/2 top-24 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 rounded-[18px] bg-white p-5 sm:p-8 font-nv text-nv-ink shadow-xl"
          aria-describedby={undefined}
        >
          <RadixDialog.Title className="text-nv-label text-nv-muted">Search the shop</RadixDialog.Title>
          <form
            role="search"
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) go(`/collections?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <label htmlFor="site-search" className="sr-only">
              Products, ingredients or concerns
            </label>
            <input
              id="site-search"
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Products, ingredients or concerns"
              className="nv-focus h-12 flex-1 rounded-full border border-black/15 px-5 text-[15px]"
            />
            <button type="submit" className="nv-focus h-12 rounded-full bg-nv-ink px-6 text-[15px] text-white">
              Search
            </button>
          </form>
          <div className="mt-6 grid grid-cols-2 gap-6 text-[15px]">
            <nav aria-label="Browse by category">
              <p className="text-nv-label text-nv-muted">Category</p>
              <ul className="mt-2 space-y-1">
                {categories.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="nv-focus hover:underline" onClick={() => go(`/collections?category=${c.id}`)}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Browse by concern">
              <p className="text-nv-label text-nv-muted">Concern</p>
              <ul className="mt-2 space-y-1">
                {concerns.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="nv-focus hover:underline" onClick={() => go(`/collections?concern=${c.id}`)}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <RadixDialog.Close className="nv-focus absolute right-5 top-5 flex h-10 w-10 items-center justify-center" aria-label="Close search">
            <X className="h-5 w-5" aria-hidden="true" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

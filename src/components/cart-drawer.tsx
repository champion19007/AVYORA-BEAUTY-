'use client';

import { X, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/price';
import { FREE_SHIPPING_THRESHOLD_PAISE, formatPaise } from '@/lib/money';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Image from 'next/image';
import Link from 'next/link';
import { MAX_QUANTITY_PER_SKU, subtotal as cartSubtotal, unitPrice } from '@/lib/cart';
import { useCartQuote } from '@/lib/use-cart-quote';
import { skuKey } from '@/modules/catalog/sku-price';

export function CartDrawer() {
  const { cart, updateQuantity, removeFromCart, isCartOpen, setCartOpen, syncNotice, dismissSyncNotice } = useApp();

  /*
   * Every figure here comes from the current quote for each line's own SKU.
   * It used to multiply the product's base price, frozen when the item was
   * added, so a 90ml line showed the 30ml price and no price change or offer
   * ever reached the bag. Until the quote arrives (or if it fails) each line
   * shows its catalogue price for its size, labelled as unconfirmed.
   */
  const { quote, status: quoteStatus } = useCartQuote(cart, isCartOpen);
  const totals = cartSubtotal(cart, quote?.prices);
  const subtotal = totals.paise / 100;
  /*
   * Progress towards free delivery, from the threshold checkout charges by.
   * This bar used to promise a "Free Gift" at ₹1,199; no gift was ever added
   * to an order (audit #07).
   */
  const toFreeDelivery = Math.max(0, FREE_SHIPPING_THRESHOLD_PAISE - totals.paise);
  const progress = Math.min((totals.paise / FREE_SHIPPING_THRESHOLD_PAISE) * 100, 100);

  return (
    <Sheet open={isCartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l border-border">
        <SheetHeader className="p-8 border-b border-border bg-muted/30">
          {/*
            No close button here.

            `SheetContent` already renders one, so this header had a second —
            two crosses a few pixels apart, which reads as a bug even when both
            work. The primitive's is the one to keep: it carries an accessible
            name, sits where every other sheet on the site puts it, and this
            one was a bare icon button a screen reader would announce as just
            "button".

            A heading is also the wrong place for a control. `SheetTitle` is
            what assistive technology reads to say which dialog opened, and an
            interactive element inside it muddles that.
          */}
          <SheetTitle className="flex items-center gap-3">
            <ShoppingBag className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-widest">
              Shopping Bag ({cart.length})
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* What changed when the guest bag joined the account's (lib/cart-merge). */}
        {syncNotice.length > 0 && (
          <div role="status" className="mx-8 mt-6 rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed">
            <p className="font-semibold">Your bag was combined with your account&apos;s</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              {syncNotice.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <button type="button" onClick={dismissSyncNotice} className="mt-2 underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-24 h-24 bg-muted flex items-center justify-center grayscale opacity-50">
                <ShoppingBag className="h-10 w-10" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Your bag is empty</p>
                <p className="text-[8px] font-bold uppercase tracking-[0.2em] mt-2 max-w-[200px]">Start your journey to better skin science today.</p>
              </div>
              <Button
                className="rounded-md bg-foreground text-background font-semibold uppercase tracking-widest text-[10px] px-8 py-6"
                onClick={() => setCartOpen(false)}
              >
                Shop All
              </Button>
            </div>
          ) : (
            <div className="space-y-10">
              {cart.map(({ product: item, ...line }) => {
                const unit = unitPrice(line, quote?.prices);
                const available = quote?.stock ? quote.stock[skuKey(line.productId, line.size)] ?? 0 : null;
                const cap = Math.min(MAX_QUANTITY_PER_SKU, available ?? MAX_QUANTITY_PER_SKU);
                return (
                <div key={`${line.productId}-${line.size}`} className="flex gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="relative h-28 w-24 flex-shrink-0 border">
                    <Image
                      src={item.images[0]}
                      alt={item.name}
                      fill
                      className="object-cover grayscale"
                    />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[10px] font-semibold uppercase tracking-widest leading-tight mb-1">{item.name}</h4>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{line.size}</p>
                        {available !== null && line.quantity > available && (
                          <p className="mt-1 text-xs text-destructive" role="status">
                            {available === 0 ? 'Out of stock' : `Only ${available} available`}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFromCart(line.productId, line.size)}
                        // Named, because an icon-only control announces as
                        // "button" otherwise — and there are several identical
                        // ones on this panel, one per line.
                        aria-label={`Remove ${item.name} (${line.size}) from your bag`}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex justify-between items-center">
                      <div className="flex items-center border border-muted">
                        <button
                          className="p-2 hover:bg-muted disabled:opacity-40"
                          aria-label={`Decrease quantity of ${item.name} (${line.size})`}
                          disabled={line.quantity <= 1}
                          onClick={() => updateQuantity(line.productId, line.size, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-[10px] px-4 font-semibold" aria-label={`Quantity ${line.quantity}`}>{line.quantity}</span>
                        <button
                          className="p-2 hover:bg-muted disabled:opacity-40"
                          aria-label={`Increase quantity of ${item.name} (${line.size})`}
                          disabled={line.quantity >= cap}
                          onClick={() => updateQuantity(line.productId, line.size, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <Price amount={(unit.price * line.quantity) / 100} size="sm" />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-8 border-t-2 border-foreground space-y-6 bg-white shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
            <div className="space-y-4">
              <div className="flex justify-between text-[8px] font-semibold uppercase tracking-widest">
                <span>{toFreeDelivery === 0 ? 'Free delivery' : `Add ${formatPaise(toFreeDelivery)} for free delivery`}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1 w-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-xl font-semibold uppercase tracking-tighter">
              <span>Subtotal</span>
              <Price amount={subtotal} size="base" />
            </div>
            {!totals.confirmed && (
              <p className="text-xs text-muted-foreground" role="status">
                {quoteStatus === 'error'
                  ? 'Current prices could not be confirmed. Checkout shows the final amount before you pay.'
                  : 'Checking current prices…'}
              </p>
            )}

            <div className="space-y-4">
              <Link href="/checkout" onClick={() => setCartOpen(false)} className="block">
                <Button className="w-full bg-foreground text-background font-semibold uppercase tracking-widest py-8 rounded-md group hover:bg-primary transition-colors">
                  Checkout Now <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-2 transition-transform" />
                </Button>
              </Link>
              <p className="text-[8px] text-muted-foreground uppercase tracking-[0.3em] text-center font-bold">
                Prices include GST. Delivery is shown at checkout
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

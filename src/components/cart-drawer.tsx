'use client';

import { X, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Price, formatPrice } from '@/components/price';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Image from 'next/image';
import Link from 'next/link';

export function CartDrawer() {
  const { cart, updateQuantity, removeFromCart, isCartOpen, setCartOpen } = useApp();
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const freeGiftThreshold = 1199;
  const progress = Math.min((subtotal / freeGiftThreshold) * 100, 100);

  return (
    <Sheet open={isCartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l border-border">
        <SheetHeader className="p-8 border-b border-border bg-muted/30">
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-widest">Shopping Bag ({cart.length})</span>
            </div>
            <button onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button>
          </SheetTitle>
        </SheetHeader>

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
              {cart.map((item) => (
                <div key={`${item.id}-${item.selectedSize}`} className="flex gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
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
                        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{item.selectedSize}</p>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.id, item.selectedSize)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="mt-auto flex justify-between items-center">
                      <div className="flex items-center border border-muted">
                        <button 
                          className="p-2 hover:bg-muted"
                          onClick={() => updateQuantity(item.id, item.selectedSize, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-[10px] px-4 font-semibold">{item.quantity}</span>
                        <button 
                          className="p-2 hover:bg-muted"
                          onClick={() => updateQuantity(item.id, item.selectedSize, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <Price amount={item.price * item.quantity} size="sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-8 border-t-2 border-foreground space-y-6 bg-white shadow-[0_-20px_40px_rgba(0,0,0,0.05)]">
            <div className="space-y-4">
              <div className="flex justify-between text-[8px] font-semibold uppercase tracking-widest">
                <span>{progress >= 100 ? 'Free Gift Earned!' : `Add ${formatPrice(freeGiftThreshold - subtotal)} for a Free Gift`}</span>
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
            
            <div className="space-y-4">
              <Link href="/checkout" onClick={() => setCartOpen(false)} className="block">
                <Button className="w-full bg-foreground text-background font-semibold uppercase tracking-widest py-8 rounded-md group hover:bg-primary transition-colors">
                  Checkout Now <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-2 transition-transform" />
                </Button>
              </Link>
              <p className="text-[8px] text-muted-foreground uppercase tracking-[0.3em] text-center font-bold">
                Taxes & Shipping calculated at next step
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

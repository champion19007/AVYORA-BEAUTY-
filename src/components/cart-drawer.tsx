'use client';

import { X, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
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
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Shopping Bag ({cart.length})
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-muted-foreground">Your bag is empty</p>
              <Button 
                variant="outline" 
                className="mt-6 font-bold uppercase tracking-widest"
                onClick={() => setCartOpen(false)}
              >
                Start Shopping
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {cart.map((item) => (
                <div key={`${item.id}-${item.selectedSize}`} className="flex gap-4">
                  <div className="relative h-24 w-20 flex-shrink-0 bg-muted">
                    <Image 
                      src={item.images[0]} 
                      alt={item.name} 
                      fill 
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <h4 className="text-sm font-bold uppercase tracking-wide">{item.name}</h4>
                      <button onClick={() => removeFromCart(item.id, item.selectedSize)}>
                        <X className="h-4 w-4 opacity-40 hover:opacity-100" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.selectedSize}</p>
                    <div className="flex justify-between items-center mt-4">
                      <div className="flex items-center border border-border">
                        <button 
                          className="p-1 px-2 hover:bg-muted"
                          onClick={() => updateQuantity(item.id, item.selectedSize, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs px-2 min-w-[20px] text-center font-bold">{item.quantity}</span>
                        <button 
                          className="p-1 px-2 hover:bg-muted"
                          onClick={() => updateQuantity(item.id, item.selectedSize, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-sm font-bold">₹{(item.price * item.quantity).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-6 border-t space-y-4 bg-background">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span>{progress >= 100 ? 'Free Gift Earned!' : `Add ₹${(freeGiftThreshold - subtotal).toLocaleString()} for a Free Gift`}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1 w-full bg-muted overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-500" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            
            <div className="flex justify-between text-lg font-bold">
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest text-center">
              Shipping & taxes calculated at checkout
            </p>
            <Link href="/checkout" onClick={() => setCartOpen(false)}>
              <Button className="w-full bg-primary text-primary-foreground font-bold uppercase tracking-widest py-6">
                Checkout
              </Button>
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

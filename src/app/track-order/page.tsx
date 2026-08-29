'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Package, Truck, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function TrackOrderPage() {
  const [trackingType, setTrackingType] = useState('order-id');
  const [id, setId] = useState('');
  const [status, setStatus] = useState<null | 'placed' | 'shipped' | 'delivered'>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsSearching(true);
    setStatus(null);
    
    // Simulated result logic
    setTimeout(() => {
      setIsSearching(false);
      const lastDigit = parseInt(id.slice(-1)) || 0;
      if (lastDigit > 7) setStatus('delivered');
      else if (lastDigit > 3) setStatus('shipped');
      else setStatus('placed');
    }, 1500);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        <div className="space-y-12">
          <div className="space-y-4">
            <h1 className="text-5xl font-semibold tracking-tighter uppercase leading-none">Track Your Order</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
              Real-time transparency on every shipment. Enter your details below.
            </p>
          </div>

          <div className="p-8 border border-border bg-white shadow-luxe">
            <form onSubmit={handleTrack} className="space-y-8">
              <RadioGroup 
                defaultValue="order-id" 
                value={trackingType}
                onValueChange={setTrackingType}
                className="flex gap-8"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="order-id" id="order-id" />
                  <Label htmlFor="order-id" className="text-[10px] font-semibold uppercase tracking-widest">Order ID</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="tracking-id" id="tracking-id" />
                  <Label htmlFor="tracking-id" className="text-[10px] font-semibold uppercase tracking-widest">Tracking ID</Label>
                </div>
              </RadioGroup>

              <div className="space-y-2">
                <Input 
                  placeholder={trackingType === 'order-id' ? "e.g. MS-993821" : "e.g. 1Z99999999"} 
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="rounded-md h-14 text-sm border-2 border-muted focus:border-foreground"
                />
              </div>

              <Button type="submit" disabled={isSearching} className="w-full h-14 rounded-md bg-foreground text-background font-semibold uppercase tracking-widest hover:bg-primary transition-colors">
                {isSearching ? "Searching..." : "Track Your Order"}
              </Button>
            </form>
          </div>

          {status && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-12 py-12 border-t">
              <div className="flex items-center justify-between relative">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -z-10" />
                {[
                  { icon: CheckCircle2, label: 'Placed', active: !!status },
                  { icon: Truck, label: 'Shipped', active: status === 'shipped' || status === 'delivered' },
                  { icon: Package, label: 'Delivered', active: status === 'delivered' }
                ].map((step, i) => (
                  <div key={step.label} className="flex flex-col items-center gap-4 bg-background px-4">
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center border-2",
                      step.active ? "bg-foreground text-background border-foreground" : "text-muted-foreground border-muted"
                    )}>
                      <step.icon className="h-6 w-6" />
                    </div>
                    <span className="text-[8px] font-semibold uppercase tracking-widest">{step.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-center bg-muted/30 p-6">
                <p className="text-[10px] font-semibold uppercase tracking-widest">Estimated Delivery</p>
                <p className="text-xl font-semibold mt-2">October 24, 2023</p>
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:block relative aspect-[3/4] border border-border">
          <Image 
            src="https://picsum.photos/seed/track-package/800/1000"
            alt="Tracking"
            fill
            className="object-cover"
            data-ai-hint="delivery package"
          />
        </div>
      </div>

      <div className="mt-32">
        <h2 className="text-2xl font-semibold uppercase tracking-tighter mb-12 text-center">Shop Collections</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {['Skin', 'Hair', 'Body', 'Lip', 'Eye'].map((cat) => (
            <Link 
              key={cat} 
              href={`/collections?category=${cat.toLowerCase()}`}
              className="group"
            >
              <div className="relative aspect-square overflow-hidden border-2 border-transparent group-hover:border-foreground mb-4">
                <img src={`https://picsum.photos/seed/${cat}/400/400`} alt={cat} className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all" />
              </div>
              <p className="text-[8px] font-semibold uppercase tracking-widest text-center">{cat} Care</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

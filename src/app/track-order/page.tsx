'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Package, Truck, CheckCircle2, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function TrackOrderPage() {
  const [trackingType, setTrackingType] = useState('order-id');
  const [id, setId] = useState('');
  const [status, setStatus] = useState<null | 'shipped' | 'delivered'>(null);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    // Simulated status logic
    setStatus(id.endsWith('0') ? 'delivered' : 'shipped');
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight uppercase">Track Your Order</h1>
            <p className="text-muted-foreground uppercase text-xs tracking-widest">
              Enter your details below to see the current status of your shipment.
            </p>
          </div>

          <Card className="rounded-none border-2">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-widest">Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTrack} className="space-y-6">
                <RadioGroup 
                  defaultValue="order-id" 
                  value={trackingType}
                  onValueChange={setTrackingType}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="order-id" id="order-id" />
                    <Label htmlFor="order-id" className="text-[10px] font-bold uppercase tracking-widest">Order ID</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="tracking-id" id="tracking-id" />
                    <Label htmlFor="tracking-id" className="text-[10px] font-bold uppercase tracking-widest">Tracking ID</Label>
                  </div>
                </RadioGroup>

                <div className="space-y-2">
                  <Input 
                    placeholder={trackingType === 'order-id' ? "Enter Order ID" : "Enter Tracking ID"} 
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="rounded-none h-12 text-sm border-2"
                  />
                </div>

                <Button type="submit" className="w-full h-12 rounded-none bg-primary font-bold uppercase tracking-widest">
                  Track Your Order
                </Button>
              </form>
            </CardContent>
          </Card>

          {status && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500 space-y-8">
              <div className="flex items-center justify-between">
                {[
                  { icon: CheckCircle2, label: 'Placed', done: true },
                  { icon: Truck, label: 'Shipped', done: true },
                  { icon: Package, label: 'Delivered', done: status === 'delivered' }
                ].map((step, i) => (
                  <div key={step.label} className="flex flex-col items-center gap-2">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2",
                      step.done ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-muted"
                    )}>
                      <step.icon className="h-5 w-5" />
                    </div>
                    <span className="text-[8px] font-bold uppercase tracking-widest">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:block relative aspect-square bg-muted">
          <Image 
            src="https://picsum.photos/seed/track/800/800"
            alt="Tracking"
            fill
            className="object-cover"
            data-ai-hint="delivery package"
          />
        </div>
      </div>

      <div className="mt-24">
        <h2 className="text-xl font-bold uppercase tracking-widest mb-12 text-center">Need something else?</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {['Skin Care', 'Hair Care', 'Body Care', 'Lip Care', 'Eye Care'].map((cat) => (
            <Link 
              key={cat} 
              href={`/collections?category=${cat.toLowerCase().replace(' ', '')}`}
              className="flex flex-col items-center group"
            >
              <div className="relative w-full aspect-square overflow-hidden mb-4 bg-muted border">
                <Image 
                  src={`https://picsum.photos/seed/${cat}/400/400`}
                  alt={cat}
                  fill
                  className="object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                  data-ai-hint={cat}
                />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-primary transition-colors">{cat}</span>
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
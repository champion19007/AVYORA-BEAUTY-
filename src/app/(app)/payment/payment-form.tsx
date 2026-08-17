'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function PaymentForm() {
  const [paymentMethod, setPaymentMethod] = useState('credit-card');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Payment Details</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={paymentMethod}
          onValueChange={setPaymentMethod}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
        >
          <div>
            <RadioGroupItem value="credit-card" id="credit-card" className="peer sr-only" />
            <Label
              htmlFor="credit-card"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <CreditCard className="mb-3 h-6 w-6" />
              Credit Card
            </Label>
          </div>
          <div>
            <RadioGroupItem value="paypal" id="paypal" className="peer sr-only" />
            <Label
              htmlFor="paypal"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <svg role="img" viewBox="0 0 24 24" className="mb-3 h-6 w-6" fill="currentColor"><path d="M7.342 5.087a1.46 1.46 0 0 0-1.429 1.458c0 .805.64 1.458 1.429 1.458h.01a1.46 1.46 0 0 0 1.429-1.458c0-.805-.65-1.458-1.439-1.458zm-.38 10.384c-.31-.06-.48.12-.39.43l.87 2.926a.2.2 0 0 0 .19.14h3.04a.4.4 0 0 0 .39-.27l.27-.92a.22.22 0 0 1 .2-.12h.7l-.14.48a.4.4 0 0 0 .39.51h.6a.4.4 0 0 0 .39-.27l.83-2.772a.4.4 0 0 0-.39-.51h-2.19a.4.4 0 0 0-.4.27l-.4 1.342a.2.2 0 0 1-.2.12h-.7l.95-3.2a.4.4 0 0 0-.39-.51h-.6a.4.4 0 0 0-.39.27L8.71 15.3a.2.2 0 0 1-.2.13h-.72c-.2 0-.27-.06-.21-.24zm10.051-5.832h-2.19a.4.4 0 0 0-.4.27l-.84 2.822a.4.4 0 0 0 .4.51h.6a.4.4 0 0 0 .38-.27l.1-.35a.2.2 0 0 1 .2-.12h.7l-.13.44a.4.4 0 0 0 .38.51h.6a.4.4 0 0 0 .38-.27l1.24-4.142a.4.4 0 0 0-.39-.51zm-6.22 1.429a.18.18 0 0 0-.19-.13h-.6a.21.21 0 0 0-.2.13l-.53 1.772a.2.2 0 0 0 .19.27h.6a.2.2 0 0 0 .2-.13l.53-1.772a.2.2 0 0 0-.2-.27zM24 5.087a1.46 1.46 0 0 0-1.429 1.458c0 .805.64 1.458 1.429 1.458h.01c.79 0 1.429-.653 1.429-1.458 0-.805-.65-1.458-1.439-1.458zm-4.913 2.217c-.31-.05-.48.13-.4.43l.88 2.926a.2.2 0 0 0 .19.14h3.04a.4.4 0 0 0 .39-.27l.27-.92a.2.2 0 0 1 .2-.12h.7l-.14.48a.4.4 0 0 0 .39.51h.6a.4.4 0 0 0 .39-.27l.83-2.772a.4.4 0 0 0-.39-.51h-2.19a.4.4 0 0 0-.4.27l-.4 1.342a.2.2 0 0 1-.2.12h-.7l.95-3.2a.4.4 0 0 0-.39-.51h-.6a.4.4 0 0 0-.39.27l-1.74 5.823a.2.2 0 0 1-.2.13h-.72c-.2 0-.27-.06-.21-.24z"/></svg>
              PayPal
            </Label>
          </div>
        </RadioGroup>

        {paymentMethod === 'credit-card' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-name">Name on Card</Label>
              <Input id="card-name" placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-number">Card Number</Label>
              <Input id="card-number" placeholder="**** **** **** 4242" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry</Label>
                <Input id="expiry" placeholder="MM/YY" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <Input id="cvc" placeholder="123" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP</Label>
                <Input id="zip" placeholder="12345" />
              </div>
            </div>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Pay ₹53.00</Button>
          </div>
        ) : (
           <div className="text-center p-8 border-dashed border-2 rounded-lg">
                <p className="text-muted-foreground mb-4">You will be redirected to PayPal to complete your payment.</p>
                <Button className="w-full max-w-xs bg-accent text-accent-foreground hover:bg-accent/90">
                    Continue with PayPal
                </Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

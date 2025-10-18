import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';

const plans = [
  {
    name: 'Basic',
    price: '$19',
    description: 'For individuals and small teams starting out.',
    features: ['5 Projects', 'Basic Analytics', '24/7 Support'],
    isCurrent: false,
    cta: 'Upgrade to Basic',
  },
  {
    name: 'Pro',
    price: '$49',
    description: 'For growing businesses that need more power.',
    features: ['Unlimited Projects', 'Advanced Analytics', 'Priority Support', 'AI Features'],
    isCurrent: true,
    cta: 'Current Plan',
  },
  {
    name: 'Enterprise',
    price: 'Contact Us',
    description: 'For large organizations with custom needs.',
    features: ['All Pro Features', 'Dedicated Account Manager', 'Custom Integrations', 'SLA'],
    isCurrent: false,
    cta: 'Contact Sales',
  },
];

export default function SubscriptionsPage() {
  return (
    <div className="flex flex-col gap-8">
       <div className="space-y-1.5">
        <h1 className="text-3xl font-bold font-headline tracking-tight">
          Subscription Plans
        </h1>
        <p className="text-muted-foreground">
          Choose the plan that&apos;s right for you. You can easily upgrade or downgrade at any time.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.name} className={`flex flex-col ${plan.isCurrent ? 'border-primary ring-2 ring-primary' : ''}`}>
            <CardHeader>
              <CardTitle className="font-headline">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="mb-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.price.startsWith('$') && <span className="text-muted-foreground">/month</span>}
              </div>
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                disabled={plan.isCurrent}
                variant={plan.isCurrent ? "outline" : "default"}
              >
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

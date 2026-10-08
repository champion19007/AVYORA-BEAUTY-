import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { DELIVERY_TERMS } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description: 'Avyora shipping policy.',
};

export default function Page() {
  return (
    <>
      <h1>Shipping Policy</h1>
      <p>Last updated: [TO CONFIRM]</p>

      <h2>Where we deliver</h2>
      <p>We currently deliver across India. We do not ship internationally yet.</p>

      <h2>Charges</h2>
      <p>
        {/* Same constants checkout charges by; see lib/money.ts. */}
        {DELIVERY_TERMS} The exact charge is shown at checkout before you pay.
      </p>

      <h2>Despatch and delivery times</h2>
      <p>
        Orders are usually despatched within [TO CONFIRM] business days. Delivery typically takes [TO CONFIRM]
        business days depending on your location. These are estimates, not guarantees; couriers can
        be delayed by weather, strikes and public holidays.
      </p>

      <h2>Tracking</h2>
      <p>
        Follow your order&apos;s status on our <a href="/track-order">order tracking page</a> with your
        order number.
      </p>

      <h2>If something goes wrong</h2>
      <p>
        If your order has not arrived within [TO CONFIRM] days of despatch, email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number and we
        will chase it with the courier.
      </p>
    </>
  );
}

import type { Metadata } from 'next';

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
        Delivery is &#8377;79 on orders below &#8377;1,199, and free at or above &#8377;1,199. The
        exact charge is shown at checkout before you pay.
      </p>

      <h2>Despatch and delivery times</h2>
      <p>
        Orders are usually despatched within [TO CONFIRM] business days. Delivery typically takes [TO CONFIRM]
        business days depending on your location. These are estimates, not guarantees; couriers can
        be delayed by weather, strikes and public holidays.
      </p>

      <h2>Tracking</h2>
      <p>
        We email tracking details once your order is despatched. You can also use our
        <a href="/track-order">order tracking page</a>.
      </p>

      <h2>If something goes wrong</h2>
      <p>
        If your order has not arrived within [TO CONFIRM] days of despatch, email
        <a href="mailto:support@avyora.com">support@avyora.com</a> with your order number and we
        will chase it with the courier.
      </p>
    </>
  );
}

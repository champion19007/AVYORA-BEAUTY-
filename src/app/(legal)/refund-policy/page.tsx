import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { RETURN_WINDOW_DAYS } from '@/modules/returns/policy';

export const metadata: Metadata = {
  title: 'Refund and Cancellation Policy',
  description: 'Avyora refund and cancellation policy.',
  alternates: { canonical: '/refund-policy' },
};

export default function Page() {
  return (
    <>
      <h1>Refund &amp; Cancellation Policy</h1>
      <p>Last updated: [TO CONFIRM]</p>

      <h2>Cancelling an order</h2>
      <p>
        You can cancel free of charge until we start packing: open your order from the confirmation email and choose
        Cancel order, or email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number. Once
        packed an order cannot be cancelled, but it may be returnable below.
      </p>

      <h2>Returns</h2>
      <p>
        Request a return from your order page within {RETURN_WINDOW_DAYS} days of delivery. For hygiene reasons we can
        only accept unopened items with seals intact &mdash; unless the product arrived damaged, faulty or incorrect, in
        which case it is returnable whether opened or not.
      </p>

      <h2>Damaged, faulty or wrong items</h2>
      <p>
        Request a return from your order page within {RETURN_WINDOW_DAYS} days of delivery; we may ask for a photograph.
        We will arrange a replacement or a full refund including delivery, at your choice.
      </p>

      <h2>Refunds</h2>
      <p>
        Approved refunds are issued to the original payment method within [TO CONFIRM] business days of us receiving the
        return. Your bank may take a few days longer to show it. Cash-on-delivery orders are refunded by UPI to the UPI
        ID you give us, which we delete once the refund is made.
      </p>

      <h2>Return shipping</h2>
      <p>
        We pay return shipping when an item is damaged, faulty or incorrect. For change-of-mind returns the cost is [TO
        CONFIRM] (confirm whether the customer pays).
      </p>
    </>
  );
}

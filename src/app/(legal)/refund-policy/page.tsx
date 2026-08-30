import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund and Cancellation Policy',
  description: 'Avyora refund and cancellation policy.',
};

export default function Page() {
  return (
    <>
      <h1>Refund &amp; Cancellation Policy</h1>
      <p>Last updated: [TO CONFIRM]</p>

      <h2>Cancelling an order</h2>
      <p>
        You can cancel free of charge any time before despatch by emailing
        <a href="mailto:support@avyora.com">support@avyora.com</a> with your order number. Once
        despatched an order cannot be cancelled, but it may be returnable below.
      </p>

      <h2>Returns</h2>
      <p>
        Tell us within [TO CONFIRM] days of delivery if you want to return something. For hygiene reasons we
        can only accept unopened items with seals intact &mdash; unless the product arrived damaged,
        faulty or incorrect, in which case it is returnable whether opened or not.
      </p>

      <h2>Damaged, faulty or wrong items</h2>
      <p>
        Email us within [TO CONFIRM] days of delivery with your order number and a photograph. We will
        arrange a replacement or a full refund including delivery, at your choice.
      </p>

      <h2>Refunds</h2>
      <p>
        Approved refunds are issued to the original payment method within [TO CONFIRM] business days of us
        receiving the return. Your bank may take a few days longer to show it. Cash-on-delivery
        orders are refunded by bank transfer to details you provide.
      </p>

      <h2>Return shipping</h2>
      <p>
        We pay return shipping when an item is damaged, faulty or incorrect. For change-of-mind
        returns the cost is [TO CONFIRM] (confirm whether the customer pays).
      </p>
    </>
  );
}

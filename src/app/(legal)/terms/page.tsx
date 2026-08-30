import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Avyora terms and conditions.',
};

export default function Page() {
  return (
    <>
      <h1>Terms &amp; Conditions</h1>
      <p>Last updated: [TO CONFIRM]</p>

      <h2>Who you are contracting with</h2>
      <p>
        These terms govern your use of this website and any purchase from it. The seller is [TO CONFIRM]
        (registered entity name), [TO CONFIRM] (registered address), GSTIN [TO CONFIRM].
      </p>

      <h2>Orders</h2>
      <p>
        Placing an order is an offer to buy. A contract forms when we confirm despatch. We may
        decline or cancel an order &mdash; for example if an item is unavailable, if a price was
        listed in error, or if we suspect fraud &mdash; and we will refund anything already paid.
      </p>

      <h2>Prices</h2>
      <p>Prices are in Indian rupees and include GST. Delivery charges are shown before you pay.</p>

      <h2>Products and claims</h2>
      <p>
        Our products are cosmetics, not medicines. Nothing on this site is medical advice, and the
        Routine Finder gives general guidance only. Patch test before first use and stop if a
        reaction occurs. If you have a persistent or painful skin condition, see a dermatologist.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in details secure. Tell us promptly if you believe your account has been used
        without your permission.
      </p>

      <h2>Liability</h2>
      <p>
        Nothing here limits liability that cannot lawfully be limited. Otherwise our liability for
        any order is limited to the amount you paid for it.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India, with courts at [TO CONFIRM] having jurisdiction.</p>
    </>
  );
}

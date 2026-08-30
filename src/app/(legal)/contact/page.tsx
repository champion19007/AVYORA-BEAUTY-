import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Avyora contact us.',
};

export default function Page() {
  return (
    <>
      <h1>Contact Us</h1>

      <h2>Customer support</h2>
      <p>
        Email <a href="mailto:support@avyora.com">support@avyora.com</a>. We aim to reply within one
        business day.
      </p>

      <h2>WhatsApp</h2>
      <p>
        <a href="https://wa.me/919999999999">+91 99999 99999</a> &mdash; [TO CONFIRM] confirm this number
        before publishing.
      </p>

      <h2>Registered address</h2>
      <p>
        [TO CONFIRM] (registered entity name)
        <br />
        [TO CONFIRM] (street address)
        <br />
        [TO CONFIRM] (city, state, PIN)
        <br />
        GSTIN: [TO CONFIRM]
      </p>

      <h2>Grievance redressal</h2>
      <p>
        If we have not resolved something to your satisfaction, contact our grievance officer: [TO CONFIRM]
        (name), [TO CONFIRM] (email).
      </p>
    </>
  );
}

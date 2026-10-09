import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/data/business-info';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Avyora contact us.',
  alternates: { canonical: '/contact' },
};

export default function Page() {
  return (
    <>
      <h1>Contact Us</h1>

      <h2>Customer support</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number if you
        have one. Reply time: [TO CONFIRM].
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

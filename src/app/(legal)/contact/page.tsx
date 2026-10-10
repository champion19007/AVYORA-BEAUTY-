import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { SupportForm } from '@/components/nv/home/support-form';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Avyora contact us.',
  alternates: { canonical: '/contact' },
};

export default function Page() {
  return (
    <>
      <h1>Contact Us</h1>

      <h2>Send us a message</h2>
      {/* The form is designed for a dark surface (it lived on the landing page's photo band). */}
      <div className="not-prose my-6 rounded-nv-card bg-nv-ink p-6 sm:p-10">
        <SupportForm />
      </div>

      <h2>Customer support</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number if you have one. Reply
        time: [TO CONFIRM].
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
        If we have not resolved something to your satisfaction, contact our grievance officer: [TO CONFIRM] (name), [TO
        CONFIRM] (email).
      </p>
    </>
  );
}

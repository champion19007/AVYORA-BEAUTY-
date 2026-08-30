import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Avyora privacy policy.',
};

export default function Page() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: [TO CONFIRM] &mdash; set this when the policy is reviewed.</p>

      <h2>Who we are</h2>
      <p>
        Avyora is operated by [TO CONFIRM] (registered entity name), at [TO CONFIRM] (registered address). For any
        privacy question, contact <a href="mailto:support@avyora.com">support@avyora.com</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Contact and delivery details you enter at checkout: name, email, phone, address.</li>
        <li>
          Order history and payment status. We never see or store your full card details; those go
          directly to our payment provider.
        </li>
        <li>Answers you give the Routine Finder, so we can recommend a routine.</li>
        <li>Basic usage data such as pages viewed, to understand what is and is not working.</li>
        <li>If you sign in with Google: your name, email address and profile picture.</li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        To take and deliver your order, to provide support, to prevent fraud, and to meet our legal
        and tax obligations. We use it for marketing only where you have opted in, and you can
        withdraw that at any time.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Only the services needed to run the shop: our payment provider (Razorpay), our delivery
        partners, and our hosting and database providers. We do not sell your personal data.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order records are retained for as long as tax and accounting law requires ([TO CONFIRM] &mdash;
        confirm the applicable period). Other data is deleted when no longer needed.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct or delete it, or object to how we use
        it. Write to <a href="mailto:support@avyora.com">support@avyora.com</a> and we will respond
        within 30 days.
      </p>

      <h2>Grievance officer</h2>
      <p>As required under Indian law: [TO CONFIRM] (name), [TO CONFIRM] (email), [TO CONFIRM] (address).</p>
    </>
  );
}

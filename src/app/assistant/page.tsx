import type { Metadata } from 'next';
import { AssistantPanel } from '@/components/assistant/assistant-panel';

export const metadata: Metadata = {
  title: 'Ask Avyora',
  description: 'Answers about ingredients, product directions, prices and orders, from reviewed information only.',
  alternates: { canonical: '/assistant' },
};

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Help</p>
      <h1 className="mt-3 font-headline text-5xl font-normal leading-tight tracking-tight">Ask Avyora</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Questions are answered on your device from our reviewed knowledge. They are not sent to us or stored. For
        questions about your own routine, ask from your routine page.
      </p>
      <AssistantPanel className="mt-10" />
    </div>
  );
}

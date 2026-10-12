import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SkinChat } from './skin-chat';

export const metadata: Metadata = {
  title: 'Talk about your skin',
  description: 'An AI skincare guide for everyday skin concerns. Not medical advice.',
  alternates: { canonical: '/skin-chat' },
};

export default async function SkinChatPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/skin-chat');
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Beta</p>
      <h1 className="mt-3 font-headline text-5xl font-normal leading-tight tracking-tight">Talk about your skin</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Tell our AI guide what you are noticing, from breakouts to dryness or sensitivity. It explains what may be going
        on and what everyday care tends to help, and tells you when to see a dermatologist.
      </p>
      <SkinChat />
    </div>
  );
}

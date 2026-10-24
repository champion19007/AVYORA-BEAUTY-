import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { listOffers } from '@/modules/offers/store';
import { OfferEditor } from '../offer-editor';
import { offerEditorData } from '../editor-data';

export const metadata: Metadata = { title: 'Edit offer' };
export const dynamic = 'force-dynamic';

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = (await listOffers(db)).find((o) => o.id === id);
  if (!offer) notFound();
  return <OfferEditor offer={offer} {...await offerEditorData()} />;
}

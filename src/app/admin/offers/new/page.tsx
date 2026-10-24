import type { Metadata } from 'next';
import { OfferEditor } from '../offer-editor';
import { offerEditorData } from '../editor-data';

export const metadata: Metadata = { title: 'New offer' };
export const dynamic = 'force-dynamic';

export default async function NewOfferPage() {
  return <OfferEditor offer={null} {...await offerEditorData()} />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { getEditableProduct } from '@/modules/catalog/product-store';
import { ProductEditor } from '../product-editor';
import { editorProps } from '../editor-props';

export const metadata: Metadata = { title: 'Edit product' };
export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getEditableProduct(db, id);
  if (!product) notFound();
  // Keyed by save time so the form starts from the stored values after a save or a publish.
  return <ProductEditor key={product.updatedAt.toISOString()} product={product} {...await editorProps()} />;
}

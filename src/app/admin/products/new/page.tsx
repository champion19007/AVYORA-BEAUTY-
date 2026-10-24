import type { Metadata } from 'next';
import { ProductEditor } from '../product-editor';
import { editorProps } from '../editor-props';

export const metadata: Metadata = { title: 'Add a product' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  return <ProductEditor product={null} {...await editorProps()} />;
}

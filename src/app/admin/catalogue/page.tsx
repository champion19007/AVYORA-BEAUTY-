import type { Metadata } from 'next';
import { PreviewForm } from './preview-form';

export const metadata: Metadata = { title: 'Catalogue onboarding' };
export const dynamic = 'force-dynamic';

/**
 * Validation preview for real product records (modules/catalog/onboarding.ts).
 * The same checks as `npm run catalogue:validate`. Read-only: approved
 * records are added through a reviewed change, never from this page.
 */
export default function CatalogueOnboardingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-3xl font-normal tracking-tight">Catalogue onboarding</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
          Paste product records to check them before onboarding. Drafts, unresolved ingredients and claims without
          evidence are reported; a product becomes recommendable only when its formulation identity is complete (and,
          for treatments, its directions are approved). Nothing is saved here. See docs/product-onboarding.md for the
          record format.
        </p>
      </div>
      <PreviewForm />
    </div>
  );
}

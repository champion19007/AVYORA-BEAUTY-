'use server';

import { getStaffSession } from '@/lib/staff-auth';
import { EVIDENCE_SOURCES, FORMULATIONS } from '@/data/formulations';
import { PRODUCTS } from '@/data/mock-data';
import { previewOnboarding, type OnboardingPreview } from '@/modules/catalog/onboarding';

export type PreviewState = { preview?: OnboardingPreview; error?: string };

/** Validates pasted product records and returns the report. Read-only: nothing is stored or published. */
export async function previewRecords(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  if (!(await getStaffSession())) return { error: 'Your staff session has ended. Sign in again.' };
  const text = String(formData.get('records') ?? '');
  if (text.length > 1_000_000) return { error: 'Paste at most 1 MB of records at a time.' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: 'That is not valid JSON.' };
  }
  const existing = [...new Set([...PRODUCTS.map((p) => p.id), ...FORMULATIONS.map((f) => f.productId)])];
  return { preview: previewOnboarding(json, EVIDENCE_SOURCES, existing) };
}

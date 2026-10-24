'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, isDatabaseConfigured } from '@/db';
import { getStaffSession } from '@/lib/staff-auth';
import { offerInputSchema, saveOffer, setOfferActive } from '@/modules/offers/store';
import { profitSettingsSchema, saveProfitSettings } from '@/modules/offers/settings';

async function owner(): Promise<string | null> {
  const session = await getStaffSession();
  return session?.role === 'owner' ? session.username : null;
}

export type OfferFormState = { errors?: string[] };

export async function saveOfferAction(_prev: OfferFormState, form: FormData): Promise<OfferFormState> {
  const actor = await owner();
  if (!actor) return { errors: ['Only the owner can run offers.'] };
  if (!isDatabaseConfigured()) return { errors: ['No database is configured.'] };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('offer') ?? ''));
  } catch {
    return { errors: ['The form could not be read. Reload and try again.'] };
  }
  const parsed = offerInputSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const result = await saveOffer(db, parsed.data, actor);
  if (!result.ok) return { errors: result.errors };
  revalidatePath('/admin/offers');
  redirect('/admin/offers?saved=1');
}

export type ToggleState = { error?: string };

export async function toggleOfferAction(_prev: ToggleState, form: FormData): Promise<ToggleState> {
  const actor = await owner();
  if (!actor) return { error: 'Only the owner can run offers.' };
  const id = String(form.get('id') ?? '');
  const active = form.get('active') === 'true';
  const result = await setOfferActive(db, id, active, actor);
  if (!result.ok) return { error: result.errors.join(' ') };
  revalidatePath('/admin/offers');
  return {};
}

export type SettingsState = { error?: string; saved?: boolean };

export async function saveProfitSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const actor = await owner();
  if (!actor) return { error: 'Only the owner can change this.' };
  const parsed = profitSettingsSchema.safeParse({
    floorPercent: form.get('floorPercent'),
    paymentFeePercent: form.get('paymentFeePercent'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the numbers.' };
  await saveProfitSettings(db, parsed.data, actor);
  revalidatePath('/admin/offers');
  revalidatePath('/admin/products');
  return { saved: true };
}

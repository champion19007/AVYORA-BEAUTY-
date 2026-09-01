'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import {
  addressSchema,
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from '@/lib/addresses';

/**
 * Address book mutations.
 *
 * Server actions rather than route handlers: the forms are plain HTML that
 * post to these, so adding an address works before any JavaScript loads and
 * keeps working if it never does.
 *
 * Every action re-derives the user from the session and refuses to act without
 * one. The address id arrives from the client and is therefore untrusted — it
 * is only ever used alongside the session's user id, so submitting someone
 * else's id finds nothing rather than editing their address.
 */

export type AddressFormState = {
  error?: string;
  /** Field-level messages, keyed by input name. */
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

async function requireUserId(): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const session = await auth().catch(() => null);
  return session?.user?.id ?? null;
}

/** Pulls the address fields out of a submitted form. */
function readForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '');
  return {
    fullName: get('fullName'),
    phone: get('phone'),
    postalCode: get('postalCode'),
    line1: get('line1'),
    line2: get('line2'),
    landmark: get('landmark'),
    city: get('city'),
    state: get('state'),
    isDefault: formData.get('isDefault') === 'on',
  };
}

/**
 * Validates and saves. `id` empty means create, otherwise update.
 *
 * Returns the submitted values alongside any errors so the form can be
 * re-rendered with what the customer typed still in it — losing a filled-in
 * address to a validation error is the fastest way to lose the order.
 */
export async function saveAddress(
  _prev: AddressFormState,
  formData: FormData
): Promise<AddressFormState> {
  const userId = await requireUserId();
  if (!userId) return { error: 'Please sign in to save an address.' };

  const raw = readForm(formData);
  const values = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === 'boolean' ? String(v) : v])
  );

  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values, error: 'Please correct the highlighted fields.' };
  }

  const id = String(formData.get('id') ?? '');

  try {
    if (id) {
      const updated = await updateAddress(userId, id, parsed.data);
      if (!updated) return { error: 'That address could not be found.', values };
    } else {
      await createAddress(userId, parsed.data);
    }
  } catch (err) {
    console.error('address save failed', err);
    return { error: 'We could not save that address. Please try again.', values };
  }

  revalidatePath('/account/addresses');
  revalidatePath('/account');
  // Signals the client to navigate; a redirect() here would throw through the
  // useActionState boundary and lose the form state on failure paths.
  return { error: undefined, values: { done: 'true' } };
}

export async function makeDefaultAddress(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  if (!userId) return;

  const id = String(formData.get('id') ?? '');
  if (id) await setDefaultAddress(userId, id);

  revalidatePath('/account/addresses');
  revalidatePath('/account');
}

export async function removeAddress(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  if (!userId) return;

  const id = String(formData.get('id') ?? '');
  if (id) await deleteAddress(userId, id);

  revalidatePath('/account/addresses');
  revalidatePath('/account');
}

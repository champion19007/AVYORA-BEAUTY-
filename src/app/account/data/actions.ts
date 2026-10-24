'use server';

import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { db } from '@/db';
import { privateStorage } from '@/modules/scans/private-storage';
import { eraseAccount, eraseSkinData } from '@/modules/personal/erasure';

/** Only ever the signed-in person's own data: the id comes from the session, never the form. */
async function me() {
  const session = await auth().catch(() => null);
  return session?.user?.id ? { id: session.user.id, email: session.user.email ?? null } : null;
}

const back = (params: string): never => redirect(`/account/data?${params}#delete`);

export async function deleteSkinDataAction(formData: FormData): Promise<void> {
  const user = await me();
  if (!user) redirect('/login?callbackUrl=/account/data');
  if (formData.get('confirm') !== 'yes') back('error=' + encodeURIComponent('Tick the box to confirm.'));
  const result = await eraseSkinData(db as never, privateStorage(), user.id);
  back(result.ok ? 'done=skin' : `error=${encodeURIComponent(result.error)}`);
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const user = await me();
  if (!user) redirect('/login?callbackUrl=/account/data');
  if (
    String(formData.get('confirm') ?? '')
      .trim()
      .toUpperCase() !== 'DELETE'
  ) {
    back('error=' + encodeURIComponent('Type DELETE to confirm.'));
  }
  const result = await eraseAccount(db as never, privateStorage(), user);
  if (!result.ok) back(`error=${encodeURIComponent(result.error)}`);
  await signOut({ redirectTo: '/?account=deleted' });
}

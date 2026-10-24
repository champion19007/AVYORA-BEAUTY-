'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/admin-guard';
import { getStaffSession } from '@/lib/staff-auth';
import { toPaise } from '@/lib/money';
import { decideReturn, receiveReturn, refreshRefund, refundReturn } from '@/modules/returns/returns';

/** Owner-only: every one of these can move money or stock. */
async function owner() {
  if (!(await isAdmin())) return null;
  const session = await getStaffSession();
  return session ? { id: session.username, role: session.role } : null;
}

function done(result: { ok: true } | { ok: false; error: string }): never {
  revalidatePath('/admin/returns');
  revalidatePath('/admin/inventory');
  redirect(result.ok ? '/admin/returns' : `/admin/returns?error=${encodeURIComponent(result.error)}`);
}

const id = (f: FormData) => String(f.get('id') ?? '');

export async function decideReturnAction(formData: FormData): Promise<void> {
  const actor = await owner();
  if (!actor) return;
  done(
    await decideReturn(id(formData), formData.get('decision') === 'approve', actor, String(formData.get('note') ?? ''))
  );
}

export async function receiveReturnAction(formData: FormData): Promise<void> {
  const actor = await owner();
  if (!actor) return;
  done(await receiveReturn(id(formData), formData.get('restock') === 'yes', actor));
}

export async function refundReturnAction(formData: FormData): Promise<void> {
  const actor = await owner();
  if (!actor) return;
  const rupees = Number(String(formData.get('amount') ?? ''));
  done(
    await refundReturn(
      id(formData),
      {
        amountPaise: Number.isFinite(rupees) ? toPaise(rupees) : -1,
        reference: String(formData.get('reference') ?? ''),
      },
      actor
    )
  );
}

export async function refreshRefundAction(formData: FormData): Promise<void> {
  if (!(await owner())) return;
  done(await refreshRefund(id(formData)));
}

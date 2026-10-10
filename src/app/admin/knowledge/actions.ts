'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { getStaffSession } from '@/lib/staff-auth';
import { limit } from '@/lib/rate-limit';
import { publishRepositoryRelease, revokeKnowledge, rollbackKnowledge } from '@/modules/knowledge/admin';

export type KnowledgeActionState = { ok?: boolean; message?: string };

/** The signed-in staff member as an actor, rate limited like other publish actions. */
async function actor() {
  const session = await getStaffSession();
  if (!session) return { error: 'Your staff session has ended. Sign in again.' } as const;
  const limited = await limit([
    { policy: 'staffPublish', subject: { kind: 'identifier', value: `staff:${session.username}` } },
  ]);
  if (!limited.allowed) return { error: 'Too many changes in a short time. Wait a minute and try again.' } as const;
  return { actor: { id: session.username, role: session.role } } as const;
}

const done = (
  r: { ok: true; releaseId: string } | { ok: false; error: string },
  verb: string
): KnowledgeActionState => {
  revalidatePath('/admin/knowledge');
  return r.ok ? { ok: true, message: `${verb} ${r.releaseId}.` } : { ok: false, message: r.error };
};

export async function publishKnowledge(_prev: KnowledgeActionState, formData: FormData): Promise<KnowledgeActionState> {
  if (formData.get('confirm') !== 'PUBLISH') return { ok: false, message: 'Type PUBLISH to confirm.' };
  const a = await actor();
  if ('error' in a) return { ok: false, message: a.error };
  return done(await publishRepositoryRelease(db, a.actor), 'Published and activated');
}

export async function rollbackKnowledgeAction(
  _prev: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const a = await actor();
  if ('error' in a) return { ok: false, message: a.error };
  return done(await rollbackKnowledge(db, a.actor, String(formData.get('reason') ?? '')), 'Rolled back to');
}

export async function revokeKnowledgeAction(
  _prev: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const a = await actor();
  if ('error' in a) return { ok: false, message: a.error };
  return done(
    await revokeKnowledge(db, a.actor, String(formData.get('releaseId') ?? ''), String(formData.get('reason') ?? '')),
    'Revoked'
  );
}

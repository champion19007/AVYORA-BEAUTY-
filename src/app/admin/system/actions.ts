'use server';

import { revalidatePath } from 'next/cache';
import { getStaffSession } from '@/lib/staff-auth';
import { replayJob } from '@/infrastructure/jobs/queue';
import { replayDelivery } from '@/lib/events';
import { recordAudit } from '@/modules/audit/audit';

/**
 * Replaying dead work. Owner-only and audited: a replay re-sends emails and
 * re-applies payment checks, so who pressed it, and when, is worth keeping.
 */

async function owner() {
  const session = await getStaffSession();
  return session?.role === 'owner' ? session : null;
}

export async function replayDeadJob(form: FormData): Promise<void> {
  const session = await owner();
  if (!session) return;
  const id = Number(form.get('jobId'));
  if (!Number.isInteger(id)) return;

  if (await replayJob(id)) {
    await recordAudit({
      actor: session.username,
      actorRole: session.role,
      action: 'job.replay',
      entityType: 'job',
      entityId: String(id),
    });
  }
  revalidatePath('/admin/system');
}

export async function replayDeadDelivery(form: FormData): Promise<void> {
  const session = await owner();
  if (!session) return;
  const eventId = Number(form.get('eventId'));
  const consumer = String(form.get('consumer') ?? '');
  if (!Number.isInteger(eventId) || !consumer) return;

  if (await replayDelivery(consumer, eventId)) {
    await recordAudit({
      actor: session.username,
      actorRole: session.role,
      action: 'event.replay',
      entityType: 'event_delivery',
      entityId: `${eventId}:${consumer}`,
    });
  }
  revalidatePath('/admin/system');
}

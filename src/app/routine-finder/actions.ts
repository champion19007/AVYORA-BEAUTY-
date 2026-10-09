'use server';

import { isDatabaseConfigured } from '@/db';
import { recordEvent } from '@/lib/activity';

/**
 * Counts a completed questionnaire. Nothing else: no answers (skin type and
 * concerns are personal skin information) and no account or cookie id, so
 * the event cannot be linked to anyone. Routine-saving permission is not
 * analytics permission (re-audit A04); answers are stored only when the
 * customer saves a routine, under that consent and its retention.
 *
 * Never throws: a failed count must not stop someone seeing their routine.
 */
export async function recordRoutineCompleted(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await recordEvent({ name: 'routine_completed', path: '/routine-finder', userId: null, anonymousId: null });
  } catch {
    // Counting is best-effort.
  }
}

'use server';

import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { ANONYMOUS_COOKIE } from '@/lib/cart-server';
import { recordEvent, saveRoutineResult } from '@/lib/activity';

/**
 * Persists a completed routine so the customer can return to it, and so the
 * answers can inform which products to stock.
 *
 * Never throws: a failed save must not stop someone seeing their routine.
 */
export async function persistRoutine(answers: unknown, result: unknown): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const session = await auth().catch(() => null);
    const anon = (await cookies()).get(ANONYMOUS_COOKIE)?.value ?? null;

    await saveRoutineResult({
      answers,
      result,
      userId: session?.user?.id ?? null,
      anonymousId: anon,
    });

    await recordEvent({
      name: 'routine_completed',
      path: '/routine-finder',
      userId: session?.user?.id ?? null,
      anonymousId: anon,
      props: {
        // Aggregate signal only; the full answers live in routine_results.
        skinType: String((answers as Record<string, unknown>)?.skinType ?? 'unknown'),
        concern: String((answers as Record<string, unknown>)?.concern ?? 'unknown'),
      },
    });
  } catch (err) {
    console.error('persistRoutine failed (ignored)', err);
  }
}

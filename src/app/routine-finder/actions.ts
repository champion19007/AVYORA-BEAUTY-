'use server';

import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { isDatabaseConfigured } from '@/db';
import { ANONYMOUS_COOKIE } from '@/lib/cart-server';
import { recordEvent } from '@/lib/activity';

/**
 * Called when a routine is shown. Records an aggregate event (skin type and
 * concern only, never the answers) and saves nothing personal.
 *
 * Saving moved to `POST /api/routines` (prompt 16), which recomputes the
 * routine on the server from validated inputs. This action used to store
 * the browser's result JSON under consent; a client result is never stored
 * now, so it no longer accepts one.
 *
 * Never throws: a failed event must not stop someone seeing their routine.
 */
export async function persistRoutine(answers: unknown): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const session = await auth().catch(() => null);
    await recordEvent({
      name: 'routine_completed',
      path: '/routine-finder',
      userId: session?.user?.id ?? null,
      anonymousId: (await cookies()).get(ANONYMOUS_COOKIE)?.value ?? null,
      props: {
        skinType: String((answers as Record<string, unknown>)?.skinType ?? 'unknown'),
        concern: String((answers as Record<string, unknown>)?.concern ?? 'unknown'),
      },
    });
  } catch (err) {
    console.error('persistRoutine failed (ignored)', err);
  }
}

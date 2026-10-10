import { readStorage, writeStorage } from '@/lib/safe-storage';

/*
 * Private-beta unlock: while sign-ups are open (NEXT_PUBLIC_NEWSLETTER=1) a
 * finished routine is shown blurred behind an email sign-up. Once unlocked it
 * stays open in this browser. With sign-ups closed there is no gate at all, so
 * the routine finder can never lock anyone out.
 */

export const UNLOCK_KEY = 'avyora.routine-unlocked';

/** Written out in full so Next.js inlines it at build time. */
export const routineGateEnabled = () => process.env.NEXT_PUBLIC_NEWSLETTER === '1';

/** Unreadable storage (private mode, server render) counts as locked, never as an error. */
export const isRoutineUnlocked = (gate = routineGateEnabled()) => !gate || readStorage(UNLOCK_KEY) === '1';

export const rememberRoutineUnlocked = () => writeStorage(UNLOCK_KEY, '1');

/** Only a usable routine is gated: errors, no-match and invalid plans are always shown. */
export const isRoutineGated = (actionable: boolean, unlocked: boolean) => actionable && !unlocked;

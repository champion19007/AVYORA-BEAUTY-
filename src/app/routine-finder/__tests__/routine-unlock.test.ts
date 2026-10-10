import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNLOCK_KEY, isRoutineGated, isRoutineUnlocked, rememberRoutineUnlocked, routineGateEnabled } from '../routine-unlock';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('routine unlock', () => {
  it('is off unless sign-ups are open', () => {
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER', '');
    expect(routineGateEnabled()).toBe(false);
    expect(isRoutineUnlocked()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER', '1');
    expect(routineGateEnabled()).toBe(true);
  });

  it('stays locked until the email is given, then remembers it', () => {
    expect(isRoutineUnlocked(true)).toBe(false);
    rememberRoutineUnlocked();
    expect(localStorage.getItem(UNLOCK_KEY)).toBe('1');
    expect(isRoutineUnlocked(true)).toBe(true);
  });

  it('treats unreadable storage as locked rather than throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(isRoutineUnlocked(true)).toBe(false);
  });

  it('only gates a usable routine', () => {
    expect(isRoutineGated(true, false)).toBe(true);
    expect(isRoutineGated(true, true)).toBe(false);
    // No-match, invalid plan or error: always visible.
    expect(isRoutineGated(false, false)).toBe(false);
  });
});

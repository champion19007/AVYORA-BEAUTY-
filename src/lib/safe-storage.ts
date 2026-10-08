/**
 * Storage that may not exist: private modes and locked-down browsers throw on
 * access. Every read and write goes through these, and a failure leaves the
 * bag working in memory for the rest of the visit.
 */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Unavailable or full: the in-memory bag carries on.
  }
}
export function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

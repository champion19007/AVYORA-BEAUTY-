/**
 * Demo access for sign-in methods whose delivery channel is not yet live.
 *
 * The problem this solves: email codes cannot reach anyone but the Resend
 * account owner until a domain is verified, and SMS cannot reach anyone at all
 * until DLT registration with TRAI completes — which takes weeks. Both features
 * are finished, and neither can be shown to anyone on the deployed site.
 *
 * So `DEMO_IDENTIFIERS` names a short list of addresses and phone numbers that
 * may use these methods regardless. For a listed identifier with no working
 * delivery channel, the code is returned to the screen instead of being sent.
 *
 * ── Why this is not a hole ────────────────────────────────────────────────
 *
 * Showing a login code on screen is, on its face, exactly the vulnerability
 * you would write a linter to catch. It is safe here only because of the
 * allowlist, and only while these two things both hold:
 *
 *   1. A code is only ever revealed for an identifier on the list. An attacker
 *      cannot type their own address and read a code back, because an
 *      unlisted identifier is refused before a code is even generated.
 *
 *   2. Being on the list is not a way in by itself. The listed identifiers are
 *      the owner's own; revealing a code for an account you already control
 *      grants nothing you did not have.
 *
 * A code is never revealed when the real channel works — a configured provider
 * always wins, so switching Resend or MSG91 on turns this off for that channel
 * without any code change.
 *
 * Unset the variable and the whole mechanism disappears: unset means no
 * identifiers, and no identifiers means nothing is ever revealed. It is
 * therefore off by default, and off in any environment nobody deliberately
 * configured. Remove it once both channels are live.
 */

/** Identifiers permitted to use an otherwise-unavailable channel. */
function demoIdentifiers(): string[] {
  const raw = process.env.DEMO_IDENTIFIERS;
  if (!raw) return [];

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    // Phone numbers may be written with +91, spaces or dashes in the variable;
    // compare against the bare digits the app stores.
    .map((value) => (/^[+\d\s-]+$/.test(value) ? value.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '') : value))
    .filter(Boolean);
}

/** True when this address or number is on the demo list. */
export function isDemoIdentifier(identifier: string): boolean {
  const list = demoIdentifiers();
  if (list.length === 0) return false;
  return list.includes(identifier.trim().toLowerCase());
}

/** True when any demo identifier is configured at all. */
export function demoModeEnabled(): boolean {
  return demoIdentifiers().length > 0;
}

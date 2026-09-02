import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

/**
 * Staff roles: the owner, and the person who packs the parcels.
 *
 * Two roles rather than one shared login, because they need genuinely
 * different things and the separation is the point:
 *
 *   - The **manager** works the shelf and the outgoing post. They add and
 *     remove stock all day, and they raise a request when something runs low.
 *     They have no business seeing revenue or changing prices.
 *
 *   - The **owner** sets prices and offers, and reads the numbers. They should
 *     not be adjusting stock counts casually — the shelf is not in front of
 *     them, so a number they type is a guess. The owner CAN still correct a
 *     count, because sometimes the manager is off sick, but the console asks
 *     twice before letting them.
 *
 * The role travels inside the existing signed session token rather than in a
 * second cookie: one signature to verify, one thing to expire, and no way to
 * hold a valid session whose role says something the signature never covered.
 *
 * Roles are environment credentials, not database rows. There are two of them
 * and they change roughly never; a staff table would be a login screen, an
 * invite flow and a password reset for a problem nobody has yet.
 */

export type StaffRole = 'owner' | 'manager';

/** The session subject is `<role>:<username>`. */
export function encodeSubject(role: StaffRole, username: string): string {
  return `${role}:${username}`;
}

export type StaffSession = { role: StaffRole; username: string };

function decodeSubject(subject: string): StaffSession | null {
  const separator = subject.indexOf(':');
  if (separator === -1) return null;

  const role = subject.slice(0, separator);
  const username = subject.slice(separator + 1);

  if (role !== 'owner' && role !== 'manager') return null;
  if (!username) return null;

  return { role, username };
}

export type StaffCredential = {
  role: StaffRole;
  username: string;
  passwordHash: string;
};

/**
 * The configured staff logins.
 *
 * The owner reuses ADMIN_USERNAME / ADMIN_PASSWORD_HASH, so nothing that
 * already works stops working. The manager is optional: without
 * MANAGER_USERNAME and MANAGER_PASSWORD_HASH there simply is no manager
 * account, rather than a second door with no lock on it.
 */
export function staffCredentials(): StaffCredential[] {
  const list: StaffCredential[] = [];

  const ownerUser = process.env.ADMIN_USERNAME;
  const ownerHash = process.env.ADMIN_PASSWORD_HASH;
  if (ownerUser && ownerHash) {
    list.push({ role: 'owner', username: ownerUser, passwordHash: ownerHash });
  }

  const managerUser = process.env.MANAGER_USERNAME;
  const managerHash = process.env.MANAGER_PASSWORD_HASH;
  if (managerUser && managerHash) {
    list.push({ role: 'manager', username: managerUser, passwordHash: managerHash });
  }

  return list;
}

/** Looks up a credential by username. Returns null if there is no such staff login. */
export function findStaffCredential(username: string): StaffCredential | null {
  return staffCredentials().find((c) => c.username === username) ?? null;
}

/**
 * The current staff session, or null.
 *
 * Fails closed: no secret, no cookie, a bad signature, an expired token or an
 * unrecognised role all return null.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token, secret);
  if (!payload) return null;

  return decodeSubject(payload.sub);
}

/**
 * True when the session may use owner-only screens.
 *
 * Not `role === 'owner' || role === 'manager'`: the owner's screens show
 * revenue and set prices, and a manager reaching them would be a privilege
 * escalation, not a convenience.
 */
export async function isOwner(): Promise<boolean> {
  return (await getStaffSession())?.role === 'owner';
}

/**
 * True for either role.
 *
 * The owner can reach the manager's console deliberately: someone has to pack
 * parcels when the manager is away, and locking the owner out of their own
 * shop's dispatch queue would be a policy nobody asked for.
 */
export async function isStaff(): Promise<boolean> {
  return (await getStaffSession()) !== null;
}

/**
 * What the browser does when it learns who is signed in.
 *
 * The browser remembers whose bag and wishlist it holds (`owner`: an
 * account key, or null for a guest). Comparing that with the server's
 * answer decides everything:
 *
 * | Server says     | Browser holds              | Do                                                      |
 * | --------------- | -------------------------- | ------------------------------------------------------- |
 * | guest           | a guest's state            | keep it                                                 |
 * | guest           | an account's state         | clear it: that account signed out, its bag is private   |
 * | account K       | K's state, nothing pending | adopt the server's copy (another device may have changed it) |
 * | account K       | K's state, unsent changes  | keep it; the mirror is about to send it                 |
 * | account K       | a guest's state, non-empty | merge it into K on the server, then adopt the result    |
 * | account K       | a guest's state, empty     | adopt K's state                                         |
 * | account K       | another account's state    | discard it, adopt K's (never merge one account into another) |
 *
 * Pure, so every row is tested directly.
 */
import type { CartLine } from '@/lib/cart';

export type LocalState = { owner: string | null; lines: CartLine[]; wishlist: string[]; pendingChanges: boolean };
export type ServerState = { accountKey: string | null; cart: CartLine[] | null; wishlist: string[] | null };

export type SyncDecision =
  | { kind: 'keep' }
  | { kind: 'clear' }
  | { kind: 'adopt'; owner: string; lines: CartLine[]; wishlist: string[] }
  | { kind: 'merge'; owner: string };

export function decideSync(local: LocalState, server: ServerState): SyncDecision {
  if (server.accountKey === null) return local.owner === null ? { kind: 'keep' } : { kind: 'clear' };

  const adopt: SyncDecision = {
    kind: 'adopt',
    owner: server.accountKey,
    lines: server.cart ?? [],
    wishlist: server.wishlist ?? [],
  };
  if (local.owner === server.accountKey) return local.pendingChanges ? { kind: 'keep' } : adopt;
  if (local.owner !== null) return adopt; // another account's state: discarded, never merged
  const hasGuestState = local.lines.length > 0 || local.wishlist.length > 0;
  return hasGuestState ? { kind: 'merge', owner: server.accountKey } : adopt;
}

'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef } from 'react';
import type { Product } from '@/data/mock-data';
import { getProductById } from '@/lib/catalogue';
import {
  addLine,
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  normaliseLines,
  removeLine,
  serialiseLines,
  setLineQuantity,
  type AddResult,
  type CartLine,
} from '@/lib/cart';
import { decideSync } from '@/lib/account-sync';
import { parseJson, readStorage, writeStorage } from '@/lib/safe-storage';
import { describeAdjustment } from '@/lib/cart-merge';
import type { SyncState } from '@/app/api/sync/route';
import type { MergeResponse } from '@/app/api/sync/merge/route';

/** Set once this browser's bag has been mirrored to the server, so an emptied bag is synced too. */
const CART_MIRRORED_KEY = 'avyora.cart.mirrored';

/**
 * Whose bag and wishlist this browser holds: an opaque account key, or
 * 'guest'. Compared with the server's answer to decide whether to keep,
 * merge, adopt or clear (lib/account-sync). Absent means unknown: treated
 * as a guest's.
 */
const OWNER_KEY = 'avyora.owner';

/** Re-check identity on focus at most this often. */
const FOCUS_SYNC_INTERVAL_MS = 30_000;

/** Fired by sign-in and sign-out code to re-check identity at once. */
export const IDENTITY_CHANGED_EVENT = 'avyora:identity-changed';

/** A bag line with its catalogue product, for display. Prices come from the quote. */
export type CartEntry = CartLine & { product: Product };

interface User {
  name: string;
  email: string;
  /**
   * UI hint only — it decides what to render, never what is permitted.
   * Admin access is enforced server-side by middleware.ts against a signed
   * httpOnly cookie, so editing this in localStorage grants nothing.
   */
  isAdmin?: boolean;
}

interface AppContextType {
  /** The bag's lines, each with its product for display. */
  cart: CartEntry[];
  /** False until the saved bag has been read; an empty `cart` before then means "not loaded", not "empty". */
  cartReady: boolean;
  /**
   * Adds `quantity` of exactly this SKU. `available`, when the caller knows the
   * stock, caps the total. Returns what was actually added and why not more.
   */
  addToCart: (productId: string, size: string, quantity?: number, available?: number) => AddResult;
  removeFromCart: (productId: string, size: string) => void;
  /** Empties the bag, after an order has been placed from it. */
  clearCart: () => void;
  updateQuantity: (productId: string, size: string, delta: number) => void;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  isLoggedIn: boolean;
  user: User | null;
  login: (email: string, isAdmin?: boolean) => void;
  logout: () => void;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  /** What changed when a guest bag was merged into the account, to tell the customer. */
  syncNotice: string[];
  dismissSyncNotice: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  // The latest lines, for addToCart to compute from synchronously and report
  // what it added. Synced after each commit; addToCart also updates it itself.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const cartHydrated = useRef(false);
  const [cartReady, setCartReady] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isCartOpen, setCartOpen] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string[]>([]);

  /*
   * Identity. `ownerRef` is whose state this browser holds (null = guest,
   * undefined = not yet known: nothing is mirrored until it is). Kept in
   * memory as well as storage, so a browser with storage disabled still
   * syncs correctly for the visit.
   */
  const ownerRef = useRef<string | null | undefined>(undefined);
  const [ownerKnown, setOwnerKnown] = useState(false);
  const wishlistRef = useRef<string[]>([]);
  useEffect(() => {
    wishlistRef.current = wishlist;
  }, [wishlist]);
  /** Local changes not yet confirmed by the server mirror. */
  const pendingChanges = useRef(false);
  /** What the server last confirmed, so adopting server state does not echo back as a save. */
  const lastConfirmed = useRef<{ cart: string; wishlist: string }>({ cart: '', wishlist: '' });
  /** Every identity check gets a new controller; a newer one cancels the older. */
  const syncController = useRef<AbortController | null>(null);
  const lastSyncAt = useRef(0);

  /**
   * Rehydrates persisted state after mount.
   *
   * This cannot move into lazy initial state: localStorage does not exist on
   * the server, and reading it during the first client render would disagree
   * with the server's HTML and break hydration. Reading after mount is the
   * correct shape for client-only persisted state.
   *
   * The reads are wrapped in try/catch because localStorage throws in private
   * browsing on some browsers, and a corrupt JSON value would otherwise take
   * down the whole provider.
   */
  useEffect(() => {
    // Current format first; otherwise migrate the legacy whole-product array.
    const current = parseJson(readStorage(CART_STORAGE_KEY));
    const savedLines = normaliseLines(current ?? parseJson(readStorage(LEGACY_CART_STORAGE_KEY)));
    if (current === null) writeStorage(LEGACY_CART_STORAGE_KEY, null);

    const rawWishlist = parseJson(readStorage('wishlist'));
    const savedWishlist = Array.isArray(rawWishlist)
      ? rawWishlist.filter((id): id is string => typeof id === 'string' && Boolean(getProductById(id)))
      : null;
    const rawUser = parseJson(readStorage('user'));
    const savedUser =
      rawUser && typeof rawUser === 'object' && typeof (rawUser as User).email === 'string' ? (rawUser as User) : null;

    /* eslint-disable react-hooks/set-state-in-effect -- rehydrating client-only
       persisted state after mount is exactly the case this rule cannot model:
       localStorage is unavailable during SSR, so the values cannot come from
       lazy initial state without breaking hydration. */
    setLines(savedLines);
    cartHydrated.current = true;
    setCartReady(true);
    const savedOwner = readStorage(OWNER_KEY);
    ownerRef.current = savedOwner && savedOwner !== 'guest' ? savedOwner : null;
    if (savedWishlist) setWishlist(savedWishlist);
    if (savedUser) {
      setUser(savedUser);
      setIsLoggedIn(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    // Not before the saved bag has been read, or the empty first render
    // would overwrite it.
    if (cartHydrated.current) writeStorage(CART_STORAGE_KEY, serialiseLines(lines));
  }, [lines]);

  const setOwner = useCallback((owner: string | null) => {
    ownerRef.current = owner;
    writeStorage(OWNER_KEY, owner ?? 'guest');
    setOwnerKnown(true);
  }, []);

  /** Replaces local state with what the server confirmed, without echoing it back. */
  const adoptServerState = useCallback(
    (owner: string, serverLines: CartLine[], serverWishlist: string[]) => {
      const nextLines = normaliseLines({ version: 2, lines: serverLines });
      lastConfirmed.current = { cart: serialiseLines(nextLines), wishlist: JSON.stringify(serverWishlist) };
      pendingChanges.current = false;
      linesRef.current = nextLines;
      setLines(nextLines);
      setWishlist(serverWishlist);
      setOwner(owner);
      writeStorage(CART_MIRRORED_KEY, '1');
    },
    [setOwner]
  );

  /**
   * Asks the server who is signed in and reconciles (lib/account-sync):
   * keep, merge the guest's state into the account, adopt the account's
   * state, or clear a signed-out account's private state. A newer check
   * cancels an older one, and an answer that arrives after a newer check
   * started is ignored. A failed check or merge changes nothing: the guest's
   * bag stays in the browser and the next check retries.
   */
  const syncIdentity = useCallback(async () => {
    syncController.current?.abort();
    const controller = new AbortController();
    syncController.current = controller;
    lastSyncAt.current = Date.now();
    try {
      const res = await fetch('/api/sync', { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return;
      const server = (await res.json()) as SyncState;
      if (controller.signal.aborted) return;

      const decision = decideSync(
        {
          owner: ownerRef.current ?? null,
          lines: linesRef.current,
          wishlist: wishlistRef.current,
          pendingChanges: pendingChanges.current,
        },
        server
      );
      if (decision.kind === 'keep') {
        setOwner(ownerRef.current ?? null);
      } else if (decision.kind === 'clear') {
        // The previous account signed out: its bag and wishlist are private.
        linesRef.current = [];
        setLines([]);
        setWishlist([]);
        setCartOpen(false);
        setSyncNotice([]);
        pendingChanges.current = false;
        lastConfirmed.current = { cart: '', wishlist: '' };
        writeStorage(CART_MIRRORED_KEY, '0');
        setOwner(null);
      } else if (decision.kind === 'adopt') {
        adoptServerState(decision.owner, decision.lines, decision.wishlist);
      } else {
        const merged = await fetch('/api/sync/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: linesRef.current, wishlist: wishlistRef.current }),
          signal: controller.signal,
        });
        // Not confirmed: keep the guest bag exactly as it is, and retry later.
        if (!merged.ok || controller.signal.aborted) return;
        const body = (await merged.json()) as MergeResponse;
        if (controller.signal.aborted) return;
        adoptServerState(body.accountKey, body.cart, body.wishlist);
        setSyncNotice(body.adjustments.filter((a) => a.reason !== 'kept_larger').map(describeAdjustment));
      }
    } catch {
      // Offline, aborted or failed: nothing changes; the next check retries.
    }
  }, [adoptServerState, setOwner]);

  // Once the saved state is read: on load, on focus (throttled), when another
  // tab changes the owner, and when sign-in or sign-out code says so.
  useEffect(() => {
    void syncIdentity();
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncAt.current > FOCUS_SYNC_INTERVAL_MS)
        void syncIdentity();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === OWNER_KEY) void syncIdentity();
    };
    const onIdentity = () => void syncIdentity();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener(IDENTITY_CHANGED_EVENT, onIdentity);
    return () => {
      syncController.current?.abort();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(IDENTITY_CHANGED_EVENT, onIdentity);
    };
  }, [syncIdentity]);

  /**
   * Mirrors the bag to the server, debounced (it fires on every quantity
   * tap). Tagged with whose bag it is: the server refuses a save for a
   * different account (409), and the browser then re-checks identity rather
   * than writing one account's bag into another's. Nothing is sent before
   * identity is known, nor for a never-mirrored empty guest bag (every first
   * visit used to create a cart row). Failures leave the bag as it is.
   */
  useEffect(() => {
    if (!cartHydrated.current || !ownerKnown) return;
    const serialised = serialiseLines(lines);
    if (serialised === lastConfirmed.current.cart) return;
    pendingChanges.current = true;
    const mirrored = readStorage(CART_MIRRORED_KEY) === '1';
    if (lines.length === 0 && !mirrored && ownerRef.current === null) return;

    const owner = ownerRef.current ?? null;
    const timer = setTimeout(() => {
      void fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, accountKey: owner }),
      })
        .then((r) => {
          if (r.status === 409) return void syncIdentity();
          if (!r.ok) return;
          lastConfirmed.current.cart = serialised;
          pendingChanges.current = false;
          writeStorage(CART_MIRRORED_KEY, lines.length > 0 ? '1' : '0');
        })
        .catch(() => {});
    }, 800);

    return () => clearTimeout(timer);
  }, [lines, ownerKnown, syncIdentity]);

  useEffect(() => {
    writeStorage('wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  /*
   * The wishlist, for a signed-in customer, lives in Postgres and is read
   * back by the identity check above. Changes are mirrored up, debounced and
   * tagged with the account like the bag. A guest's list stays in this
   * browser; it joins the account's list when they sign in.
   */
  useEffect(() => {
    if (!ownerKnown || !ownerRef.current) return;
    const serialised = JSON.stringify(wishlist);
    if (serialised === lastConfirmed.current.wishlist) return;
    pendingChanges.current = true;
    const owner = ownerRef.current;
    const timer = setTimeout(() => {
      void fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: wishlist, accountKey: owner }),
      })
        .then((r) => {
          if (r.status === 409) return void syncIdentity();
          if (!r.ok) return;
          lastConfirmed.current.wishlist = serialised;
          pendingChanges.current = false;
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [wishlist, ownerKnown, syncIdentity]);

  const addToCart = (productId: string, size: string, quantity = 1, available?: number): AddResult => {
    const result = addLine(linesRef.current, productId, size, quantity, available);
    if (result.added > 0) {
      linesRef.current = result.lines;
      setLines(result.lines);
      setCartOpen(true);
    }
    return result;
  };

  // The server mirror follows: its next save is an empty bag.
  const clearCart = () => {
    linesRef.current = [];
    setLines([]);
  };

  const removeFromCart = (productId: string, size: string) => {
    setLines((prev) => removeLine(prev, productId, size));
  };

  const updateQuantity = (productId: string, size: string, delta: number) => {
    setLines((prev) => {
      const line = prev.find((l) => l.productId === productId && l.size === size);
      return line ? setLineQuantity(prev, productId, size, line.quantity + delta) : prev;
    });
  };

  const cart = useMemo<CartEntry[]>(
    () =>
      lines.flatMap((line) => {
        const product = getProductById(line.productId);
        return product ? [{ ...line, product }] : [];
      }),
    [lines]
  );

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };

  const login = (email: string, isAdmin: boolean = false) => {
    const mockUser = {
      name: isAdmin ? 'System Admin' : 'John Doe',
      email,
      isAdmin,
    };
    setUser(mockUser);
    setIsLoggedIn(true);
    writeStorage('user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    setIsLoggedIn(false);
    writeStorage('user', null);
    // Clear the server-side admin session too, otherwise the signed cookie
    // outlives the UI state and /admin stays reachable after "logging out".
    void fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  };

  return (
    <AppContext.Provider
      value={{
        cart,
        cartReady,
        addToCart,
        removeFromCart,
        clearCart,
        updateQuantity,
        wishlist,
        toggleWishlist,
        isLoggedIn,
        user,
        login,
        logout,
        isCartOpen,
        setCartOpen,
        syncNotice,
        dismissSyncNotice: () => setSyncNotice([]),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Product } from '@/data/mock-data';

interface CartItem extends Product {
  quantity: number;
  selectedSize: string;
}

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
  cart: CartItem[];
  addToCart: (product: Product, size: string) => void;
  removeFromCart: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, delta: number) => void;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  isLoggedIn: boolean;
  user: User | null;
  login: (email: string, isAdmin?: boolean) => void;
  logout: () => void;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isCartOpen, setCartOpen] = useState(false);

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
    let savedCart: CartItem[] | null = null;
    let savedWishlist: string[] | null = null;
    let savedUser: User | null = null;

    try {
      const rawCart = localStorage.getItem('cart');
      const rawWishlist = localStorage.getItem('wishlist');
      const rawUser = localStorage.getItem('user');
      if (rawCart) savedCart = JSON.parse(rawCart);
      if (rawWishlist) savedWishlist = JSON.parse(rawWishlist);
      if (rawUser) savedUser = JSON.parse(rawUser);
    } catch {
      // Unreadable or corrupt storage: start from empty rather than crash.
      return;
    }

    /* eslint-disable react-hooks/set-state-in-effect -- rehydrating client-only
       persisted state after mount is exactly the case this rule cannot model:
       localStorage is unavailable during SSR, so the values cannot come from
       lazy initial state without breaking hydration. */
    if (savedCart) setCart(savedCart);
    if (savedWishlist) setWishlist(savedWishlist);
    if (savedUser) {
      setUser(savedUser);
      setIsLoggedIn(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  /**
   * Mirrors the cart to the server.
   *
   * localStorage stays the fast path so the UI is instant, but a cart that
   * exists only in one browser cannot be recovered on another device and is
   * invisible for abandoned-cart follow-up.
   *
   * Debounced, because this fires on every quantity tap. Failures are ignored:
   * losing a mirror is acceptable, breaking the cart is not. The first render
   * is skipped so an empty initial cart cannot wipe a stored one before
   * localStorage has hydrated.
   */
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }

    const timer = setTimeout(() => {
      void fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.map((item) => ({
            productId: item.id,
            size: item.selectedSize,
            quantity: item.quantity,
          })),
        }),
      }).catch(() => {});
    }, 800);

    return () => clearTimeout(timer);
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  const addToCart = (product: Product, size: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id && item.selectedSize === size);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id && item.selectedSize === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, selectedSize: size }];
    });
    setCartOpen(true);
  };

  const removeFromCart = (productId: string, size: string) => {
    setCart((prev) => prev.filter((item) => !(item.id === productId && item.selectedSize === size)));
  };

  const updateQuantity = (productId: string, size: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === productId && item.selectedSize === size
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const login = (email: string, isAdmin: boolean = false) => {
    const mockUser = { 
      name: isAdmin ? 'System Admin' : 'John Doe', 
      email,
      isAdmin 
    };
    setUser(mockUser);
    setIsLoggedIn(true);
    localStorage.setItem('user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('user');
    // Clear the server-side admin session too, otherwise the signed cookie
    // outlives the UI state and /admin stays reachable after "logging out".
    void fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  };

  return (
    <AppContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        wishlist,
        toggleWishlist,
        isLoggedIn,
        user,
        login,
        logout,
        isCartOpen,
        setCartOpen,
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

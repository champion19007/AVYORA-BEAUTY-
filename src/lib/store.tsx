'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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

  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    const savedWishlist = localStorage.getItem('wishlist');
    const savedUser = localStorage.getItem('user');

    if (savedCart) setCart(JSON.parse(savedCart));
    if (savedWishlist) setWishlist(JSON.parse(savedWishlist));
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
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

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { claimPurchaseReceipt } from "@/lib/purchase-receipts";

export type OneTimePlan = "lifetime" | "aether";
export type CartState = {
  plan: OneTimePlan | null;
  serverSlots: number;
  couponCode: string | null;
};

type CartContextValue = {
  cart: CartState;
  ready: boolean;
  itemCount: number;
  setPlan: (plan: OneTimePlan | null) => void;
  setServerSlots: (quantity: number) => void;
  setCouponCode: (code: string | null) => void;
  settlePurchase: (
    plan: string,
    serverSlots: number,
    reference: string,
  ) => void;
};

const cartStorageKey = "pluginsx:cart:v2";
const legacyCartStorageKey = "pluginsx:plans-cart:v1";
const maxServerSlots = 1000;
const emptyCart: CartState = { plan: null, serverSlots: 0, couponCode: null };
const CartContext = createContext<CartContextValue | null>(null);

function normalizeCart(value: unknown): CartState {
  if (!value || typeof value !== "object") return emptyCart;
  const candidate = value as {
    plan?: unknown;
    lifetime?: unknown;
    serverSlots?: unknown;
    couponCode?: unknown;
  };
  const plan: OneTimePlan | null =
    candidate.plan === "lifetime" || candidate.plan === "aether"
      ? candidate.plan
      : candidate.plan === null
        ? null
        : candidate.lifetime === true
          ? "lifetime"
          : null;
  const serverSlots = Number.isSafeInteger(candidate.serverSlots)
    ? Math.max(0, Math.min(maxServerSlots, Number(candidate.serverSlots)))
    : 0;
  const couponCode =
    typeof candidate.couponCode === "string"
      ? candidate.couponCode.trim().toUpperCase().slice(0, 32) || null
      : null;
  return { plan, serverSlots, couponCode };
}

function readCart(): CartState {
  try {
    const stored = window.localStorage.getItem(cartStorageKey);
    if (stored) return normalizeCart(JSON.parse(stored));
    const legacy = window.localStorage.getItem(legacyCartStorageKey);
    return legacy ? normalizeCart(JSON.parse(legacy)) : emptyCart;
  } catch {
    return emptyCart;
  }
}

export function CartProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [cart, setCart] = useState<CartState>(emptyCart);
  const [ready, setReady] = useState(false);
  const settledReceipts = useRef(new Set<string>());

  useEffect(() => {
    setCart(readCart());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      window.localStorage.removeItem(legacyCartStorageKey);
    } catch {
      // Keep the current cart usable for this visit if browser storage is blocked.
    }
  }, [cart, ready]);

  useEffect(() => {
    function syncCart(event: StorageEvent) {
      if (event.key !== cartStorageKey && event.key !== legacyCartStorageKey)
        return;
      try {
        setCart(readCart());
      } catch {
        setCart(emptyCart);
      }
    }

    window.addEventListener("storage", syncCart);
    return () => window.removeEventListener("storage", syncCart);
  }, []);

  const setPlan = useCallback((plan: OneTimePlan | null) => {
    setCart((current) => ({ ...current, plan }));
  }, []);

  const setServerSlots = useCallback((quantity: number) => {
    const normalized = Number.isSafeInteger(quantity)
      ? Math.max(0, Math.min(maxServerSlots, quantity))
      : 0;
    setCart((current) => ({ ...current, serverSlots: normalized }));
  }, []);

  const setCouponCode = useCallback((code: string | null) => {
    const normalized = code?.trim().toUpperCase().slice(0, 32) || null;
    setCart((current) => ({ ...current, couponCode: normalized }));
  }, []);

  const settlePurchase = useCallback(
    (plan: string, serverSlots: number, reference: string) => {
      let storage: Storage | undefined;
      try {
        storage = window.localStorage;
      } catch {
        /* Browser storage is optional. */
      }
      if (!claimPurchaseReceipt(reference, settledReceipts.current, storage))
        return;
      const purchasedSlots = Number.isSafeInteger(serverSlots)
        ? Math.max(0, serverSlots)
        : 0;
      setCart((current) => ({
        plan: current.plan === plan ? null : current.plan,
        serverSlots: Math.max(0, current.serverSlots - purchasedSlots),
        couponCode: null,
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({
      cart,
      ready,
      itemCount: Number(Boolean(cart.plan)) + cart.serverSlots,
      setPlan,
      setServerSlots,
      setCouponCode,
      settlePurchase,
    }),
    [cart, ready, setPlan, setServerSlots, setCouponCode, settlePurchase],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}

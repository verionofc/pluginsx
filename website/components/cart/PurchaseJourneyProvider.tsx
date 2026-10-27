"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCart } from "@/components/cart/CartProvider";
import { authClient } from "@/lib/auth-client";
import {
  arrivalWasSeen,
  discoverPurchase,
  forgetPurchase,
  isPurchaseReference,
  markArrivalSeen,
  type PurchaseProgressData,
  type PurchaseStorage,
  purchaseIsReady,
  purchasePhase,
  purchaseUpdatedEvent,
  rememberPurchase,
  restoredPurchase,
  safeCheckoutUrl,
} from "@/lib/purchase-progress";
import { PurchaseArrival } from "./PurchaseArrival";

type Journey = {
  purchase: PurchaseProgressData | null;
  reference: string | null;
  checking: boolean;
  connectionError: string;
  refresh: () => void;
  track: (reference: string) => void;
  prepareCheckout: () => Window | null;
  beginCheckout: (reference: string, url: string, popup: Window | null) => void;
  resumeCheckout: (url: string) => void;
  dismiss: () => void;
};
const JourneyContext = createContext<Journey | null>(null);
function storage(): PurchaseStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function PurchaseJourneyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();
  const owner = session?.user.id;
  const pathname = usePathname();
  const { ready: cartReady, settlePurchase } = useCart();
  const ownerScope = useRef(owner);
  const [tracked, setTracked] = useState<{
    owner: string;
    reference: string;
  } | null>(null);
  const [result, setResult] = useState<{
    owner: string;
    purchase: PurchaseProgressData;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const requestNow = useRef<() => void>(() => {});
  const [arrival, setArrival] = useState<{
    owner: string;
    purchase: PurchaseProgressData;
  } | null>(null);
  const providerWindow = useRef<Window | null>(null);
  const announced = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const reference =
    tracked && tracked.owner === owner ? tracked.reference : null;
  const purchase =
    result && result.owner === owner && result.purchase.reference === reference
      ? result.purchase
      : null;

  useEffect(() => {
    ownerScope.current = owner;
  }, [owner]);
  const track = useCallback(
    (next: string) => {
      if (!owner || ownerScope.current !== owner || !isPurchaseReference(next))
        return;
      rememberPurchase(storage(), owner, next);
      setTracked((current) =>
        current?.owner === owner && current.reference === next
          ? current
          : { owner, reference: next },
      );
      setConnectionError("");
    },
    [owner],
  );
  const refresh = useCallback(() => requestNow.current(), []);

  useEffect(() => {
    if (!pathname || !owner || isPending) return;
    const query = new URLSearchParams(window.location.search).get("purchase");
    const remembered = restoredPurchase(storage(), owner);
    const recovered = isPurchaseReference(query) ? query : remembered;
    if (recovered) {
      track(recovered);
      return;
    }
    const controller = new AbortController();
    void fetch("/billing/state", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((state: { lastPurchase?: unknown } | null) => {
        if (controller.signal.aborted || ownerScope.current !== owner) return;
        const found = discoverPurchase(state?.lastPurchase, storage(), owner);
        if (found) track(found);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [owner, isPending, pathname, track]);

  useEffect(() => {
    if (!owner || !reference || !cartReady || isPending) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let requests = 0;
    let inFlight = false;
    let stopped = false;
    const request = async () => {
      if (controller.signal.aborted || inFlight || ownerScope.current !== owner)
        return;
      inFlight = true;
      setChecking(true);
      window.clearTimeout(timer);
      let nextDelay: number | null = requests++ < 40 ? 3000 : 10000;
      try {
        const response = await fetch(`/billing/purchase/${reference}`, {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (response.status === 404 || response.status === 403) {
          forgetPurchase(storage(), owner);
          setConnectionError("Este pedido não foi encontrado na sua conta.");
          nextDelay = null;
          return;
        }
        if (!response.ok)
          throw new Error("Não foi possível consultar o pedido agora.");
        const data = (await response.json()) as PurchaseProgressData;
        if (controller.signal.aborted || ownerScope.current !== owner) return;
        const normalized = { ...data, reference };
        setResult({ owner, purchase: normalized });
        setConnectionError("");
        const phase = purchasePhase(normalized);
        if (phase === "ready") {
          nextDelay = null;
          settlePurchase(
            normalized.plan,
            Number(normalized.serverSlots ?? 0),
            reference,
          );
          if (!completed.current.has(`${owner}:${reference}`)) {
            completed.current.add(`${owner}:${reference}`);
            window.dispatchEvent(
              new CustomEvent(purchaseUpdatedEvent, { detail: normalized }),
            );
          }
          if (
            !announced.current.has(`${owner}:${reference}`) &&
            !arrivalWasSeen(storage(), owner, reference)
          ) {
            announced.current.add(`${owner}:${reference}`);
            markArrivalSeen(storage(), owner, reference);
            setArrival({ owner, purchase: normalized });
          }
          try {
            providerWindow.current?.close();
          } catch {
            /* The receipt remains on the site if the browser retains its payment tab. */
          }
          providerWindow.current = null;
        } else if (phase === "review" || phase === "revoked") {
          nextDelay = null;
          setArrival((current) =>
            current?.purchase.reference === reference ? null : current,
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setConnectionError(
            "A confirmação está demorando a responder. Seu pedido continua salvo e será consultado novamente.",
          );
      } finally {
        inFlight = false;
        if (!controller.signal.aborted && ownerScope.current === owner) {
          setChecking(false);
          if (nextDelay !== null && !stopped)
            timer = window.setTimeout(() => {
              if (document.visibilityState !== "hidden") void request();
            }, nextDelay);
        }
      }
    };
    const onFocus = () => {
      if (document.visibilityState !== "hidden") void request();
    };
    const trigger = () => void request();
    requestNow.current = trigger;
    void request();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (requestNow.current === trigger) requestNow.current = () => {};
    };
  }, [owner, reference, cartReady, isPending, settlePurchase]);

  const prepareCheckout = useCallback(() => {
    const popup = window.open(
      "about:blank",
      "_blank",
      "popup,width=570,height=800",
    );
    if (popup) {
      popup.opener = null;
      popup.document.title = "Preparando pagamento · PluginsX";
      popup.document.body.style.cssText =
        "margin:0;min-height:100vh;display:grid;place-items:center;background:#101711;color:#d8e7cd;font:16px system-ui,sans-serif";
      popup.document.body.textContent = "Preparando seu pagamento seguro…";
    }
    return popup;
  }, []);
  const beginCheckout = useCallback(
    (next: string, rawUrl: string, popup: Window | null) => {
      const url = safeCheckoutUrl(rawUrl, window.location.origin);
      if (
        !owner ||
        ownerScope.current !== owner ||
        !isPurchaseReference(next) ||
        !url
      ) {
        popup?.close();
        throw new Error(
          "Não foi possível acompanhar este pedido. Atualize a página e tente novamente.",
        );
      }
      track(next);
      const destination = new URL(url);
      if (destination.origin === window.location.origin) {
        popup?.close();
        window.location.assign(url);
        return;
      }
      if (popup && !popup.closed) {
        providerWindow.current = popup;
        popup.location.href = url;
      } else window.location.assign(url);
      if (next === reference) refresh();
    },
    [owner, track, refresh, reference],
  );
  const resumeCheckout = useCallback(
    (rawUrl: string) => {
      if (!reference) return;
      beginCheckout(reference, rawUrl, prepareCheckout());
    },
    [reference, beginCheckout, prepareCheckout],
  );
  const dismiss = useCallback(() => {
    if (owner) forgetPurchase(storage(), owner);
    setTracked(null);
    setResult(null);
    setArrival(null);
    setConnectionError("");
  }, [owner]);
  const value = useMemo(
    () => ({
      purchase,
      reference,
      checking,
      connectionError,
      refresh,
      track,
      prepareCheckout,
      beginCheckout,
      resumeCheckout,
      dismiss,
    }),
    [
      purchase,
      reference,
      checking,
      connectionError,
      refresh,
      track,
      prepareCheckout,
      beginCheckout,
      resumeCheckout,
      dismiss,
    ],
  );
  return (
    <JourneyContext.Provider value={value}>
      {children}
      {arrival &&
      arrival.owner === owner &&
      purchaseIsReady(arrival.purchase) ? (
        <PurchaseArrival
          purchase={arrival.purchase}
          onClose={() => setArrival(null)}
        />
      ) : null}
    </JourneyContext.Provider>
  );
}

export function usePurchaseJourney() {
  const context = useContext(JourneyContext);
  if (!context) throw new Error("PurchaseJourneyProvider is required.");
  return context;
}

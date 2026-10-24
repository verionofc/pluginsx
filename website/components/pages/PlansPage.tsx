"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TbBlocks,
  TbCheck,
  TbCopy,
  TbMinus,
  TbPick,
  TbPlus,
  TbShoppingCart,
} from "react-icons/tb";
import { useCart } from "@/components/cart/CartProvider";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { useHydrated } from "@/hooks/useHydrated";
import { useLoadingDelay } from "@/hooks/useLoadingDelay";
import { authClient } from "@/lib/auth-client";

type PlanId = "free" | "monthly" | "lifetime" | "aether";

type BillingState = {
  access: null | {
    plan: PlanId;
    status: string;
    expiresAt?: string;
    trialUsedAt?: string;
    trialExpiresAt?: string;
    cancelAtPeriodEnd?: boolean;
    canCancelSubscription?: boolean;
  };
  temporaryLicense?: null | { code: string; expiresAt: string };
  lastPurchase: null | { plan: string; status: string; createdAt: string };
  additionalServerSlots?: number;
};
type PlanCatalog = {
  trialEnabled: boolean;
  plans: { id: string; amount: number; formattedPrice: string }[];
  serverSlot?: { amount: number; formattedPrice: string; maxPerPurchase: number };
};
const temporaryTrialStorageKey = (accountId: string) =>
  `pluginsx:temporary-trial:${accountId}`;

const formatTrialCountdown = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};

const perks = {
  free: [
    "Licença Plus temporária por 12 horas",
    "Até 1 servidor ativo",
    "Key sem ownerId; recuperável nesta página durante a validade",
    "Uma emissão por conta, sem reemissão após expirar",
    "Removida automaticamente ao expirar",
  ],
  monthly: [
    "Acesso Premium/Plus",
    "Cobrança recorrente mensal",
    "Até 3 servidores por licença",
    "Cancele a renovação e mantenha o período pago",
  ],
  lifetime: [
    "Acesso vitalício Premium/Plus",
    "Pagamento único",
    "Até 5 servidores por licença",
    "Sem renovação mensal",
  ],
  aether: [
    "Acesso vitalício Premium/Plus",
    "Pagamento único",
    "Até 250 servidores por licença",
    "Vagas extras disponíveis no carrinho",
  ],
};

const planDetails: Record<PlanId, {
  name: string;
  realm: string;
  description: string;
  image: string;
  imageAlt: string;
}> = {
  free: {
    name: "Trial Key",
    realm: "ITEM DE TESTE · OVERWORLD",
    description: "Experimente os recursos Plus por 12 horas em 1 servidor, sem cobrança.",
    image: "/images/Chave%20Voxel%20de%20Grama%20e%20Terra.png",
    imageAlt: "Chave voxel com grama e terra",
  },
  monthly: {
    name: "Creeper",
    realm: "OVERWORLD · CREEPER",
    description: "Renovação mensal. Cancele quando quiser e mantenha o acesso até o fim do período pago.",
    image: "/images/Chave%20Voxel%20de%20Grama%20e%20Terra.png",
    imageAlt: "Chave voxel com grama e terra representando o plano Creeper",
  },
  lifetime: {
    name: "Ender Dragon",
    realm: "THE END · ENDER DRAGON",
    description: "Uma compra, sem renovação. O custo se paga a partir do sexto mês.",
    image: "/images/Chave%20Voxel%20do%20Portal%20Nether.png",
    imageAlt: "Chave voxel do Portal Nether representando o plano Ender Dragon",
  },
  aether: {
    name: "Aether",
    realm: "CÉU · AETHER",
    description: "Uma compra vitalícia para redes grandes, com até 250 servidores incluídos.",
    image: "/images/Chave%20Voxel%20do%20Portal%20Nether.png",
    imageAlt: "Chave voxel do Portal Nether representando o plano Aether",
  },
};

export function PlansPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const hasHydrated = useHydrated();
  const isSessionReady = hasHydrated && !sessionPending;
  const { cart, ready: cartReady, itemCount: cartItemCount, setPlan, setServerSlots, settlePurchase } = useCart();
  const [state, setState] = useState<BillingState>();
  const [catalog, setCatalog] = useState<PlanCatalog>();
  const [slotQuantity, setSlotQuantity] = useState(1);
  const handledPurchaseRef = useRef<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("monthly");
  const [loading, setLoading] = useState(true);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [returnStatus, setReturnStatus] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [temporaryLicense, setTemporaryLicense] = useState<{
    code: string;
    expiresAt: string;
    accountId: string;
  } | null>(null);
  const [temporaryLicenseLoadedFor, setTemporaryLicenseLoadedFor] = useState<string | null>(null);
  const [temporaryLicenseExpired, setTemporaryLicenseExpired] = useState(false);
  const [temporaryLicenseCopied, setTemporaryLicenseCopied] = useState(false);
  const [trialSecondsRemaining, setTrialSecondsRemaining] = useState<number | null>(null);
  const temporaryLicenseScope = session?.user.id ?? "guest";
  const sessionUserId = session?.user.id;
  const temporaryLicenseReady =
    isSessionReady && temporaryLicenseLoadedFor === temporaryLicenseScope;
  const currentTemporaryLicense =
    session && temporaryLicense?.accountId === session.user.id
      ? temporaryLicense
      : null;

  const refresh = useCallback(async () => {
    if (!session) {
      setState(undefined);
      setLoading(false);
      setInitialStateLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/billing/state", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const nextState = (await response.json()) as BillingState;
      setState(nextState);
      const accountId = session.user.id;
      if (nextState.temporaryLicense && Date.parse(nextState.temporaryLicense.expiresAt) > Date.now()) {
        const recoveredLicense = { ...nextState.temporaryLicense, accountId };
        setTemporaryLicense(recoveredLicense);
        setTemporaryLicenseExpired(false);
        try {
          window.localStorage.setItem(
            temporaryTrialStorageKey(accountId),
            JSON.stringify(nextState.temporaryLicense),
          );
        } catch {
          // The authenticated API can restore the key during the validity window.
        }
      } else if (nextState.access?.trialExpiresAt && Date.parse(nextState.access.trialExpiresAt) <= Date.now()) {
        setTemporaryLicense(null);
        setTemporaryLicenseExpired(true);
        try {
          window.localStorage.removeItem(temporaryTrialStorageKey(accountId));
        } catch {
          // The expired code is hidden in the UI and rejected by the API regardless.
        }
      }
      setError("");
    } catch {
      setError("Não foi possível consultar seus planos. Tente novamente.");
    } finally {
      setLoading(false);
      setInitialStateLoaded(true);
    }
  }, [session]);

  useEffect(() => {
    if (!sessionPending) void refresh();
  }, [refresh, sessionPending]);

  useEffect(() => {
    const currentPlan = state?.access?.plan;
    if (currentPlan === "monthly" || currentPlan === "lifetime" || currentPlan === "aether") {
      setSelectedPlan(currentPlan);
    }
  }, [state?.access?.plan]);

  useEffect(() => {
    void fetch("/billing/catalog", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<PlanCatalog>;
      })
      .then(setCatalog)
      .catch(() =>
        setError("Não foi possível carregar os preços. Atualize a página."),
      )
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    setReturnStatus(search.get("return"));
    setReturnTo(search.get("returnTo"));
    if (!search.has("return")) return;
    void refresh();
  }, [refresh, session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    setReturnStatus(search.get("return"));
    setReturnTo(search.get("returnTo"));
  }, []);

  useEffect(() => {
    if (!sessionUserId || !cartReady || typeof window === "undefined") return;
    const reference = new URLSearchParams(window.location.search).get("purchase");
    if (!reference || !/^[0-9a-f-]{36}$/i.test(reference) || handledPurchaseRef.current === reference) return;
    handledPurchaseRef.current = reference;
    let cancelled = false;

    async function checkPurchase() {
      for (let attempt = 0; attempt < 9 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/billing/purchase/${reference}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (response.ok) {
            const purchase = await response.json() as {
              plan: string;
              serverSlots?: number;
              status: string;
            };
            if (purchase.status === "approved") {
              const purchasedSlots = Math.max(0, Number(purchase.serverSlots ?? 0));
              settlePurchase(purchase.plan, purchasedSlots);
              setMessage(purchase.plan === "server_slots"
                ? `${purchasedSlots} ${purchasedSlots === 1 ? "vaga extra foi confirmada" : "vagas extras foram confirmadas"} e já estão disponíveis na sua licença.`
                : purchase.plan === "monthly"
                  ? "Primeira cobrança confirmada. Seu acesso Creeper está ativo."
                  : `Pagamento confirmado. Seu ${purchase.plan === "aether" ? "Aether" : "Ender Dragon"} está ativo${purchasedSlots > 0 ? ` com ${purchasedSlots} ${purchasedSlots === 1 ? "vaga extra" : "vagas extras"}` : ""}.`);
              setReturnStatus("success");
              await refresh();
              return;
            }
            if (["rejected", "cancelled", "refunded", "charged_back"].includes(purchase.status)) {
              setMessage("A compra não foi aprovada. Os itens continuam no carrinho para você tentar novamente.");
              return;
            }
          }
        } catch {
          // Retry while the payment notification reaches the API.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      if (!cancelled) setMessage("Pagamento ainda em processamento. Seus itens continuam no carrinho e a página atualizará o acesso após a confirmação.");
    }

    void checkPurchase();
    return () => { cancelled = true; };
  }, [sessionUserId, cartReady, refresh, settlePurchase]);

  useEffect(() => {
    if (!isSessionReady) return;

    const accountId = session?.user.id;
    if (!accountId) {
      setTemporaryLicense(null);
      setTemporaryLicenseLoadedFor("guest");
      return;
    }

    let savedLicense: typeof temporaryLicense = null;
    try {
      const storageKey = temporaryTrialStorageKey(accountId);
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue) {
        const parsed = JSON.parse(storedValue) as {
          code?: unknown;
          expiresAt?: unknown;
        };
        if (
          typeof parsed.code === "string" &&
          parsed.code.startsWith("plus_") &&
          typeof parsed.expiresAt === "string" &&
          Number.isFinite(Date.parse(parsed.expiresAt)) &&
          Date.parse(parsed.expiresAt) > Date.now()
        ) {
          savedLicense = {
            code: parsed.code,
            expiresAt: parsed.expiresAt,
            accountId,
          };
        } else {
          window.localStorage.removeItem(storageKey);
        }
      }
    } catch {
      savedLicense = null;
    }

    setTemporaryLicense(savedLicense);
    setTemporaryLicenseExpired(false);
    setTemporaryLicenseLoadedFor(accountId);
  }, [isSessionReady, session?.user.id]);

  useEffect(() => {
    if (!currentTemporaryLicense) {
      setTrialSecondsRemaining(null);
      return;
    }

    const expiresAt = Date.parse(currentTemporaryLicense.expiresAt);
    const updateCountdown = () => {
      setTrialSecondsRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(temporaryTrialStorageKey(currentTemporaryLicense.accountId));
      } catch {
        // The API will no longer return this code after its expiration.
      }
      setTemporaryLicense((current) =>
        current?.accountId === currentTemporaryLicense.accountId ? null : current,
      );
      setTemporaryLicenseExpired(true);
    }, Math.max(0, expiresAt - Date.now()));
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [currentTemporaryLicense]);

  async function startTrial() {
    if (!session) {
      window.location.assign(
        `/account?returnTo=${encodeURIComponent("/plans")}`,
      );
      return;
    }

    setBusy("free");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/billing/trial", {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "TRIAL_ALREADY_USED") await refresh();
        throw new Error(result.message ?? "Não foi possível ativar o teste.");
      }
      if (typeof result.code !== "string" || typeof result.expiresAt !== "string")
        throw new Error("A API não retornou a licença temporária.");
      const issuedLicense = {
        code: result.code,
        expiresAt: result.expiresAt,
        accountId: session.user.id,
      };
      setTemporaryLicenseExpired(false);
      try {
        window.localStorage.setItem(
          temporaryTrialStorageKey(session.user.id),
          JSON.stringify({ code: issuedLicense.code, expiresAt: issuedLicense.expiresAt }),
        );
      } catch {
        setMessage("Copie a key antes de sair: o navegador não permitiu guardá-la para a próxima visita.");
      }
      setTemporaryLicense(issuedLicense);
      setTemporaryLicenseLoadedFor(session.user.id);
      setTemporaryLicenseCopied(false);
      void refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ativar o teste.",
      );
    } finally {
      setBusy("");
    }
  }

  async function copyTemporaryLicense() {
    if (!currentTemporaryLicense) return;
    try {
      await navigator.clipboard.writeText(currentTemporaryLicense.code);
      setTemporaryLicenseCopied(true);
      setError("");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione e copie a key exibida.");
    }
  }

  async function checkout(plan: "monthly") {
    if (!session) {
      window.location.assign(
        `/account?returnTo=${encodeURIComponent("/plans")}`,
      );
      return;
    }
    setBusy(plan);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          returnTo: "/plans",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? "Não foi possível iniciar o checkout.",
        );
      if (
        typeof result.checkoutUrl !== "string" ||
        !result.checkoutUrl.startsWith("https://")
      )
        throw new Error("Checkout indisponível.");
      window.location.assign(result.checkoutUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível iniciar o checkout.",
      );
      setBusy("");
    }
  }

  async function cancelRenewal() {
    setBusy("cancel");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/billing/cancel", {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Não foi possível cancelar.");
      setMessage(
        result.expiresAt
          ? `Renovação cancelada. Seu acesso continua até ${new Date(result.expiresAt).toLocaleString("pt-BR")}.`
          : "Assinatura cancelada.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível cancelar a renovação.",
      );
    } finally {
      setBusy("");
    }
  }

  const access = state?.access;
  const trialAlreadyUsed = Boolean(access?.trialUsedAt || currentTemporaryLicense);
  const trialWindowExpired = temporaryLicenseExpired || Boolean(
    access?.trialExpiresAt && Date.parse(access.trialExpiresAt) <= Date.now(),
  );
  const activePaid = Boolean(
    access &&
      access.status === "active" &&
      (access.plan === "lifetime" || access.plan === "aether" ||
        (access.expiresAt && new Date(access.expiresAt) > new Date())),
  );
  const planLabel =
    access?.plan === "monthly"
      ? "Creeper"
      : access?.plan === "lifetime"
        ? "Ender Dragon"
        : access?.plan === "aether"
          ? "Aether"
        : access?.plan === "free" && access.status === "trial"
          ? "Trial Key"
          : "Acesso básico";
  const planChoices: PlanId[] = catalog?.trialEnabled
    ? ["free", "monthly", "lifetime", "aether"]
    : ["monthly", "lifetime", "aether"];
  const visibleSelectedPlan = planChoices.includes(selectedPlan)
    ? selectedPlan
    : "monthly";
  const selectedProduct = planDetails[visibleSelectedPlan];
  const selectedPrice =
    visibleSelectedPlan === "free"
      ? "Grátis"
      : (catalog?.plans.find((plan) => plan.id === visibleSelectedPlan)
          ?.formattedPrice ?? "Carregando…");
  const selectedPlanIndex = planChoices.indexOf(visibleSelectedPlan) + 1;
  const selectedPlanIsCurrent =
    access?.plan === visibleSelectedPlan && activePaid;
  const subscriptionBlocked =
    access?.status === "pending" || access?.status === "past_due";
  const safeReturnTo =
    returnTo?.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("\\")
      ? returnTo
      : null;
  const accountTitle = loading
    ? "Consultando sua conta…"
    : access
      ? planLabel
      : state?.lastPurchase?.status === "pending"
        ? "Pagamento em processamento"
        : "Nenhum plano contratado";
  const accessStatusLabel =
    access?.status === "active"
      ? "ativo"
      : access?.status === "trial"
        ? "em teste"
        : access?.status === "past_due"
          ? "com pagamento atrasado"
          : access?.status === "expired"
            ? "expirado"
            : access?.status === "canceled"
              ? "cancelado"
              : access?.status === "revoked"
                ? "revogado"
                : access?.status === "pending"
                  ? "aguardando pagamento"
                  : access?.status ?? "";
  const accessDescription = loading
    ? "Estamos buscando o estado mais recente."
    : access?.status === "past_due"
      ? "Pagamento atrasado. Regularize sua assinatura no Mercado Pago para manter o acesso."
      : access?.cancelAtPeriodEnd
        ? `Renovação cancelada; acesso mantido até ${access.expiresAt ? new Date(access.expiresAt).toLocaleString("pt-BR") : "o fim do período pago"}.`
        : access?.expiresAt
          ? `Acesso ${accessStatusLabel}. Válido até ${new Date(access.expiresAt).toLocaleString("pt-BR")}.`
          : access
            ? `Acesso ${accessStatusLabel}.`
            : state?.lastPurchase?.status === "pending"
              ? "A licença será liberada assim que o Mercado Pago confirmar o pagamento."
              : state?.lastPurchase?.status === "rejected"
                ? "O último pagamento foi recusado. Você pode escolher um plano e tentar novamente."
                : "Escolha um plano abaixo para começar a usar os recursos Premium.";
  const trialActionLabel =
    busy === "free"
      ? "Preparando sua key…"
      : currentTemporaryLicense
        ? temporaryLicenseExpired
          ? "Trial expirado"
          : "Key já gerada"
        : trialAlreadyUsed
          ? "Trial já utilizado"
          : !isSessionReady
            ? "Verificando sessão…"
            : !session
              ? "Entrar para gerar key"
              : "Gerar key temporária";
  const checkoutActionLabel =
    busy === visibleSelectedPlan
      ? "Abrindo checkout…"
      : !isSessionReady
        ? "Verificando sessão…"
        : !session
          ? "Entrar para assinar"
          : access?.status === "pending"
            ? "Aguardando confirmação"
            : access?.status === "past_due"
              ? "Regularize sua assinatura"
              : activePaid
                ? "Você já tem acesso ativo"
                : visibleSelectedPlan === "monthly"
                  ? "Assinar o Creeper"
                  : "Desbloquear Ender Dragon";
  const isPageLoading =
    !isSessionReady ||
    !temporaryLicenseReady ||
    !initialStateLoaded ||
    catalogLoading ||
    !cartReady;
  const showLoading = useLoadingDelay(isPageLoading);
  const slotPrice = catalog?.serverSlot?.amount ?? 4.9;
  const slotPriceLabel = catalog?.serverSlot?.formattedPrice ?? "R$ 4,90";
  const cartMaximum = catalog?.serverSlot?.maxPerPurchase ?? 99;
  const canBuyExtraSlots = activePaid || Boolean(cart.plan);

  function addOneTimePlanToCart(plan: "lifetime" | "aether") {
    if (activePaid || subscriptionBlocked) return;
    setPlan(plan);
    setMessage(`${plan === "aether" ? "Aether" : "Ender Dragon"} adicionado ao carrinho.`);
    setError("");
  }

  function addSlotsToCart() {
    if (!canBuyExtraSlots) return;
    const nextCount = Math.min(cartMaximum, cart.serverSlots + slotQuantity);
    if (nextCount === cart.serverSlots) {
      setMessage(`O carrinho já atingiu o limite de ${cartMaximum} vagas por compra.`);
      return;
    }
    setServerSlots(nextCount);
    setMessage(`${nextCount - cart.serverSlots} ${nextCount - cart.serverSlots === 1 ? "vaga extra adicionada" : "vagas extras adicionadas"} ao carrinho.`);
    setError("");
  }

  return (
    <>
    {showLoading && <SiteLoadingScreen detail="Conferindo sua conta e carregando os planos disponíveis." stage="SESSÃO · PLANOS · ACESSO" />}
    <main
      aria-hidden={showLoading}
      className={`relative z-10 mx-auto w-full max-w-7xl px-4 pb-24 pt-16 sm:px-6 sm:pt-20 lg:px-8 ${showLoading ? "invisible" : ""}`}
      aria-labelledby="plans-title"
    >
      <header className="mx-auto mb-8 max-w-6xl border-b-2 border-[#687b5a]/50 pb-5 sm:pb-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="grid size-12 shrink-0 place-items-center border-2 border-[#b5d58a]/45 bg-[#1b2c22] text-[#b9d59b] shadow-[inset_0_0_0_3px_rgba(10,18,12,0.7),0_4px_0_#080d09] sm:size-14">
            <TbBlocks aria-hidden="true" className="size-6 sm:size-7" />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a6cf74] sm:text-xs">
              PluginsX <span className="text-white/30">/</span> Loja de licenças
            </p>
            <h1
              id="plans-title"
              className="font-minecraft-text text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl"
            >
              Escolha seu acesso
            </h1>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden border border-[#718667]/35 bg-[#101811] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b9d59b] xl:block">
              {catalog?.trialEnabled
                ? "Trial: 1 · Creeper: 3 · Ender: 5 · Aether: 250 servidores"
                : "Creeper: 3 · Ender: 5 · Aether: 250 servidores"}
            </span>
            <Link
              href="/cart"
              aria-label={`Abrir carrinho, ${cartItemCount} ${cartItemCount === 1 ? "item" : "itens"}`}
              className="font-minecraft-text inline-flex min-h-11 items-center gap-2 border-2 border-[#718667]/45 bg-[#101811] px-3 text-xs font-bold text-[#e5f2d8] transition hover:border-[#a6cf74]/70 hover:bg-[#19251b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8]"
            >
              <TbShoppingCart aria-hidden="true" className="size-4 text-[#b9d59b]" />
              Carrinho
              <span className="grid size-5 place-items-center bg-[#6b9f45] px-1 text-[10px] text-white">{cartItemCount}</span>
            </Link>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/65 sm:ml-16">
          {catalog?.trialEnabled && "O Trial libera 1 servidor por 12 horas. "}O Creeper custa R$ 11,90 por mês e permite 3 servidores. O Ender Dragon custa R$ 59,90 uma vez e permite 5. O Aether custa R$ 699,90 uma vez e inclui 250 servidores.
        </p>
        <div aria-hidden="true" className="mt-5 grid h-2 grid-cols-8 overflow-hidden">
          <span className="bg-[#709c4b]" />
          <span className="bg-[#8ab95d]" />
          <span className="bg-[#709c4b]" />
          <span className="bg-[#714c32]" />
          <span className="bg-[#8a5c39]" />
          <span className="bg-[#714c32]" />
          <span className="bg-[#111a16]" />
          <span className="bg-[#111a16]" />
        </div>
      </header>

      {isSessionReady && session && (
        <section
          aria-label="Estado da sua assinatura"
          className="mx-auto mb-5 flex max-w-6xl flex-col gap-3 border-l-4 border-[#a6cf74] bg-[#111a16]/95 px-4 py-3 shadow-[0_4px_0_#070b08] sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <div className="flex min-w-0 items-start gap-3">
            <TbPick aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#b9d59b]" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#91ac7c]">
                Seu acesso
              </p>
              <h2 className="mt-0.5 text-sm font-bold text-white sm:text-base">
                {accountTitle}
              </h2>
              <p className="mt-1 text-xs leading-5 text-white/55 sm:text-sm">
                {accessDescription}
              </p>
            </div>
          </div>
          {access?.canCancelSubscription && (
              <button
                type="button"
                onClick={() => void cancelRenewal()}
                disabled={busy === "cancel"}
                className="font-minecraft-text min-h-10 shrink-0 border border-white/15 bg-black/25 px-4 text-xs font-bold text-white/75 transition hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b9d59b] disabled:cursor-wait disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelando…" : "Cancelar renovação"}
              </button>
            )}
        </section>
      )}

      {returnStatus && (
        <output
          aria-live="polite"
          className="mx-auto mb-4 block w-full max-w-6xl border-l-4 border-[#e3bd59] bg-[#211b0e] px-4 py-3 text-sm leading-6 text-amber-100"
        >
          {returnStatus === "success"
            ? "Recebemos seu retorno do checkout. A ativação acontece quando o Mercado Pago confirmar o pagamento."
            : returnStatus === "pending"
              ? "Pagamento pendente. O acesso será liberado após a confirmação."
              : returnStatus === "failure"
                ? "O pagamento não foi concluído. Confira o estado consultado no servidor e tente novamente."
                : "Autorização da assinatura recebida. A primeira cobrança precisa ser confirmada para liberar o acesso."}
        </output>
      )}
      {message && (
        <output
          aria-live="polite"
          className="mx-auto mb-4 block w-full max-w-6xl border-l-4 border-[#8bc34a] bg-[#101a12] px-4 py-3 text-sm leading-6 text-[#d9f2bd]"
        >
          {message}
        </output>
      )}
      {error && (
        <div
          role="alert"
          className="mx-auto mb-4 block w-full max-w-6xl border-l-4 border-[#d66d68] bg-[#211211] px-4 py-3 text-sm leading-6 text-red-100"
        >
          {error}
        </div>
      )}

      {catalog?.trialEnabled && trialAlreadyUsed && !currentTemporaryLicense && (
        <output
          aria-live="polite"
          className="mx-auto mb-5 max-w-6xl border-l-4 border-[#e3bd59] bg-[#211b0e] px-4 py-3 text-sm leading-6 text-amber-100"
        >
          {trialWindowExpired
            ? "O período de 12 horas terminou. A key não é mais exibida nem pode ser gerada novamente."
            : access?.trialExpiresAt
              ? "O Trial já foi usado. A mesma key pode ser consultada novamente nesta página até completar 12 horas; depois, deixa de ser exibida."
              : "Este Trial foi emitido antes da recuperação automática da key. Ela não está disponível para consulta e não pode ser gerada novamente."}
        </output>
      )}

      {currentTemporaryLicense && !temporaryLicenseExpired && (
        <section
          aria-label="Sua licença temporária"
          aria-live="off"
          className="mx-auto mb-6 max-w-6xl border-2 border-[#9b8a56]/70 bg-[#111a16] text-white shadow-[0_6px_0_#070b08]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#8ca878]/20 bg-[#19251b] px-4 py-3">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#cbe3a9]">
              <TbCheck aria-hidden="true" className="size-4" />
              Item obtido · key temporária
            </span>
            <span
              role="timer"
              aria-label={trialSecondsRemaining === null ? "Calculando tempo restante" : `Tempo restante ${formatTrialCountdown(trialSecondsRemaining)}`}
              className="border border-[#e3bd59]/30 bg-[#e3bd59]/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#f3dc96]"
            >
              {trialSecondsRemaining === null ? "Calculando…" : `Restam ${formatTrialCountdown(trialSecondsRemaining)}`}
            </span>
          </div>
          <div className="p-4 sm:p-5">
            <p className="font-minecraft-text text-lg font-bold text-white">
              Sua key está pronta
            </p>
            <p className="mt-1 text-xs leading-5 text-white/55 sm:text-sm">
              {`Expira em ${new Date(currentTemporaryLicense.expiresAt).toLocaleString("pt-BR")}. Você pode consultar esta mesma key nesta página durante a validade.`}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
              <code className="flex min-h-12 min-w-0 select-all items-center break-all border-2 border-[#64725b]/40 bg-[#080d0a] px-3 py-3 font-mono text-sm text-[#d9f2bd] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.025)]">
                {currentTemporaryLicense.code}
              </code>
              <button
                type="button"
                onClick={() => void copyTemporaryLicense()}
                className="font-minecraft-text inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-4 text-xs font-bold text-[#f7ffe9] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
              >
                {temporaryLicenseCopied ? (
                  <TbCheck aria-hidden="true" className="size-4" />
                ) : (
                  <TbCopy aria-hidden="true" className="size-4" />
                )}
                {temporaryLicenseCopied ? "Copiada" : "Copiar key"}
              </button>
            </div>
          </div>
        </section>
      )}

      {activePaid && safeReturnTo && safeReturnTo !== "/plans" && (
        <div className="mx-auto mb-5 flex max-w-6xl justify-center sm:justify-end">
          <Link
            href={safeReturnTo}
            className="font-minecraft-text inline-flex min-h-11 items-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-5 text-sm font-bold text-[#f7ffe9] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <TbPick aria-hidden="true" className="size-4" />
            Continuar para gerar sua key
          </Link>
        </div>
      )}

      <section aria-labelledby="inventory-title" className="mx-auto max-w-6xl">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#91b56b]">
              <TbBlocks aria-hidden="true" className="size-4" /> Bancada PluginsX
            </p>
            <h2
              id="inventory-title"
              className="font-minecraft-text text-xl font-bold text-white sm:text-2xl"
            >
              Inventário de licenças
            </h2>
          </div>
          <span className="border border-white/10 bg-[#0c130f] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">
            {planChoices.length} {planChoices.length === 1 ? "item" : "itens"} disponíveis
          </span>
        </div>

        <div className="overflow-hidden border-2 border-[#718667]/45 bg-[#111a16] text-[#eff5df] shadow-[0_8px_0_#070b08,0_24px_70px_-40px_rgba(35,77,45,0.75)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#8ca878]/25 bg-[#19251b] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b9d59b]">
              Selecione um slot para inspecionar
            </p>
            <p className="font-minecraft-text text-[10px] text-[#8fa184]">
              {String(selectedPlanIndex).padStart(2, "0")} / {String(planChoices.length).padStart(2, "0")}
            </p>
          </div>

          <div className="p-3 sm:p-5">
            <fieldset
              aria-label="Escolha uma licença"
              className={`grid gap-2 sm:gap-3 ${catalog?.trialEnabled ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}
            >
              {planChoices.map((plan, index) => {
                const details = planDetails[plan];
                const price =
                  plan === "free"
                    ? "Grátis"
                    : catalog?.plans.find((item) => item.id === plan)?.formattedPrice ?? "Carregando…";
                const selected = visibleSelectedPlan === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Selecionar ${details.name}, ${price}`}
                    onClick={() => setSelectedPlan(plan)}
                    className={
                      "group relative flex min-h-36 flex-col items-center justify-center border-2 px-2 pb-3 pt-5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e3bd59] sm:min-h-44 sm:px-4 " +
                      (selected
                        ? "border-[#e3bd59] bg-[#243022] shadow-[inset_0_0_0_3px_#111a16,0_4px_0_#080d09]"
                        : "border-[#65745e]/45 bg-[#0c130f] shadow-[inset_0_0_0_3px_#111a16,0_4px_0_#080d09] hover:border-[#a6cf74]/60 hover:bg-[#141e17]")
                    }
                  >
                    <span className="absolute left-2 top-2 text-[8px] font-bold uppercase tracking-[0.13em] text-white/35 sm:left-3 sm:top-3 sm:text-[9px]">
                      SLOT {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="relative mt-3 size-16 shrink-0 sm:size-24">
                      <Image
                        src={details.image}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 64px, 96px"
                        className="object-contain mix-blend-screen transition-transform group-hover:scale-110"
                      />
                    </div>
                    <span className="mt-1 max-w-full text-[10px] font-bold leading-4 text-white sm:text-xs">
                      {details.name}
                    </span>
                    <span className="mt-1 text-[9px] font-semibold text-[#b9d59b] sm:text-[10px]">
                      {price}{plan === "monthly" ? " / mês" : ""}
                    </span>
                  </button>
                );
              })}
            </fieldset>

            <div className="mt-3 grid overflow-hidden border border-[#718667]/30 bg-[#0b110e] lg:grid-cols-[0.92fr_1.08fr]">
              <div
                className={
                  "relative flex min-h-64 flex-col justify-between overflow-hidden border-b border-[#718667]/30 bg-[#0c130f] p-4 sm:min-h-80 sm:p-5 lg:border-b-0 lg:border-r " +
                  (visibleSelectedPlan === "lifetime" ? "lg:border-r-[#8b5cf6]/40" : visibleSelectedPlan === "aether" ? "lg:border-r-[#a6cf74]/40" : "")
                }
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-25 bg-[linear-gradient(45deg,rgba(255,255,255,0.055)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.055)_75%)] bg-size-[18px_18px]"
                />
                <div className="relative flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#9aaf91] sm:text-[10px]">
                  <span>{selectedProduct.realm}</span>
                  <span>ITEM {String(selectedPlanIndex).padStart(2, "0")}</span>
                </div>
                <div className="relative mx-auto my-4 aspect-[3/2] w-full max-w-[34rem]">
                  <Image
                    src={selectedProduct.image}
                    alt={selectedProduct.imageAlt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-contain mix-blend-screen"
                  />
                </div>
                <div className="relative flex items-center justify-between border-t border-white/10 pt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/40 sm:text-[10px]">
                  <span>Item selecionado</span>
                  <span className="flex items-center gap-2 text-[#b9d59b]">
                    <span className="size-2 bg-[#8bc34a] shadow-[0_0_10px_#8bc34a]" />
                    Pronto para equipar
                  </span>
                </div>
              </div>

              <div className="flex min-w-0 flex-col p-4 sm:p-6 lg:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a6cf74]">
                      Detalhes do item
                    </p>
                    <h3 className="font-minecraft-text mt-2 text-xl font-bold leading-7 text-white sm:text-2xl">
                      {selectedProduct.name}
                    </h3>
                  </div>
                  {selectedPlanIsCurrent && (
                    <span className="border border-[#8bc34a]/30 bg-[#8bc34a]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-[#c9e9a8]">
                      Equipado
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  {selectedProduct.description}
                </p>

                <div className="my-5 flex flex-wrap items-end justify-between gap-3 border-y border-[#718667]/30 py-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                      Valor do item
                    </p>
                    <p className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                      {selectedPrice}
                    </p>
                  </div>
                  <p className="pb-1 text-right text-xs leading-5 text-white/45">
                    {visibleSelectedPlan === "free"
                      ? "12 horas · sem cobrança"
                      : visibleSelectedPlan === "monthly"
                        ? "Cobrança recorrente mensal"
                        : "Pagamento único · sem renovação"}
                  </p>
                </div>

                <ul className="grid gap-2.5 text-xs leading-5 text-white/75 sm:text-sm">
                  {perks[visibleSelectedPlan].map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5">
                      <TbCheck
                        aria-hidden="true"
                        className={`mt-0.5 size-4 shrink-0 ${visibleSelectedPlan === "lifetime" ? "text-[#c8aaff]" : "text-[#a6cf74]"}`}
                      />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-6">
                  {selectedPlanIsCurrent ? (
                    <p className="flex min-h-12 items-center justify-center gap-2 border-2 border-[#8bc34a]/30 bg-[#18251a] px-4 text-center text-sm font-semibold text-[#d4efbc]">
                      <TbCheck aria-hidden="true" className="size-4" />
                      Este item já está equipado
                    </p>
                  ) : visibleSelectedPlan === "free" ? (
                    <button
                      type="button"
                      onClick={() =>
                        session
                          ? void startTrial()
                          : window.location.assign(
                              `/account?returnTo=${encodeURIComponent("/plans")}`,
                            )
                      }
                      disabled={
                        loading ||
                        trialAlreadyUsed ||
                        busy === "free" ||
                        activePaid ||
                        access?.status === "pending"
                      }
                      className="font-minecraft-text inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-4 text-sm font-bold text-[#f7ffe9] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-[#344035] disabled:bg-[#343d34] disabled:text-[#8f9b89]"
                    >
                      <TbPick aria-hidden="true" className="size-5" />
                      {trialActionLabel}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => visibleSelectedPlan === "monthly" ? void checkout("monthly") : addOneTimePlanToCart(visibleSelectedPlan)}
                      disabled={
                        !catalog ||
                        Boolean(activePaid) ||
                        Boolean(subscriptionBlocked) ||
                        busy === visibleSelectedPlan ||
                        (visibleSelectedPlan !== "monthly" && cart.plan === visibleSelectedPlan)
                      }
                      className={
                        "font-minecraft-text inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 px-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-[#344035] disabled:bg-[#343d34] disabled:text-[#8f9b89] " +
                        (visibleSelectedPlan === "lifetime"
                          ? "border-[#581c87] bg-[#6d28d9] text-white hover:bg-[#7c3aed]"
                          : visibleSelectedPlan === "aether"
                            ? "border-[#345d2f] bg-[#5e9b43] text-[#f7ffe9] hover:bg-[#6eaa4d]"
                            : "border-[#345d2f] bg-[#5e9b43] text-[#f7ffe9] hover:bg-[#6eaa4d]")
                      }
                    >
                      {visibleSelectedPlan === "monthly" ? <TbPick aria-hidden="true" className="size-5" /> : <TbShoppingCart aria-hidden="true" className="size-5" />}
                      {visibleSelectedPlan === "monthly"
                        ? checkoutActionLabel
                        : cart.plan === visibleSelectedPlan
                          ? `${selectedProduct.name} no carrinho`
                          : "Adicionar ao carrinho"}
                    </button>
                  )}
                  <p className="mt-2 text-center text-[10px] leading-5 text-white/40">
                    {visibleSelectedPlan === "free"
                      ? "1 servidor · key temporária sem vínculo à conta, válida por 12 horas."
                      : `${visibleSelectedPlan === "aether" ? 250 : visibleSelectedPlan === "lifetime" ? 5 : 3} servidores por licença · gerencie as autorizações pela sua conta.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="extra-slots-title" className="mx-auto mt-6 grid max-w-6xl overflow-hidden border-2 border-[#718667]/40 bg-[#111a16] shadow-[0_6px_0_#070b08] md:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="p-4 sm:p-6">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#91b56b]">Expansão de capacidade</p>
          <h2 id="extra-slots-title" className="font-minecraft-text mt-2 text-xl font-bold text-white sm:text-2xl">Precisa de mais servidores?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Ender Dragon inclui 5 servidores e Aether inclui 250. Se precisar ampliar qualquer plano pago, adicione vagas extras de uma em uma pelo carrinho.</p>
          <p className="mt-3 text-xs font-semibold text-[#c9e9a8]">Cada vaga extra: {slotPriceLabel} · compra única</p>
          {state?.additionalServerSlots ? (
            <p className="mt-2 text-[10px] text-white/45">Sua conta já tem {state.additionalServerSlots} {state.additionalServerSlots === 1 ? "vaga extra aprovada" : "vagas extras aprovadas"}.</p>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-3 border-t border-[#718667]/25 bg-[#0c130f] p-4 sm:p-5 md:border-l md:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/45">Quantidade</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Diminuir quantidade de vagas" disabled={slotQuantity <= 1} onClick={() => setSlotQuantity((quantity) => Math.max(1, quantity - 1))} className="grid size-9 place-items-center border border-white/15 text-white/70 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><TbMinus aria-hidden="true" className="size-4" /></button>
              <span aria-live="polite" className="min-w-8 text-center font-minecraft-text text-base font-bold text-white">{slotQuantity}</span>
              <button type="button" aria-label="Aumentar quantidade de vagas" disabled={slotQuantity >= cartMaximum} onClick={() => setSlotQuantity((quantity) => Math.min(cartMaximum, quantity + 1))} className="grid size-9 place-items-center border border-[#a6cf74]/35 text-[#c9e9a8] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><TbPlus aria-hidden="true" className="size-4" /></button>
            </div>
          </div>
          <p className="text-right text-[10px] text-white/40">Subtotal: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(slotQuantity * slotPrice)}</p>
          <button type="button" onClick={addSlotsToCart} disabled={!canBuyExtraSlots || slotQuantity > cartMaximum - cart.serverSlots} className="font-minecraft-text inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-3 text-xs font-bold text-[#f7ffe9] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-[#344035] disabled:bg-[#343d34] disabled:text-[#8f9b89]">
            <TbShoppingCart aria-hidden="true" className="size-4" />
            Adicionar ao carrinho
          </button>
          <p className="text-center text-[10px] leading-4 text-white/40">{canBuyExtraSlots ? `Até ${cartMaximum} vagas em cada compra.` : "Adicione Ender Dragon ou Aether ao carrinho, ou ative um plano pago, para liberar vagas extras."}</p>
        </div>
      </section>

      {isSessionReady && !session && (
        <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-white/60">
          Entre na sua conta para gerar uma key temporária ou concluir a compra.{" "}
          <Link
            className="font-semibold text-[#c9e9a8] underline decoration-[#a6cf74]/50 underline-offset-4 hover:text-white"
            href="/account?returnTo=%2Fplans"
          >
            Acessar conta
          </Link>
        </p>
      )}

      <section aria-labelledby="license-how-title" className="mx-auto mt-8 max-w-6xl border-2 border-[#718667]/35 bg-[#111a16] shadow-[0_5px_0_#070b08]">
        <div className="border-b border-[#718667]/30 bg-[#19251b] px-4 py-3 sm:px-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#91b56b]">Antes de instalar</p>
          <h2 id="license-how-title" className="font-minecraft-text mt-1 text-base font-bold text-white sm:text-lg">Como a licença funciona</h2>
        </div>
        <div className="grid divide-y divide-[#718667]/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <article className="p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#c9e9a8]">Liberação</h3>
            <p className="mt-2 text-xs leading-5 text-white/60">Após a confirmação do pagamento, gere sua key Plus na página da conta. Voltar do checkout, sozinho, não ativa o acesso.</p>
          </article>
          <article className="p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#c9e9a8]">Aprovação do servidor</h3>
            <p className="mt-2 text-xs leading-5 text-white/60">Cada instalação solicita autorização. Aprove o pedido na página da conta; solicitações pendentes expiram em 12 minutos.</p>
          </article>
          <article className="p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#c9e9a8]">Vagas de servidor</h3>
            <p className="mt-2 text-xs leading-5 text-white/60">Trial: 1 servidor · Creeper: 3 · Ender Dragon: 5 · Aether: 250. Planos pagos podem receber vagas extras por R$ 4,90 cada. Remova um servidor na sua conta para liberar a vaga e usar outra instalação.</p>
          </article>
        </div>
      </section>
    </main>
    </>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TbBlocks,
  TbCheck,
  TbChevronRight,
  TbCopy,
  TbMinus,
  TbPick,
  TbPlus,
  TbShoppingCart,
} from "react-icons/tb";
import { useCart } from "@/components/cart/CartProvider";
import { usePurchaseJourney } from "@/components/cart/PurchaseJourneyProvider";
import { PurchaseProgress } from "@/components/cart/PurchaseProgress";
import {
  type OfferDetails,
  PlanPromotion,
} from "@/components/ui/PlanPromotion";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { useHydrated } from "@/hooks/useHydrated";
import { useLoadingDelay } from "@/hooks/useLoadingDelay";
import { authClient } from "@/lib/auth-client";
import { formatBillingInterval } from "@/lib/commercial-display";
import {
  type PurchaseProgressData,
  purchaseUpdatedEvent,
} from "@/lib/purchase-progress";

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
  lastPurchase: PurchaseProgressData | null;
  additionalServerSlots?: number;
  upgrade?: { creditCents: number; endsAt: string | null; eligible: boolean };
};
type PlanCatalog = {
  trialEnabled: boolean;
  plans: OfferDetails[];
  serverSlot?: {
    amount: number;
    formattedPrice: string;
    maxPerPurchase: number;
  };
};
type CouponQuote = {
  code: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  eligibleAmount: number;
  monthlyRecurring: boolean;
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
    "Licença temporária independente do plano pago",
    "Validade definida no momento da ativação",
    "Consulte novamente a mesma key nesta página enquanto o acesso estiver ativo",
    "Disponível uma única vez por conta",
    "A key deixa de funcionar quando o acesso termina",
  ],
  monthly: [
    "Acesso Premium/Plus",
    "Recorrência definida no momento da contratação",
    "Seu limite contratado permanece registrado na licença",
    "Cancele a renovação e mantenha o período pago",
  ],
  lifetime: [
    "Acesso vitalício Premium/Plus",
    "Pagamento único",
    "A licença acompanha o crescimento da sua rede",
    "Sem renovação mensal",
  ],
  aether: [
    "Acesso vitalício Premium/Plus",
    "Pagamento único",
    "Capacidade para redes com várias instalações",
    "Vagas extras disponíveis no carrinho",
  ],
};

const planDetails: Record<
  PlanId,
  {
    name: string;
    realm: string;
    description: string;
    image: string;
    imageAlt: string;
  }
> = {
  free: {
    name: "Trial Key",
    realm: "ITEM DE TESTE · OVERWORLD",
    description:
      "Explore os recursos Plus em um servidor real antes de escolher o plano da sua rede.",
    image: "/images/plans/license_icon_free_tier.png",
    imageAlt: "Ícone voxel do plano Trial",
  },
  monthly: {
    name: "Creeper",
    realm: "OVERWORLD · CREEPER",
    description:
      "Para comunidades em crescimento que querem Premium sem assumir um compromisso permanente.",
    image: "/images/plans/license_icon_creeper.png",
    imageAlt: "Ícone voxel do plano Creeper",
  },
  lifetime: {
    name: "Ender Dragon",
    realm: "THE END · ENDER DRAGON",
    description:
      "Ideal para projetos estáveis: mantenha os recursos Premium ativos sem acompanhar renovações.",
    image: "/images/plans/license_icon_ender_dragon.png",
    imageAlt: "Ícone voxel do plano Ender Dragon",
  },
  aether: {
    name: "Aether",
    realm: "CÉU · AETHER",
    description:
      "Para operações em escala: concentre a gestão de uma rede ampla e amplie a capacidade quando precisar.",
    image: "/images/plans/license_icon_aether.png",
    imageAlt: "Ícone voxel do plano Aether",
  },
};

export function PlansPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const hasHydrated = useHydrated();
  const { prepareCheckout, beginCheckout } = usePurchaseJourney();
  const isSessionReady = hasHydrated && !sessionPending;
  const {
    cart,
    ready: cartReady,
    itemCount: cartItemCount,
    setPlan,
    setServerSlots,
    setCouponCode,
  } = useCart();
  const [billingState, setState] = useState<BillingState>();
  const [billingOwner, setBillingOwner] = useState<string>();
  const billingRequest = useRef<AbortController | null>(null);
  const [catalog, setCatalog] = useState<PlanCatalog>();
  const [slotQuantity, setSlotQuantity] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("monthly");
  const [loading, setLoading] = useState(true);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [couponQuote, setCouponQuote] = useState<CouponQuote | null>(null);
  const [couponValidatedCode, setCouponValidatedCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [temporaryLicense, setTemporaryLicense] = useState<{
    code: string;
    expiresAt: string;
    accountId: string;
  } | null>(null);
  const [temporaryLicenseLoadedFor, setTemporaryLicenseLoadedFor] = useState<
    string | null
  >(null);
  const [temporaryLicenseExpired, setTemporaryLicenseExpired] = useState(false);
  const [temporaryLicenseCopied, setTemporaryLicenseCopied] = useState(false);
  const [trialSecondsRemaining, setTrialSecondsRemaining] = useState<
    number | null
  >(null);
  const temporaryLicenseScope = session?.user.id ?? "guest";
  const sessionUserId = session?.user.id;
  const sessionScope = useRef(sessionUserId);
  useEffect(() => {
    sessionScope.current = sessionUserId;
  }, [sessionUserId]);
  const state = billingOwner === sessionUserId ? billingState : undefined;
  const temporaryLicenseReady =
    isSessionReady && temporaryLicenseLoadedFor === temporaryLicenseScope;
  const currentTemporaryLicense =
    session && temporaryLicense?.accountId === session.user.id
      ? temporaryLicense
      : null;

  const refresh = useCallback(async () => {
    if (sessionScope.current !== sessionUserId) return;
    billingRequest.current?.abort();
    if (!sessionUserId) {
      setState(undefined);
      setBillingOwner(undefined);
      setLoading(false);
      setInitialStateLoaded(true);
      return;
    }
    const controller = new AbortController();
    billingRequest.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/billing/state", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const nextState = (await response.json()) as BillingState;
      if (controller.signal.aborted || sessionScope.current !== sessionUserId)
        return;
      setState(nextState);
      setBillingOwner(sessionUserId);
      const accountId = sessionUserId;
      if (
        nextState.temporaryLicense &&
        Date.parse(nextState.temporaryLicense.expiresAt) > Date.now()
      ) {
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
      } else if (
        nextState.access?.trialExpiresAt &&
        Date.parse(nextState.access.trialExpiresAt) <= Date.now()
      ) {
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
      if (controller.signal.aborted) return;
      setError("Não foi possível consultar seus planos. Tente novamente.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setInitialStateLoaded(true);
      }
    }
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionPending) void refresh();
    return () => billingRequest.current?.abort();
  }, [refresh, sessionPending]);

  useEffect(() => {
    const currentPlan = state?.access?.plan;
    if (
      currentPlan === "monthly" ||
      currentPlan === "lifetime" ||
      currentPlan === "aether"
    ) {
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
    setReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  }, []);

  useEffect(() => {
    const update = () => void refresh();
    window.addEventListener(purchaseUpdatedEvent, update);
    return () => window.removeEventListener(purchaseUpdatedEvent, update);
  }, [refresh]);

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
      setTrialSecondsRemaining(
        Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
      );
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    const timeout = window.setTimeout(
      () => {
        try {
          window.localStorage.removeItem(
            temporaryTrialStorageKey(currentTemporaryLicense.accountId),
          );
        } catch {
          // The API will no longer return this code after its expiration.
        }
        setTemporaryLicense((current) =>
          current?.accountId === currentTemporaryLicense.accountId
            ? null
            : current,
        );
        setTemporaryLicenseExpired(true);
      },
      Math.max(0, expiresAt - Date.now()),
    );
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
      if (
        typeof result.code !== "string" ||
        typeof result.expiresAt !== "string"
      )
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
          JSON.stringify({
            code: issuedLicense.code,
            expiresAt: issuedLicense.expiresAt,
          }),
        );
      } catch {
        setMessage(
          "Copie a key antes de sair: o navegador não permitiu guardá-la para a próxima visita.",
        );
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
      setError(
        "Não foi possível copiar automaticamente. Selecione e copie a key exibida.",
      );
    }
  }

  async function checkout(plan: "monthly") {
    if (!session) {
      window.location.assign(
        `/account?returnTo=${encodeURIComponent("/plans")}`,
      );
      return;
    }
    if (
      cart.couponCode &&
      (couponValidatedCode !== cart.couponCode || !couponQuote)
    ) {
      setError(
        "Aplique novamente o cupom para conferir o valor desta assinatura.",
      );
      return;
    }
    setBusy(plan);
    setError("");
    setMessage("");
    const paymentWindow = prepareCheckout();
    try {
      const response = await fetch("/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          expectedTotalCents: Math.round(
            (couponValidatedCode === cart.couponCode && couponQuote
              ? couponQuote.total
              : (catalog?.plans.find((p) => p.id === plan)?.amount ?? 0)) * 100,
          ),
          ...(cart.couponCode ? { couponCode: cart.couponCode } : {}),
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
      beginCheckout(
        result.purchaseReference,
        result.checkoutUrl,
        paymentWindow,
      );
      setBusy("");
    } catch (e) {
      paymentWindow?.close();
      await refresh();
      setError(
        e instanceof Error ? e.message : "Não foi possível iniciar o checkout.",
      );
      setBusy("");
    }
  }

  async function validatePlanCoupon() {
    const code = cart.couponCode?.trim().toUpperCase() ?? "";
    if (!code) {
      setCouponMessage("Digite o código do cupom.");
      setCouponQuote(null);
      setCouponValidatedCode("");
      return;
    }
    if (visibleSelectedPlan === "free") {
      setCouponMessage("O Trial é gratuito e não aceita cupons.");
      return;
    }
    if (visibleSelectedPlan !== "monthly") {
      setCouponMessage(
        "Para Ender Dragon, Aether e vagas extras, aplique o cupom no carrinho.",
      );
      return;
    }
    if (!session) {
      setCouponMessage("Entre na sua conta para validar este cupom.");
      return;
    }
    setCouponBusy(true);
    setCouponMessage("");
    setCouponQuote(null);
    try {
      const response = await fetch("/billing/coupon/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          serverSlots: 0,
          couponCode: code,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Cupom indisponível.");
      setCouponCode(code);
      setCouponQuote(result as CouponQuote);
      setCouponValidatedCode(code);
      setCouponMessage(
        (result as CouponQuote).monthlyRecurring
          ? "Aplicado também às próximas cobranças do Creeper."
          : "Cupom aplicado à primeira cobrança.",
      );
    } catch (couponError) {
      setCouponCode(code);
      setCouponValidatedCode("");
      setCouponMessage(
        couponError instanceof Error
          ? couponError.message
          : "Não foi possível validar o cupom.",
      );
    } finally {
      setCouponBusy(false);
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
  const trialAlreadyUsed = Boolean(
    access?.trialUsedAt || currentTemporaryLicense,
  );
  const trialWindowExpired =
    temporaryLicenseExpired ||
    Boolean(
      access?.trialExpiresAt && Date.parse(access.trialExpiresAt) <= Date.now(),
    );
  const activePaid = Boolean(
    access &&
      access.status === "active" &&
      (access.plan === "lifetime" ||
        access.plan === "aether" ||
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
  const planChoices: PlanId[] = catalog
    ? catalog.plans.map((plan) => plan.id as PlanId)
    : ["monthly", "lifetime", "aether"];
  const visibleSelectedPlan = planChoices.includes(selectedPlan)
    ? selectedPlan
    : (planChoices[0] ?? "monthly");
  const selectedOffer = catalog?.plans.find(
    (plan) => plan.id === visibleSelectedPlan,
  );
  const billingInterval = selectedOffer
    ? formatBillingInterval(selectedOffer)
    : null;
  const selectedProduct = {
    ...planDetails[visibleSelectedPlan],
    name: selectedOffer?.name ?? planDetails[visibleSelectedPlan].name,
  };
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
                  : (access?.status ?? "");
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
          : access?.plan === "monthly" &&
              visibleSelectedPlan !== "monthly" &&
              visibleSelectedPlan !== "free"
            ? "Fazer upgrade para vitalício"
            : access?.status === "pending"
              ? "Aguardando confirmação"
              : access?.status === "past_due"
                ? "Regularize sua assinatura"
                : activePaid
                  ? "Você já tem acesso ativo"
                  : visibleSelectedPlan === "monthly"
                    ? `Assinar ${selectedProduct.name}`
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
    if ((activePaid && access?.plan !== "monthly") || subscriptionBlocked)
      return;
    setPlan(plan);
    setMessage(
      `${plan === "aether" ? "Aether" : "Ender Dragon"} adicionado ao carrinho.`,
    );
    setError("");
  }

  function addSlotsToCart() {
    if (!canBuyExtraSlots) return;
    const nextCount = Math.min(cartMaximum, cart.serverSlots + slotQuantity);
    if (nextCount === cart.serverSlots) {
      setMessage(
        `O carrinho já atingiu o limite de ${cartMaximum} vagas por compra.`,
      );
      return;
    }
    setServerSlots(nextCount);
    setMessage(
      `${nextCount - cart.serverSlots} ${nextCount - cart.serverSlots === 1 ? "vaga extra adicionada" : "vagas extras adicionadas"} ao carrinho.`,
    );
    setError("");
  }

  return (
    <>
      {showLoading && (
        <SiteLoadingScreen
          detail="Conferindo sua conta e carregando os planos disponíveis."
          stage="SESSÃO · PLANOS · ACESSO"
        />
      )}
      <main
        aria-hidden={showLoading}
        className={`relative z-10 mx-auto w-full max-w-7xl px-4 pb-24 pt-16 sm:px-6 sm:pt-20 lg:px-8 ${showLoading ? "invisible" : ""}`}
        aria-labelledby="plans-title"
      >
        <header className="mx-auto mb-8 max-w-6xl border-b-2 border-outline/50 pb-5 sm:pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="grid size-12 shrink-0 place-items-center border-2 border-outline-strong/45 bg-surface-raised text-accent-soft shadow-[inset_0_0_0_3px_color-mix(in_srgb,var(--site-background)_70%,transparent),0_4px_0_var(--site-shadow)] sm:size-14">
              <TbBlocks aria-hidden="true" className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-accent sm:text-xs">
                PluginsX <span className="text-white/30">/</span> Loja de
                licenças
              </p>
              <h1
                id="plans-title"
                className="font-minecraft-text text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl"
              >
                Escolha seu acesso
              </h1>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="hidden border border-outline/35 bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-soft xl:block">
                PLANOS PARA CADA FASE DA SUA REDE
              </span>
              <Link
                href="/cart"
                aria-label={`Abrir carrinho, ${cartItemCount} ${cartItemCount === 1 ? "item" : "itens"}`}
                className="font-minecraft-text inline-flex min-h-11 items-center gap-2 border-2 border-outline/45 bg-surface px-3 text-xs font-bold text-accent-soft transition hover:border-outline-strong/70 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
              >
                <TbShoppingCart
                  aria-hidden="true"
                  className="size-4 text-accent-soft"
                />
                Carrinho
                <span className="grid size-5 place-items-center bg-accent-strong px-1 text-[10px] text-white">
                  {cartItemCount}
                </span>
              </Link>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/65 sm:ml-16">
            Encontre o ritmo que combina com sua rede: teste os recursos Plus,
            avance com uma assinatura flexível ou escolha acesso permanente para
            seus projetos. Precisa escalar? As vagas extras acompanham seu
            crescimento.
          </p>
          <div
            aria-hidden="true"
            className="mt-5 grid h-2 grid-cols-8 overflow-hidden"
          >
            <span className="bg-accent-strong" />
            <span className="bg-accent" />
            <span className="bg-accent-strong" />
            <span className="bg-[#714c32]" />
            <span className="bg-[#8a5c39]" />
            <span className="bg-[#714c32]" />
            <span className="bg-surface" />
            <span className="bg-surface" />
          </div>
        </header>

        <div className="mx-auto max-w-6xl">
          <PurchaseProgress />
        </div>

        {isSessionReady && session && (
          <section
            aria-label="Estado da sua assinatura"
            className="mx-auto mb-5 grid max-w-6xl gap-4 border-l-4 border-outline-strong bg-surface/95 px-4 py-3 shadow-[0_4px_0_var(--site-shadow)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <TbPick
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-accent-soft"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
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
            <div className="flex items-center justify-start sm:justify-end">
              {access?.canCancelSubscription ? (
                <button
                  type="button"
                  onClick={() => void cancelRenewal()}
                  disabled={busy === "cancel"}
                  className="font-minecraft-text min-h-10 shrink-0 border border-white/15 bg-black/25 px-4 text-xs font-bold text-white/75 transition hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:cursor-wait disabled:opacity-50"
                >
                  {busy === "cancel" ? "Cancelando…" : "Cancelar renovação"}
                </button>
              ) : activePaid ? (
                <Link
                  href="/account"
                  className="font-minecraft-text inline-flex min-h-10 shrink-0 items-center gap-2 border border-outline-strong/35 bg-accent/[0.07] px-4 text-xs font-bold text-accent-soft transition hover:border-outline-strong/70 hover:bg-accent/[0.13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
                >
                  Gerenciar acesso{" "}
                  <TbChevronRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </div>
          </section>
        )}

        {message && (
          <output
            aria-live="polite"
            className="mx-auto mb-4 block w-full max-w-6xl border-l-4 border-outline-strong bg-surface px-4 py-3 text-sm leading-6 text-accent-soft"
          >
            {message}
          </output>
        )}
        {error && (
          <div
            role="alert"
            className="mx-auto mb-4 block w-full max-w-6xl border-l-4 border-[#d66d68] bg-danger-surface px-4 py-3 text-sm leading-6 text-red-100"
          >
            {error}
          </div>
        )}

        {catalog?.trialEnabled &&
          !loading &&
          trialAlreadyUsed &&
          !currentTemporaryLicense &&
          !activePaid && (
            <output
              aria-live="polite"
              className="mx-auto mb-5 max-w-6xl border-l-4 border-[#e3bd59] bg-warning-surface px-4 py-3 text-sm leading-6 text-amber-100"
            >
              {trialWindowExpired
                ? "O período do Trial terminou. A key não é mais exibida nem pode ser gerada novamente."
                : access?.trialExpiresAt
                  ? "O Trial já foi usado. A mesma key pode ser consultada enquanto estiver válida; depois, deixa de ser exibida."
                  : "Este Trial foi emitido antes da recuperação automática da key. Ela não está disponível para consulta e não pode ser gerada novamente."}
            </output>
          )}

        {currentTemporaryLicense && !temporaryLicenseExpired && (
          <section
            aria-label="Sua licença temporária"
            aria-live="off"
            className="mx-auto mb-6 max-w-6xl border-2 border-[#9b8a56]/70 bg-surface text-white shadow-[0_6px_0_var(--site-shadow)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline/20 bg-surface-raised px-4 py-3">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-soft">
                <TbCheck aria-hidden="true" className="size-4" />
                Item obtido · key temporária
              </span>
              <span
                role="timer"
                aria-label={
                  trialSecondsRemaining === null
                    ? "Calculando tempo restante"
                    : `Tempo restante ${formatTrialCountdown(trialSecondsRemaining)}`
                }
                className="border border-[#e3bd59]/30 bg-[#e3bd59]/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#f3dc96]"
              >
                {trialSecondsRemaining === null
                  ? "Calculando…"
                  : `Restam ${formatTrialCountdown(trialSecondsRemaining)}`}
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
                <code className="flex min-h-12 min-w-0 select-all items-center break-all border-2 border-outline/40 bg-canvas px-3 py-3 font-mono text-sm text-accent-soft shadow-[inset_0_0_0_2px_rgba(255,255,255,0.025)]">
                  {currentTemporaryLicense.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyTemporaryLicense()}
                  className="font-minecraft-text inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-on-strong transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
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
              className="font-minecraft-text inline-flex min-h-11 items-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-5 text-sm font-bold text-on-strong transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <TbPick aria-hidden="true" className="size-4" />
              Continuar para gerar sua key
            </Link>
          </div>
        )}

        <section
          aria-labelledby="inventory-title"
          className="mx-auto max-w-6xl"
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                <TbBlocks aria-hidden="true" className="size-4" /> Bancada
                PluginsX
              </p>
              <h2
                id="inventory-title"
                className="font-minecraft-text text-xl font-bold text-white sm:text-2xl"
              >
                Inventário de licenças
              </h2>
            </div>
            <span className="border border-white/10 bg-surface-deep px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">
              {planChoices.length} {planChoices.length === 1 ? "item" : "itens"}{" "}
              disponíveis
            </span>
          </div>

          <div className="overflow-hidden border-2 border-outline/45 bg-surface text-foreground shadow-[0_8px_0_var(--site-shadow),0_24px_70px_-40px_color-mix(in_srgb,var(--site-accent-strong)_25%,transparent)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline/25 bg-surface-raised px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-soft">
                Selecione um slot para inspecionar
              </p>
              <p className="font-minecraft-text text-[10px] text-muted">
                {String(selectedPlanIndex).padStart(2, "0")} /{" "}
                {String(planChoices.length).padStart(2, "0")}
              </p>
            </div>

            <div className="p-3 sm:p-5">
              {catalog && planChoices.length === 0 && (
                <output className="mb-4 border border-outline p-4 text-sm text-muted">
                  Nenhum plano está disponível no catálogo neste momento. Seu
                  acesso contratado continua disponível na conta.
                </output>
              )}
              <fieldset
                aria-label="Escolha uma licença"
                className={`grid gap-2 sm:gap-3 ${catalog?.trialEnabled ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}
              >
                {planChoices.map((plan, index) => {
                  const details = {
                    ...planDetails[plan],
                    name:
                      catalog?.plans.find((item) => item.id === plan)?.name ??
                      planDetails[plan].name,
                  };
                  const price =
                    plan === "free"
                      ? "Grátis"
                      : (catalog?.plans.find((item) => item.id === plan)
                          ?.formattedPrice ?? "Carregando…");
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
                          ? "border-[#e3bd59] bg-surface-hover shadow-[inset_0_0_0_3px_var(--site-surface),0_4px_0_var(--site-shadow)]"
                          : "border-outline/45 bg-surface-deep shadow-[inset_0_0_0_3px_var(--site-surface),0_4px_0_var(--site-shadow)] hover:border-outline-strong/60 hover:bg-surface-hover")
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
                      <span className="mt-1 text-[9px] font-semibold text-accent-soft sm:text-[10px]">
                        {price}
                        {plan === "monthly" ? " / mês" : ""}
                      </span>
                    </button>
                  );
                })}
              </fieldset>

              <div className="mt-3 grid overflow-hidden border border-outline/30 bg-canvas lg:grid-cols-[0.92fr_1.08fr]">
                <div
                  className={
                    "relative flex min-h-64 flex-col justify-between overflow-hidden border-b border-outline/30 bg-surface-deep p-4 sm:min-h-80 sm:p-5 lg:border-b-0 lg:border-r " +
                    (visibleSelectedPlan === "lifetime"
                      ? "lg:border-r-[#8b5cf6]/40"
                      : visibleSelectedPlan === "aether"
                        ? "lg:border-r-outline-strong/40"
                        : "")
                  }
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-25 bg-[linear-gradient(45deg,rgba(255,255,255,0.055)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.055)_75%)] bg-size-[18px_18px]"
                  />
                  <div className="relative flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.16em] text-muted sm:text-[10px]">
                    <span>{selectedProduct.realm}</span>
                    <span>
                      ITEM {String(selectedPlanIndex).padStart(2, "0")}
                    </span>
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
                    <span className="flex items-center gap-2 text-accent-soft">
                      <span className="size-2 bg-accent shadow-[0_0_10px_var(--site-accent)]" />
                      Pronto para equipar
                    </span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col p-4 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                        Detalhes do item
                      </p>
                      <h3 className="font-minecraft-text mt-2 text-xl font-bold leading-7 text-white sm:text-2xl">
                        {selectedProduct.name}
                      </h3>
                    </div>
                    {selectedPlanIsCurrent && (
                      <span className="border border-outline-strong/30 bg-accent/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-accent-soft">
                        Equipado
                      </span>
                    )}
                  </div>
                  {access?.plan === "monthly" &&
                    ["lifetime", "aether"].includes(visibleSelectedPlan) && (
                      <p className="mt-3 border-l-2 border-outline-strong bg-surface-raised p-3 text-xs leading-5 text-accent-soft">
                        Upgrade mantém sua licença e seus servidores.{" "}
                        {state?.upgrade?.creditCents
                          ? `No primeiro mês, o carrinho desconta os ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(state.upgrade.creditCents / 100)} efetivamente pagos no mensal.`
                          : "Após o primeiro mês, aplica-se o preço integral do vitalício."}{" "}
                        A renovação mensal é encerrada ao confirmar o upgrade.
                      </p>
                    )}
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    {catalog?.plans.find(
                      (plan) => plan.id === visibleSelectedPlan,
                    )?.description || selectedProduct.description}
                  </p>

                  <div className="my-5 flex flex-wrap items-end justify-between gap-3 border-y border-outline/30 py-4">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                        Valor do item
                      </p>
                      <PlanPromotion
                        offer={catalog?.plans.find(
                          (plan) => plan.id === visibleSelectedPlan,
                        )}
                      />
                      <p className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
                        {visibleSelectedPlan === "monthly" &&
                        couponValidatedCode === cart.couponCode &&
                        couponQuote
                          ? new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(couponQuote.total)
                          : selectedPrice}
                      </p>
                      {visibleSelectedPlan === "monthly" &&
                        couponValidatedCode === cart.couponCode &&
                        couponQuote && (
                          <p className="mt-1 text-[10px] text-accent-soft">
                            {selectedPrice} −{" "}
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(couponQuote.discountAmount)}{" "}
                            com {couponQuote.code}
                          </p>
                        )}
                    </div>
                    <p className="pb-1 text-right text-xs leading-5 text-white/45">
                      {visibleSelectedPlan === "free"
                        ? `${selectedOffer?.durationHours ?? "—"} horas · sem cobrança`
                        : visibleSelectedPlan === "monthly"
                          ? `Cobrança recorrente a cada ${billingInterval ?? "período contratado"}`
                          : "Pagamento único · sem renovação"}
                    </p>
                  </div>

                  {visibleSelectedPlan === "monthly" && (
                    <div className="mb-5 border border-outline/25 bg-surface-deep p-3">
                      <label
                        htmlFor="plans-coupon"
                        className="mb-2 block text-[9px] font-bold uppercase tracking-[0.16em] text-white/45"
                      >
                        Código de desconto
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="plans-coupon"
                          value={cart.couponCode ?? ""}
                          onChange={(event) => {
                            setCouponCode(event.target.value);
                            setCouponQuote(null);
                            setCouponValidatedCode("");
                            setCouponMessage("");
                          }}
                          disabled={couponBusy}
                          maxLength={32}
                          autoComplete="off"
                          placeholder="EX: CREEPER10"
                          className="min-w-0 flex-1 border border-outline/35 bg-canvas px-3 py-2 text-xs font-bold uppercase tracking-wider text-white outline-none placeholder:text-white/25 focus:border-outline-strong"
                        />
                        <button
                          type="button"
                          onClick={() => void validatePlanCoupon()}
                          disabled={couponBusy}
                          className="min-h-10 border border-outline-strong/40 px-3 text-[10px] font-bold text-accent-soft disabled:opacity-40"
                        >
                          {couponBusy ? "Validando…" : "Aplicar"}
                        </button>
                      </div>
                      {cart.couponCode && (
                        <button
                          type="button"
                          onClick={() => {
                            setCouponCode(null);
                            setCouponQuote(null);
                            setCouponValidatedCode("");
                            setCouponMessage("");
                          }}
                          className="mt-2 text-[9px] font-semibold text-white/40 underline underline-offset-2 hover:text-white/70"
                        >
                          Remover cupom
                        </button>
                      )}
                      {couponMessage && (
                        <output
                          className={`block mt-2 text-[10px] leading-4 ${couponValidatedCode === cart.couponCode ? "text-accent-soft" : "text-amber-100"}`}
                        >
                          {couponMessage}
                        </output>
                      )}
                      <p className="mt-2 text-[9px] leading-4 text-white/35">
                        Cupons para Ender Dragon, Aether e vagas podem ser
                        usados no carrinho.
                      </p>
                    </div>
                  )}

                  <ul className="grid gap-2.5 text-xs leading-5 text-white/75 sm:text-sm">
                    {[
                      ...(selectedOffer?.serverLimit
                        ? [
                            `Até ${selectedOffer.serverLimit} servidores por licença`,
                          ]
                        : []),
                      ...perks[visibleSelectedPlan],
                    ].map((perk) => (
                      <li key={perk} className="flex items-start gap-2.5">
                        <TbCheck
                          aria-hidden="true"
                          className={`mt-0.5 size-4 shrink-0 ${visibleSelectedPlan === "lifetime" ? "text-[#c8aaff]" : "text-accent"}`}
                        />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-6">
                    {selectedPlanIsCurrent ? (
                      <p className="flex min-h-12 items-center justify-center gap-2 border-2 border-outline-strong/30 bg-surface-raised px-4 text-center text-sm font-semibold text-accent-soft">
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
                          catalog?.plans.find((plan) => plan.id === "free")
                            ?.enabled === false
                        }
                        className="font-minecraft-text inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-sm font-bold text-on-strong transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-outline disabled:bg-disabled disabled:text-subtle"
                      >
                        <TbPick aria-hidden="true" className="size-5" />
                        {trialActionLabel}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          visibleSelectedPlan === "monthly"
                            ? void checkout("monthly")
                            : addOneTimePlanToCart(visibleSelectedPlan)
                        }
                        disabled={
                          !catalog ||
                          !selectedOffer ||
                          Boolean(
                            activePaid &&
                              (visibleSelectedPlan === "monthly" ||
                                access?.plan !== "monthly"),
                          ) ||
                          catalog?.plans.find(
                            (plan) => plan.id === visibleSelectedPlan,
                          )?.enabled === false ||
                          Boolean(subscriptionBlocked) ||
                          busy === visibleSelectedPlan ||
                          (visibleSelectedPlan !== "monthly" &&
                            cart.plan === visibleSelectedPlan)
                        }
                        className={
                          "font-minecraft-text inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 px-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-outline disabled:bg-disabled disabled:text-subtle " +
                          (visibleSelectedPlan === "lifetime"
                            ? "border-[#581c87] bg-[#6d28d9] text-white hover:bg-[#7c3aed]"
                            : visibleSelectedPlan === "aether"
                              ? "border-accent-edge bg-accent-strong text-on-strong hover:bg-accent-hover"
                              : "border-accent-edge bg-accent-strong text-on-strong hover:bg-accent-hover")
                        }
                      >
                        {visibleSelectedPlan === "monthly" ? (
                          <TbPick aria-hidden="true" className="size-5" />
                        ) : (
                          <TbShoppingCart
                            aria-hidden="true"
                            className="size-5"
                          />
                        )}
                        {visibleSelectedPlan === "monthly"
                          ? checkoutActionLabel
                          : cart.plan === visibleSelectedPlan
                            ? `${selectedProduct.name} no carrinho`
                            : "Adicionar ao carrinho"}
                      </button>
                    )}
                    <p className="mt-2 text-center text-[10px] leading-5 text-white/40">
                      {visibleSelectedPlan === "free"
                        ? "A chave fica disponível nesta página durante o período de teste."
                        : "Gerencie as autorizações e instalações da sua rede pela sua conta."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="extra-slots-title"
          className="mx-auto mt-6 grid max-w-6xl overflow-hidden border-2 border-outline/40 bg-surface shadow-[0_6px_0_var(--site-shadow)] md:grid-cols-[minmax(0,1fr)_19rem]"
        >
          <div className="p-4 sm:p-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
              Expansão de capacidade
            </p>
            <h2
              id="extra-slots-title"
              className="font-minecraft-text mt-2 text-xl font-bold text-white sm:text-2xl"
            >
              Precisa de mais servidores?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              Sua rede cresceu? Amplie a capacidade de um plano pago pelo
              carrinho e distribua as novas vagas entre suas instalações.
            </p>
            <p className="mt-3 text-xs font-semibold text-accent-soft">
              Cada vaga extra: {slotPriceLabel} · compra única
            </p>
            {state?.additionalServerSlots ? (
              <p className="mt-2 text-[10px] text-white/45">
                Sua conta já tem {state.additionalServerSlots}{" "}
                {state.additionalServerSlots === 1
                  ? "vaga extra aprovada"
                  : "vagas extras aprovadas"}
                .
              </p>
            ) : null}
          </div>
          <div className="flex flex-col justify-center gap-3 border-t border-outline/25 bg-surface-deep p-4 sm:p-5 md:border-l md:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/45">
                Quantidade
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Diminuir quantidade de vagas"
                  disabled={slotQuantity <= 1}
                  onClick={() =>
                    setSlotQuantity((quantity) => Math.max(1, quantity - 1))
                  }
                  className="grid size-9 place-items-center border border-white/15 text-white/70 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <TbMinus aria-hidden="true" className="size-4" />
                </button>
                <span
                  aria-live="polite"
                  className="min-w-8 text-center font-minecraft-text text-base font-bold text-white"
                >
                  {slotQuantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar quantidade de vagas"
                  disabled={slotQuantity >= cartMaximum}
                  onClick={() =>
                    setSlotQuantity((quantity) =>
                      Math.min(cartMaximum, quantity + 1),
                    )
                  }
                  className="grid size-9 place-items-center border border-outline-strong/35 text-accent-soft disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <TbPlus aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
            <p className="text-right text-[10px] text-white/40">
              Subtotal:{" "}
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(slotQuantity * slotPrice)}
            </p>
            <button
              type="button"
              onClick={addSlotsToCart}
              disabled={
                !canBuyExtraSlots ||
                slotQuantity > cartMaximum - cart.serverSlots
              }
              className="font-minecraft-text inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-3 text-xs font-bold text-on-strong transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-outline disabled:bg-disabled disabled:text-subtle"
            >
              <TbShoppingCart aria-hidden="true" className="size-4" />
              Adicionar ao carrinho
            </button>
            <p className="text-center text-[10px] leading-4 text-white/40">
              {canBuyExtraSlots
                ? `Até ${cartMaximum} vagas em cada compra.`
                : "Adicione Ender Dragon ou Aether ao carrinho, ou ative um plano pago, para liberar vagas extras."}
            </p>
          </div>
        </section>

        {isSessionReady && !session && (
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-white/60">
            Entre na sua conta para gerar uma key temporária ou concluir a
            compra.{" "}
            <Link
              className="font-semibold text-accent-soft underline decoration-outline-strong/50 underline-offset-4 hover:text-white"
              href="/account?returnTo=%2Fplans"
            >
              Acessar conta
            </Link>
          </p>
        )}

        <section
          aria-labelledby="license-how-title"
          className="mx-auto mt-8 max-w-6xl border-2 border-outline/35 bg-surface shadow-[0_5px_0_var(--site-shadow)]"
        >
          <div className="border-b border-outline/30 bg-surface-raised px-4 py-3 sm:px-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
              Antes de instalar
            </p>
            <h2
              id="license-how-title"
              className="font-minecraft-text mt-1 text-base font-bold text-white sm:text-lg"
            >
              Como a licença funciona
            </h2>
          </div>
          <div className="grid divide-y divide-[#718667]/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <article className="p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-accent-soft">
                Liberação
              </h3>
              <p className="mt-2 text-xs leading-5 text-white/60">
                Após a confirmação do pagamento, gere sua key Plus na página da
                conta. Voltar do checkout, sozinho, não ativa o acesso.
              </p>
            </article>
            <article className="p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-accent-soft">
                Aprovação do servidor
              </h3>
              <p className="mt-2 text-xs leading-5 text-white/60">
                Cada instalação solicita autorização. Aprove o pedido na página
                da conta; solicitações pendentes expiram em 12 minutos.
              </p>
            </article>
            <article className="p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-accent-soft">
                Vagas de servidor
              </h3>
              <p className="mt-2 text-xs leading-5 text-white/60">
                Planos pagos podem receber vagas extras por {slotPriceLabel}{" "}
                cada. Remova uma instalação na sua conta para liberar a vaga e
                direcioná-la a outro servidor.
              </p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}

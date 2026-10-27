"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TbArrowLeft,
  TbCheck,
  TbLoader2,
  TbMinus,
  TbPlus,
  TbShoppingCart,
  TbTrash,
} from "react-icons/tb";

import { useCart } from "@/components/cart/CartProvider";
import {
  PendingCheckout,
  type PendingPurchase,
} from "@/components/cart/PendingCheckout";
import {
  type OfferDetails,
  PlanPromotion,
} from "@/components/ui/PlanPromotion";
import { useHydrated } from "@/hooks/useHydrated";
import { authClient } from "@/lib/auth-client";

type PlanCatalog = {
  plans: OfferDetails[];
  serverSlot?: {
    amount: number;
    formattedPrice: string;
    maxPerPurchase: number;
  };
};

type BillingState = {
  lastPurchase?: PendingPurchase | null;
  access: null | {
    plan: "free" | "monthly" | "lifetime" | "aether";
    status: string;
    expiresAt?: string;
  };
  additionalServerSlots?: number;
  upgrade?: { creditCents: number; endsAt: string | null; eligible: boolean };
};

type CouponQuote = {
  code: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  eligibleAmount: number;
  monthlyRecurring: boolean;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function CartPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const sessionUserId = session?.user.id;
  const sessionScope = useRef(sessionUserId);
  useEffect(() => {
    sessionScope.current = sessionUserId;
  }, [sessionUserId]);
  const isSessionReady = useHydrated() && !sessionPending;
  const {
    cart,
    ready: cartReady,
    itemCount,
    setPlan,
    setServerSlots,
    setCouponCode,
    settlePurchase,
  } = useCart();
  const [catalog, setCatalog] = useState<PlanCatalog>();
  const [billingState, setBilling] = useState<BillingState>();
  const [billingOwner, setBillingOwner] = useState<string>();
  const billing = billingOwner === sessionUserId ? billingState : undefined;
  const billingRequest = useRef<AbortController | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [returnStatus, setReturnStatus] = useState<string | null>(null);
  const [couponQuote, setCouponQuote] = useState<CouponQuote | null>(null);
  const [couponQuoteKey, setCouponQuoteKey] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const handledPurchaseRef = useRef<string | null>(null);

  const refreshBilling = useCallback(async () => {
    if (sessionScope.current !== sessionUserId) return;
    billingRequest.current?.abort();
    if (!sessionUserId) {
      setBilling(undefined);
      setBillingOwner(undefined);
      setBillingLoading(false);
      return;
    }
    const controller = new AbortController();
    billingRequest.current = controller;
    setBillingLoading(true);
    try {
      const response = await fetch("/billing/state", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error("Não foi possível consultar seu acesso.");
      const result = (await response.json()) as BillingState;
      if (controller.signal.aborted || sessionScope.current !== sessionUserId)
        return;
      setBilling(result);
      setBillingOwner(sessionUserId);
    } catch (refreshError) {
      if (controller.signal.aborted) return;
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Não foi possível consultar seu acesso.",
      );
    } finally {
      if (!controller.signal.aborted) setBillingLoading(false);
    }
  }, [sessionUserId]);

  useEffect(() => {
    void fetch("/billing/catalog", { cache: "no-store" })
      .then((response) => {
        if (!response.ok)
          throw new Error("Não foi possível carregar os preços.");
        return response.json() as Promise<PlanCatalog>;
      })
      .then(setCatalog)
      .catch((catalogError: unknown) => {
        setError(
          catalogError instanceof Error
            ? catalogError.message
            : "Não foi possível carregar os preços.",
        );
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    if (!isSessionReady) return;
    void refreshBilling();
    return () => billingRequest.current?.abort();
  }, [isSessionReady, refreshBilling]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReturnStatus(new URLSearchParams(window.location.search).get("return"));
  }, []);

  useEffect(() => {
    if (!sessionUserId || !cartReady || typeof window === "undefined") return;
    const reference = new URLSearchParams(window.location.search).get(
      "purchase",
    );
    if (
      !reference ||
      !/^[0-9a-f-]{36}$/i.test(reference) ||
      handledPurchaseRef.current === reference
    )
      return;
    handledPurchaseRef.current = reference;
    let cancelled = false;
    let completed = false;

    async function checkPurchase() {
      let pendingMessage = "";
      for (let attempt = 0; attempt < 9 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/billing/purchase/${reference}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (response.ok) {
            const purchase = (await response.json()) as {
              plan: string;
              serverSlots?: number;
              status: string;
              message?: string;
              upgradeCreditReversed?: boolean;
            };
            if (cancelled) return;
            if (purchase.upgradeCreditReversed) {
              completed = true;
              setMessage(
                purchase.message ??
                  "O crédito deste upgrade foi estornado. A compra precisa de revisão pelo suporte.",
              );
              await refreshBilling();
              return;
            }
            if (purchase.status === "approved") {
              completed = true;
              const slots = Number(purchase.serverSlots ?? 0);
              settlePurchase(purchase.plan, slots, reference as string);
              setMessage(
                purchase.plan === "server_slots"
                  ? `${slots} ${slots === 1 ? "vaga extra confirmada" : "vagas extras confirmadas"}.`
                  : purchase.plan === "monthly"
                    ? "Cobrança confirmada. Consulte a validade atual da licença na sua conta."
                    : `Pagamento confirmado${slots ? ` com ${slots} ${slots === 1 ? "vaga extra" : "vagas extras"}` : ""}. Consulte a licença na sua conta.`,
              );
              setReturnStatus("success");
              await refreshBilling();
              return;
            }
            if (purchase.message) {
              pendingMessage = purchase.message;
              setMessage(pendingMessage);
            }
            if (
              ["rejected", "cancelled", "refunded", "charged_back"].includes(
                purchase.status,
              )
            ) {
              completed = true;
              setMessage(
                "O pagamento não foi aprovado. Os itens continuam no carrinho.",
              );
              return;
            }
          }
        } catch {
          // Wait for the payment webhook to update this purchase.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      if (!cancelled)
        setMessage(
          pendingMessage ||
            "Pagamento em processamento. O carrinho será atualizado quando a confirmação chegar.",
        );
    }

    void checkPurchase();
    return () => {
      cancelled = true;
      if (!completed && handledPurchaseRef.current === reference)
        handledPurchaseRef.current = null;
    };
  }, [sessionUserId, cartReady, settlePurchase, refreshBilling]);

  const access = billing?.access;
  const activePaid = Boolean(
    access?.status === "active" &&
      (access.plan === "lifetime" ||
        access.plan === "aether" ||
        (access.plan === "monthly" &&
          access.expiresAt &&
          Date.parse(access.expiresAt) > Date.now())),
  );
  const planAlreadyActive = Boolean(
    activePaid && cart.plan && access?.plan !== "monthly",
  );
  const canBuySlots = activePaid || Boolean(cart.plan);
  const maxSlots = catalog?.serverSlot?.maxPerPurchase ?? 99;
  const unitSlotAmount = catalog?.serverSlot?.amount ?? 4.9;
  const unitSlotPrice = catalog?.serverSlot?.formattedPrice ?? "R$ 4,90";
  const selectedPlan = cart.plan
    ? catalog?.plans.find((plan) => plan.id === cart.plan)
    : undefined;
  const selectedPlanUnavailable = Boolean(
    cart.plan && (!selectedPlan || selectedPlan.enabled === false),
  );
  const total = (selectedPlan?.amount ?? 0) + cart.serverSlots * unitSlotAmount;
  const upgradeCreditCents = cart.plan
    ? Math.min(
        Math.round((selectedPlan?.amount ?? 0) * 100),
        billing?.upgrade?.creditCents ?? 0,
      )
    : 0;
  const upgradeTotal = total - upgradeCreditCents / 100;
  const couponContextKey = `${cart.plan ?? "server_slots"}:${cart.serverSlots}:${cart.couponCode ?? ""}:${upgradeCreditCents}`;
  const activeCouponQuote =
    couponQuoteKey === couponContextKey ? couponQuote : null;
  const couponCartChanged = Boolean(
    couponQuoteKey && couponQuoteKey !== couponContextKey,
  );
  const currentPlanName =
    access?.plan === "aether"
      ? "Aether"
      : access?.plan === "lifetime"
        ? "Ender Dragon"
        : access?.plan === "monthly"
          ? "Creeper"
          : null;
  const loading =
    !cartReady || catalogLoading || !isSessionReady || billingLoading;

  function updateSlotCount(value: number) {
    if (!canBuySlots && value > 0) return;
    setServerSlots(Math.max(0, Math.min(maxSlots, value)));
    setError("");
  }

  async function validateCoupon() {
    if (!cart.couponCode) {
      setCouponMessage("Digite o código do cupom.");
      setCouponQuote(null);
      setCouponQuoteKey("");
      return;
    }
    if (!itemCount) {
      setCouponMessage("Adicione um produto pago antes de aplicar um cupom.");
      return;
    }
    if (!session) {
      setCouponMessage("Entre na sua conta para validar e reservar o cupom.");
      return;
    }

    setCouponBusy(true);
    setCouponMessage("");
    try {
      const response = await fetch("/billing/coupon/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: cart.plan ?? "server_slots",
          serverSlots: cart.serverSlots,
          couponCode: cart.couponCode,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Cupom indisponível.");
      setCouponQuote(result as CouponQuote);
      setCouponQuoteKey(couponContextKey);
      setCouponMessage(
        (result as CouponQuote).monthlyRecurring
          ? "Cupom aplicado. O desconto do Creeper também vale nas próximas cobranças mensais."
          : "Cupom aplicado aos produtos elegíveis.",
      );
    } catch (couponError) {
      setCouponQuote(null);
      setCouponQuoteKey("");
      setCouponMessage(
        couponError instanceof Error
          ? couponError.message
          : "Não foi possível validar o cupom.",
      );
    } finally {
      setCouponBusy(false);
    }
  }

  async function checkout() {
    if (!itemCount) {
      setError("Seu carrinho está vazio.");
      return;
    }
    if (selectedPlanUnavailable) {
      setError(
        "Este plano não está disponível para novas contratações. Remova-o do carrinho ou escolha outro plano.",
      );
      return;
    }
    if (planAlreadyActive) {
      setError(
        "Sua conta já possui um plano ativo. Remova o plano do carrinho para comprar somente vagas extras.",
      );
      return;
    }
    if (!session) {
      window.location.assign(
        `/account?returnTo=${encodeURIComponent("/cart")}`,
      );
      return;
    }
    if (cart.serverSlots > 0 && !cart.plan && !activePaid) {
      setError(
        "Ative o Creeper, Ender Dragon ou Aether antes de comprar vagas extras.",
      );
      return;
    }
    if (cart.couponCode && !activeCouponQuote) {
      setError(
        "Reaplique o cupom para confirmar o preço atualizado deste pedido.",
      );
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: cart.plan ?? "server_slots",
          serverSlots: cart.serverSlots,
          expectedTotalCents: Math.round(
            (activeCouponQuote?.total ?? upgradeTotal) * 100,
          ),
          ...(cart.couponCode ? { couponCode: cart.couponCode } : {}),
          returnTo: "/cart",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? "Não foi possível iniciar o checkout.",
        );
      if (
        typeof result.checkoutUrl !== "string" ||
        (!result.checkoutUrl.startsWith("https://") &&
          new URL(result.checkoutUrl, window.location.origin).origin !==
            window.location.origin)
      ) {
        throw new Error("Checkout indisponível.");
      }
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Não foi possível iniciar o checkout.",
      );
      await refreshBilling();
      setBusy(false);
    }
  }

  return (
    <main
      className="relative z-10 mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-20 sm:px-6 sm:pt-24"
      aria-labelledby="cart-title"
    >
      <header className="mb-7 border-b-2 border-outline/50 pb-5">
        <Link
          href="/plans"
          className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-accent-soft transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-outline-strong"
        >
          <TbArrowLeft aria-hidden="true" className="size-4" />
          Continuar escolhendo
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center border-2 border-outline-strong/45 bg-surface-raised text-accent-soft shadow-[inset_0_0_0_3px_color-mix(in_srgb,var(--site-background)_70%,transparent),0_4px_0_var(--site-shadow)]">
            <TbShoppingCart aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
              PluginsX / compra
            </p>
            <h1
              id="cart-title"
              className="font-minecraft-text text-2xl font-black leading-tight text-white sm:text-3xl"
            >
              Seu carrinho
            </h1>
          </div>
          <span className="ml-auto border border-outline/35 bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-soft">
            {itemCount} {itemCount === 1 ? "item" : "itens"}
          </span>
        </div>
      </header>

      <PendingCheckout
        purchase={billing?.lastPurchase}
        refreshing={billingLoading}
        onRefresh={() => void refreshBilling()}
      />

      {returnStatus && (
        <output
          aria-live="polite"
          className="mb-4 block border-l-4 border-[#e3bd59] bg-warning-surface px-4 py-3 text-sm leading-6 text-amber-100"
        >
          {returnStatus === "success"
            ? "Retorno recebido. A confirmação do pagamento é consultada no servidor."
            : returnStatus === "pending"
              ? "Pagamento pendente; os itens continuam no carrinho até a confirmação."
              : returnStatus === "failure"
                ? "O pagamento não foi concluído; você pode tentar novamente."
                : "Autorização recebida. A primeira cobrança precisa ser confirmada para liberar o Creeper."}
        </output>
      )}
      {message && (
        <output
          aria-live="polite"
          className="mb-4 block border-l-4 border-outline-strong bg-surface px-4 py-3 text-sm leading-6 text-accent-soft"
        >
          {message}
        </output>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 border-l-4 border-[#d66d68] bg-danger-surface px-4 py-3 text-sm leading-6 text-red-100"
        >
          {error}
        </div>
      )}

      {loading ? (
        <section
          aria-live="polite"
          className="grid min-h-52 place-items-center border-2 border-outline/35 bg-surface text-sm text-white/55"
        >
          <span className="flex items-center gap-2">
            <TbLoader2 aria-hidden="true" className="size-4 animate-spin" />{" "}
            Conferindo carrinho e preços…
          </span>
        </section>
      ) : itemCount === 0 ? (
        <section className="mx-auto grid min-h-72 max-w-3xl place-items-center border-2 border-dashed border-outline/40 bg-surface/90 p-6 text-center">
          <div>
            <TbShoppingCart
              aria-hidden="true"
              className="mx-auto size-10 text-muted"
            />
            <h2 className="font-minecraft-text mt-4 text-xl font-bold text-white">
              Nenhum item por aqui
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Escolha o Ender Dragon ou o Aether. Se você já tem um plano ativo,
              também pode adicionar vagas de servidor.
            </p>
            <Link
              href="/plans"
              className="font-minecraft-text mt-5 inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-5 text-xs font-bold text-on-strong transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Ver planos
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Itens selecionados" className="grid gap-3">
            {cart.plan && (
              <article
                className={`border-2 bg-surface shadow-[0_5px_0_var(--site-shadow)] ${cart.plan === "aether" ? "border-outline-strong/55" : "border-[#8b5cf6]/35"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                      Acesso vitalício · pagamento único
                    </p>
                    <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                      {selectedPlan?.name ??
                        (cart.plan === "aether" ? "Aether" : "Ender Dragon")}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      {selectedPlanUnavailable
                        ? "Indisponível para novas contratações; remova este item ou escolha outro plano."
                        : selectedPlan?.serverLimit
                          ? `Até ${selectedPlan.serverLimit} servidores incluídos`
                          : "Limite conforme o plano escolhido"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <PlanPromotion offer={selectedPlan} />
                    <strong className="text-base text-white">
                      {selectedPlan?.formattedPrice ?? "Indisponível"}
                    </strong>
                    <button
                      type="button"
                      aria-label="Remover plano do carrinho"
                      onClick={() => setPlan(null)}
                      className="grid size-10 place-items-center border border-white/10 text-white/55 transition hover:border-red-300/50 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      <TbTrash aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            )}

            <article className="border-2 border-outline/35 bg-surface shadow-[0_5px_0_var(--site-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Capacidade de servidor
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-base font-bold text-white">
                    Vagas extras
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-white/55">
                    {unitSlotPrice} por servidor · compra única
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Remover uma vaga"
                    disabled={!canBuySlots || cart.serverSlots <= 0}
                    onClick={() => updateSlotCount(cart.serverSlots - 1)}
                    className="grid size-9 place-items-center border border-white/15 text-white/70 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <TbMinus aria-hidden="true" className="size-4" />
                  </button>
                  <input
                    aria-label="Quantidade de vagas extras"
                    type="number"
                    min={0}
                    max={maxSlots}
                    step={1}
                    value={cart.serverSlots}
                    disabled={!canBuySlots}
                    onChange={(event) =>
                      updateSlotCount(Number(event.target.value))
                    }
                    className="h-9 w-16 border border-outline/35 bg-canvas text-center font-minecraft-text text-sm font-bold text-white outline-none focus:border-outline-strong disabled:opacity-40"
                  />
                  <button
                    type="button"
                    aria-label="Adicionar uma vaga"
                    disabled={!canBuySlots || cart.serverSlots >= maxSlots}
                    onClick={() => updateSlotCount(cart.serverSlots + 1)}
                    className="grid size-9 place-items-center border border-outline-strong/35 text-accent-soft disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <TbPlus aria-hidden="true" className="size-4" />
                  </button>
                  {cart.serverSlots > 0 && (
                    <button
                      type="button"
                      aria-label="Remover todas as vagas extras"
                      onClick={() => setServerSlots(0)}
                      className="ml-1 grid size-9 place-items-center border border-white/10 text-white/50 transition hover:border-red-300/50 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      <TbTrash aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </div>
              </div>
              {cart.serverSlots > 0 && (
                <div className="flex justify-between border-t border-outline/20 bg-surface-deep px-4 py-3 text-xs sm:px-5">
                  <span className="text-white/50">
                    {cart.serverSlots} × {unitSlotPrice}
                  </span>
                  <strong className="text-white">
                    {currency.format(cart.serverSlots * unitSlotAmount)}
                  </strong>
                </div>
              )}
            </article>

            {!canBuySlots && (
              <p className="border-l-4 border-[#e3bd59] bg-warning-surface px-4 py-3 text-xs leading-5 text-amber-100">
                Para comprar vagas sem um plano no carrinho, ative antes o
                Creeper, o Ender Dragon ou o Aether.
              </p>
            )}
            {planAlreadyActive && (
              <p className="border-l-4 border-[#e3bd59] bg-warning-surface px-4 py-3 text-xs leading-5 text-amber-100">
                {currentPlanName} já está ativo nesta conta. Remova o plano do
                carrinho para finalizar somente as vagas extras.
              </p>
            )}
            <p className="px-1 text-[10px] leading-5 text-white/40">
              O Creeper é uma assinatura mensal e fica fora deste carrinho. As
              vagas extras são vinculadas à conta e ficam disponíveis enquanto
              houver um plano pago ativo.
            </p>
          </section>

          <aside className="border-2 border-outline/40 bg-surface p-4 shadow-[0_6px_0_var(--site-shadow)] sm:p-5 lg:sticky lg:top-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
              Resumo do pedido
            </p>
            <div className="mt-4 grid gap-3 border-b border-outline/25 pb-4 text-xs">
              {cart.plan && (
                <div className="flex justify-between gap-3 text-white/65">
                  <span>
                    {selectedPlan?.name ??
                      (cart.plan === "aether" ? "Aether" : "Ender Dragon")}
                  </span>
                  <span>{selectedPlan?.formattedPrice ?? "—"}</span>
                </div>
              )}
              {cart.serverSlots > 0 && (
                <div className="flex justify-between gap-3 text-white/65">
                  <span>{cart.serverSlots} vagas extras</span>
                  <span>
                    {currency.format(cart.serverSlots * unitSlotAmount)}
                  </span>
                </div>
              )}
              {currentPlanName && activePaid && (
                <div className="flex justify-between gap-3 text-white/45">
                  <span>Plano ativo</span>
                  <span>{currentPlanName}</span>
                </div>
              )}
              {activeCouponQuote && (
                <>
                  <div className="flex justify-between gap-3 text-white/55">
                    <span>Subtotal</span>
                    <span>{currency.format(activeCouponQuote.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-accent-soft">
                    <span>Cupom {activeCouponQuote.code}</span>
                    <span>
                      − {currency.format(activeCouponQuote.discountAmount)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="my-4 border border-outline/25 bg-surface-deep p-3">
              <label
                htmlFor="cart-coupon"
                className="mb-2 block text-[9px] font-bold uppercase tracking-[0.16em] text-white/45"
              >
                Código de desconto
              </label>
              <div className="flex gap-2">
                <input
                  id="cart-coupon"
                  value={cart.couponCode ?? ""}
                  onChange={(event) => {
                    setCouponCode(event.target.value);
                    setCouponMessage("");
                  }}
                  maxLength={32}
                  autoComplete="off"
                  placeholder="EX: BEMVINDO"
                  className="min-w-0 flex-1 border border-outline/35 bg-canvas px-3 py-2 text-xs font-bold uppercase tracking-wider text-white outline-none placeholder:text-white/25 focus:border-outline-strong"
                />
                <button
                  type="button"
                  onClick={() => void validateCoupon()}
                  disabled={couponBusy || !itemCount}
                  className="min-h-10 border border-outline-strong/40 px-3 text-[10px] font-bold text-accent-soft transition hover:bg-accent/10 disabled:opacity-40"
                >
                  {couponBusy
                    ? "Validando…"
                    : activeCouponQuote
                      ? "Reaplicar"
                      : "Aplicar"}
                </button>
              </div>
              {cart.couponCode && (
                <button
                  type="button"
                  onClick={() => {
                    setCouponCode(null);
                    setCouponQuote(null);
                    setCouponQuoteKey("");
                    setCouponMessage("");
                  }}
                  className="mt-2 text-[9px] font-semibold text-white/40 underline underline-offset-2 hover:text-white/70"
                >
                  Remover cupom
                </button>
              )}
              {(couponMessage || couponCartChanged) && (
                <output
                  className={`block mt-2 text-[10px] leading-4 ${activeCouponQuote ? "text-accent-soft" : "text-amber-100"}`}
                >
                  {couponCartChanged
                    ? "O carrinho mudou. Reaplique o cupom para atualizar o preço."
                    : couponMessage}
                </output>
              )}
              {cart.couponCode &&
                !activeCouponQuote &&
                !couponMessage &&
                !couponCartChanged && (
                  <p className="mt-2 text-[10px] leading-4 text-amber-100/70">
                    O carrinho mudou. Reaplique o cupom para atualizar o preço.
                  </p>
                )}
            </div>
            {upgradeCreditCents > 0 && (
              <div className="mt-3 border-l-2 border-outline-strong bg-surface-raised p-3 text-xs leading-5 text-accent-soft">
                <strong>
                  Crédito do primeiro mês: −
                  {currency.format(upgradeCreditCents / 100)}
                </strong>
                <p>
                  Corresponde ao pagamento aprovado do mensal, utilizável uma
                  única vez até{" "}
                  {billing?.upgrade?.endsAt
                    ? new Date(billing.upgrade.endsAt).toLocaleString("pt-BR")
                    : "o fim do primeiro mês"}
                  . A renovação mensal é encerrada na confirmação.
                </p>
              </div>
            )}
            <div className="flex items-end justify-between gap-3 py-4">
              <span className="text-xs font-semibold text-white/55">Total</span>
              <strong className="font-minecraft-text text-2xl font-black text-white">
                {currency.format(activeCouponQuote?.total ?? upgradeTotal)}
              </strong>
            </div>
            <p className="text-[10px] leading-5 text-white/40">
              O servidor calcula e valida o valor final antes de abrir o
              checkout.
            </p>
            <button
              type="button"
              onClick={() => void checkout()}
              disabled={
                busy ||
                !itemCount ||
                !catalog ||
                selectedPlanUnavailable ||
                planAlreadyActive ||
                couponBusy ||
                Boolean(cart.couponCode && !activeCouponQuote)
              }
              className="font-minecraft-text mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-3 text-xs font-bold text-on-strong transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-outline disabled:bg-disabled disabled:text-subtle"
            >
              {busy ? (
                <TbLoader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <TbCheck aria-hidden="true" className="size-4" />
              )}
              {busy
                ? "Abrindo checkout…"
                : session
                  ? "Finalizar compra"
                  : "Entrar e continuar"}
            </button>
            <p className="mt-3 text-center text-[9px] leading-4 text-white/35">
              Pagamento único para Ender Dragon, Aether e vagas extras.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}

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
import { useHydrated } from "@/hooks/useHydrated";
import { authClient } from "@/lib/auth-client";

type PlanCatalog = {
  plans: { id: string; amount: number; formattedPrice: string }[];
  serverSlot?: {
    amount: number;
    formattedPrice: string;
    maxPerPurchase: number;
  };
};

type BillingState = {
  access: null | {
    plan: "free" | "monthly" | "lifetime" | "aether";
    status: string;
    expiresAt?: string;
  };
  additionalServerSlots?: number;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function CartPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const sessionUserId = session?.user.id;
  const isSessionReady = useHydrated() && !sessionPending;
  const {
    cart,
    ready: cartReady,
    itemCount,
    setPlan,
    setServerSlots,
    settlePurchase,
  } = useCart();
  const [catalog, setCatalog] = useState<PlanCatalog>();
  const [billing, setBilling] = useState<BillingState>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [returnStatus, setReturnStatus] = useState<string | null>(null);
  const handledPurchaseRef = useRef<string | null>(null);

  const refreshBilling = useCallback(async () => {
    if (!sessionUserId) {
      setBilling(undefined);
      return;
    }
    setBillingLoading(true);
    try {
      const response = await fetch("/billing/state", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Não foi possível consultar seu acesso.");
      setBilling((await response.json()) as BillingState);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Não foi possível consultar seu acesso.",
      );
    } finally {
      setBillingLoading(false);
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

    async function checkPurchase() {
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
            };
            if (purchase.status === "approved") {
              const slots = Number(purchase.serverSlots ?? 0);
              settlePurchase(purchase.plan, slots);
              setMessage(
                purchase.plan === "server_slots"
                  ? `${slots} ${slots === 1 ? "vaga extra confirmada" : "vagas extras confirmadas"}.`
                  : purchase.plan === "monthly"
                    ? "Primeira cobrança confirmada. Seu Creeper está ativo."
                    : `Pagamento confirmado. ${purchase.plan === "aether" ? "Aether" : "Ender Dragon"} já está ativo${slots ? ` com ${slots} ${slots === 1 ? "vaga extra" : "vagas extras"}` : ""}.`,
              );
              setReturnStatus("success");
              await refreshBilling();
              return;
            }
            if (
              ["rejected", "cancelled", "refunded", "charged_back"].includes(
                purchase.status,
              )
            ) {
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
          "Pagamento em processamento. O carrinho será atualizado quando a confirmação chegar.",
        );
    }

    void checkPurchase();
    return () => {
      cancelled = true;
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
  const planAlreadyActive = Boolean(activePaid && cart.plan);
  const canBuySlots = activePaid || Boolean(cart.plan);
  const maxSlots = catalog?.serverSlot?.maxPerPurchase ?? 99;
  const unitSlotAmount = catalog?.serverSlot?.amount ?? 4.9;
  const unitSlotPrice = catalog?.serverSlot?.formattedPrice ?? "R$ 4,90";
  const selectedPlan = cart.plan
    ? catalog?.plans.find((plan) => plan.id === cart.plan)
    : undefined;
  const total = (selectedPlan?.amount ?? 0) + cart.serverSlots * unitSlotAmount;
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

  async function checkout() {
    if (!itemCount) {
      setError("Seu carrinho está vazio.");
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
        !result.checkoutUrl.startsWith("https://")
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
      setBusy(false);
    }
  }

  return (
    <main
      className="relative z-10 mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-20 sm:px-6 sm:pt-24"
      aria-labelledby="cart-title"
    >
      <header className="mb-7 border-b-2 border-[#687b5a]/50 pb-5">
        <Link
          href="/plans"
          className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-[#b9d59b] transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9e9a8]"
        >
          <TbArrowLeft aria-hidden="true" className="size-4" />
          Continuar escolhendo
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center border-2 border-[#b5d58a]/45 bg-[#1b2c22] text-[#b9d59b] shadow-[inset_0_0_0_3px_rgba(10,18,12,0.7),0_4px_0_#080d09]">
            <TbShoppingCart aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a6cf74]">
              PluginsX / compra
            </p>
            <h1
              id="cart-title"
              className="font-minecraft-text text-2xl font-black leading-tight text-white sm:text-3xl"
            >
              Seu carrinho
            </h1>
          </div>
          <span className="ml-auto border border-[#718667]/35 bg-[#101811] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b9d59b]">
            {itemCount} {itemCount === 1 ? "item" : "itens"}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Confira seus planos e a capacidade extra antes de ir ao checkout
          seguro.
        </p>
      </header>

      {returnStatus && (
        <output
          aria-live="polite"
          className="mb-4 block border-l-4 border-[#e3bd59] bg-[#211b0e] px-4 py-3 text-sm leading-6 text-amber-100"
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
          className="mb-4 block border-l-4 border-[#8bc34a] bg-[#101a12] px-4 py-3 text-sm leading-6 text-[#d9f2bd]"
        >
          {message}
        </output>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 border-l-4 border-[#d66d68] bg-[#211211] px-4 py-3 text-sm leading-6 text-red-100"
        >
          {error}
        </div>
      )}

      {loading ? (
        <section
          aria-live="polite"
          className="grid min-h-52 place-items-center border-2 border-[#718667]/35 bg-[#111a16] text-sm text-white/55"
        >
          <span className="flex items-center gap-2">
            <TbLoader2 aria-hidden="true" className="size-4 animate-spin" />{" "}
            Conferindo carrinho e preços…
          </span>
        </section>
      ) : itemCount === 0 ? (
        <section className="mx-auto grid min-h-72 max-w-3xl place-items-center border-2 border-dashed border-[#718667]/40 bg-[#111a16]/90 p-6 text-center">
          <div>
            <TbShoppingCart
              aria-hidden="true"
              className="mx-auto size-10 text-[#91b56b]"
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
              className="font-minecraft-text mt-5 inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-5 text-xs font-bold text-[#f7ffe9] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Ver planos
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Itens selecionados" className="grid gap-3">
            {cart.plan && selectedPlan && (
              <article
                className={`border-2 bg-[#111a16] shadow-[0_5px_0_#070b08] ${cart.plan === "aether" ? "border-[#8ab95d]/55" : "border-[#8b5cf6]/35"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#91b56b]">
                      Acesso vitalício · pagamento único
                    </p>
                    <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                      {cart.plan === "aether" ? "Aether" : "Ender Dragon"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      {cart.plan === "aether"
                        ? "Até 250 servidores incluídos"
                        : "Até 5 servidores incluídos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <strong className="text-base text-white">
                      {selectedPlan.formattedPrice}
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

            <article className="border-2 border-[#718667]/35 bg-[#111a16] shadow-[0_5px_0_#070b08]">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#91b56b]">
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
                    className="h-9 w-16 border border-[#718667]/35 bg-[#080d0a] text-center font-minecraft-text text-sm font-bold text-white outline-none focus:border-[#a6cf74] disabled:opacity-40"
                  />
                  <button
                    type="button"
                    aria-label="Adicionar uma vaga"
                    disabled={!canBuySlots || cart.serverSlots >= maxSlots}
                    onClick={() => updateSlotCount(cart.serverSlots + 1)}
                    className="grid size-9 place-items-center border border-[#a6cf74]/35 text-[#c9e9a8] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                <div className="flex justify-between border-t border-[#718667]/20 bg-[#0c130f] px-4 py-3 text-xs sm:px-5">
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
              <p className="border-l-4 border-[#e3bd59] bg-[#211b0e] px-4 py-3 text-xs leading-5 text-amber-100">
                Para comprar vagas sem um plano no carrinho, ative antes o
                Creeper, o Ender Dragon ou o Aether.
              </p>
            )}
            {planAlreadyActive && (
              <p className="border-l-4 border-[#e3bd59] bg-[#211b0e] px-4 py-3 text-xs leading-5 text-amber-100">
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

          <aside className="border-2 border-[#718667]/40 bg-[#111a16] p-4 shadow-[0_6px_0_#070b08] sm:p-5 lg:sticky lg:top-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
              Resumo do pedido
            </p>
            <div className="mt-4 grid gap-3 border-b border-[#718667]/25 pb-4 text-xs">
              {cart.plan && (
                <div className="flex justify-between gap-3 text-white/65">
                  <span>
                    {cart.plan === "aether" ? "Aether" : "Ender Dragon"}
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
            </div>
            <div className="flex items-end justify-between gap-3 py-4">
              <span className="text-xs font-semibold text-white/55">Total</span>
              <strong className="font-minecraft-text text-2xl font-black text-white">
                {currency.format(total)}
              </strong>
            </div>
            <p className="text-[10px] leading-5 text-white/40">
              O servidor calcula e valida o valor final antes de abrir o
              checkout.
            </p>
            <button
              type="button"
              onClick={() => void checkout()}
              disabled={busy || !itemCount || planAlreadyActive}
              className="font-minecraft-text mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-3 text-xs font-bold text-[#f7ffe9] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-[#344035] disabled:bg-[#343d34] disabled:text-[#8f9b89]"
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

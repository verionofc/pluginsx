"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TbActivity,
  TbArrowLeft,
  TbChartBar,
  TbCheck,
  TbChevronLeft,
  TbChevronRight,
  TbClockHour4,
  TbCurrencyReal,
  TbLoader2,
  TbRefresh,
  TbSearch,
  TbShieldCheck,
  TbTag,
  TbUsers,
} from "react-icons/tb";

import { authClient } from "@/lib/auth-client";

type Dashboard = {
  currency: string;
  locale: string;
  generatedAt: string;
  totals: {
    grossRevenue: number;
    approvedPayments: number;
    thisMonthRevenue: number;
    thisMonthPayments: number;
    activePaidSubscriptions: number;
    monthlyRecurringRevenue: number;
    accountsWithSales: number;
  };
  monthlyRevenue: { month: string; amount: number; count: number }[];
  revenueByPlan: {
    plan: string;
    label: string;
    amount: number;
    count: number;
  }[];
};

type AccountSpendPage = {
  total: number;
  limit: number;
  offset: number;
  items: {
    userId: string;
    spent: number;
    paymentCount: number;
    account: { id: string; name: string; email: string } | null;
    products: {
      plan: string;
      label: string;
      amount: number;
      paymentCount: number;
    }[];
  }[];
};

type Transaction = {
  userId: string;
  account: { id: string; name: string; email: string } | null;
  purchaseReference: string;
  plan: string;
  product: string;
  serverSlots: number;
  amount: number;
  discountAmount: number;
  couponCode: string | null;
  currency: string;
  status: string;
  paidAt: string;
};

type TransactionPage = {
  total: number;
  limit: number;
  offset: number;
  items: Transaction[];
};

type AccountDetails = {
  account: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string | null;
  };
  access: {
    plan: string | null;
    status: string | null;
    expiresAt: string | null;
    startsAt: string | null;
    serverLimitOverride: number | null;
    serverLimitUnlimited: boolean;
    grantSource: string | null;
    cancelAtPeriodEnd: boolean;
    hasProviderSubscription: boolean;
    planLabel: string;
    defaultServerLimit: number | null;
    planServerLimits: { monthly: number; lifetime: number; aether: number };
  };
  spending: { total: number; approvedPayments: number };
  orders: {
    reference: string;
    plan: string;
    product: string;
    serverSlots: number;
    amount: number;
    discountAmount: number;
    couponCode: string | null;
    currency: string;
    status: string;
    createdAt: string;
  }[];
  transactions: {
    reference: string;
    plan: string;
    product: string;
    serverSlots: number;
    amount: number;
    discountAmount: number;
    couponCode: string | null;
    currency: string;
    status: string;
    paidAt: string;
  }[];
};

type Activity = {
  planChanges: {
    actorEmail: string;
    targetUserId: string;
    targetEmail: string;
    status: string;
    before: {
      plan: string | null;
      status: string | null;
      expiresAt: string | null;
      serverLimitOverride: number | null;
      serverLimitUnlimited: boolean;
    };
    after: {
      plan: string | null;
      status: string | null;
      expiresAt: string | null;
      serverLimitOverride: number | null;
      serverLimitUnlimited: boolean;
    };
    error: string | null;
    createdAt: string;
  }[];
  paymentEvents: {
    eventId: string;
    type: string;
    resourceId: string;
    status: string;
    receivedAt: string;
  }[];
};

type PlanSelection = "none" | "monthly" | "lifetime" | "aether";
type PanelTab =
  | "overview"
  | "coupons"
  | "accounts"
  | "access"
  | "transactions"
  | "audit";

const panelTabs: {
  id: PanelTab;
  label: string;
  icon: typeof TbChartBar;
}[] = [
  { id: "overview", label: "Visão geral", icon: TbChartBar },
  { id: "coupons", label: "Cupons", icon: TbTag },
  { id: "accounts", label: "Contas", icon: TbUsers },
  { id: "access", label: "Acessos", icon: TbShieldCheck },
  { id: "transactions", label: "Cobranças", icon: TbCurrencyReal },
  { id: "audit", label: "Auditoria", icon: TbActivity },
];

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateTime.format(parsed);
}

function asLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function monthLabel(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(Date.UTC(year, rawMonth - 1, 1)),
  );
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    approved: "Aprovado",
    pending: "Pendente",
    rejected: "Recusado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    charged_back: "Contestado",
    applied: "Aplicada",
    failed: "Falhou",
    processing: "Processando",
    processed: "Processado",
  };
  return labels[value] ?? value;
}

function statusStyle(value: string) {
  if (value === "approved" || value === "applied" || value === "processed")
    return "border-outline-strong/30 bg-accent/10 text-accent-soft";
  if (value === "pending" || value === "processing")
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-red-300/25 bg-red-300/10 text-red-100";
}

function planName(plan: string | null) {
  if (plan === "monthly") return "Creeper";
  if (plan === "lifetime") return "Ender Dragon";
  if (plan === "aether") return "Aether";
  if (plan === "free") return "Trial Key";
  return "Sem plano";
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      result?.message ?? "Não foi possível carregar o painel.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result as T;
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof TbChartBar;
}) {
  return (
    <article className="relative overflow-hidden border border-outline/30 bg-surface p-4 shadow-[0_4px_0_var(--site-shadow)] sm:p-5">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-accent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/45 sm:text-[10px]">
            {label}
          </p>
          <p className="font-minecraft-text mt-3 text-xl font-black text-white sm:text-2xl">
            {value}
          </p>
          <p className="mt-2 text-[10px] leading-4 text-white/40">{note}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center border border-outline-strong/25 bg-accent/10 text-accent-soft">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

type PanelCoupon = {
  id: string;
  code: string;
  products: string[];
  discountType: "percentage" | "fixed";
  discountValue: number;
  usageMode: "single" | "multi" | "per_account";
  maxUses: number | null;
  maxPerAccount: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  usageCount: number;
  reservedCount: number;
  createdAt: string;
};

const couponProducts = [
  { id: "monthly", label: "Creeper mensal" },
  { id: "lifetime", label: "Ender Dragon" },
  { id: "aether", label: "Aether" },
  { id: "server_slots", label: "Vagas extras" },
] as const;

function CouponManager() {
  const [coupons, setCoupons] = useState<PanelCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [products, setProducts] = useState<string[]>(["monthly"]);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    "percentage",
  );
  const [discountValue, setDiscountValue] = useState("10");
  const [usageMode, setUsageMode] = useState<
    "single" | "multi" | "per_account"
  >("multi");
  const [maxUses, setMaxUses] = useState("");
  const [maxPerAccount, setMaxPerAccount] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeToggleId, setActiveToggleId] = useState("");

  const loadCoupons = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await apiRequest<{ items: PanelCoupon[] }>(
        "/panel/coupons",
      );
      setCoupons(result.items);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os cupons.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCoupons();
  }, [loadCoupons]);

  function toggleProduct(product: string) {
    setProducts((current) =>
      current.includes(product)
        ? current.filter((item) => item !== product)
        : [...current, product],
    );
  }

  async function createCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<PanelCoupon>("/panel/coupons", {
        method: "POST",
        body: JSON.stringify({
          code,
          products,
          discountType,
          discountValue: Number(discountValue),
          usageMode,
          maxUses: usageMode === "single" || !maxUses ? null : Number(maxUses),
          maxPerAccount:
            usageMode === "per_account" ? Number(maxPerAccount) : null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      setCode("");
      setProducts(["monthly"]);
      setMaxUses("");
      setStartsAt("");
      setExpiresAt("");
      setNotice("Cupom criado e disponível para os produtos selecionados.");
      await loadCoupons(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível criar o cupom.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setCouponActive(coupon: PanelCoupon, active: boolean) {
    setActiveToggleId(coupon.id);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<PanelCoupon>(
        `/panel/coupons/${coupon.id}/active`,
        {
          method: "POST",
          body: JSON.stringify({ active }),
        },
      );
      setCoupons((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(`${coupon.code} ${active ? "ativado" : "desativado"}.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível atualizar o cupom.",
      );
    } finally {
      setActiveToggleId("");
    }
  }

  const productLabel = (id: string) =>
    couponProducts.find((product) => product.id === id)?.label ?? id;
  const discountLabel = (coupon: PanelCoupon) =>
    coupon.discountType === "percentage"
      ? `${coupon.discountValue}%`
      : new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(coupon.discountValue);

  return (
    <section
      aria-labelledby="coupon-manager-title"
      className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
    >
      <article className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
        <div className="border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
          <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
            <TbTag aria-hidden="true" /> Vendas
          </p>
          <h2
            id="coupon-manager-title"
            className="font-minecraft-text mt-1 text-lg font-bold text-white"
          >
            Criar cupom
          </h2>
        </div>
        <form onSubmit={createCoupon} className="grid gap-4 p-4 sm:p-5">
          <div>
            <label
              htmlFor="coupon-code"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
            >
              Código
            </label>
            <input
              id="coupon-code"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_-]+"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="EX: BEMVINDO"
              className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm font-bold uppercase tracking-widest text-white outline-none placeholder:text-white/25 focus:border-outline-strong"
            />
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
              Produtos pagos aceitos
            </legend>
            {couponProducts.map((product) => (
              <label
                key={product.id}
                className="flex min-h-10 cursor-pointer items-center gap-2 border border-outline/25 bg-surface-deep px-3 text-xs text-white/75"
              >
                <input
                  type="checkbox"
                  checked={products.includes(product.id)}
                  onChange={() => toggleProduct(product.id)}
                  className="size-4 accent-[#8bc34a]"
                />
                {product.label}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="coupon-discount-type"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
              >
                Tipo de desconto
              </label>
              <select
                id="coupon-discount-type"
                value={discountType}
                onChange={(event) =>
                  setDiscountType(event.target.value as "percentage" | "fixed")
                }
                className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong"
              >
                <option value="percentage">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="coupon-discount-value"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
              >
                Desconto
              </label>
              <input
                id="coupon-discount-value"
                type="number"
                required
                min="0.01"
                max={discountType === "percentage" ? "99.99" : undefined}
                step="0.01"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="coupon-usage-mode"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
            >
              Regra de uso
            </label>
            <select
              id="coupon-usage-mode"
              value={usageMode}
              onChange={(event) =>
                setUsageMode(
                  event.target.value as "single" | "multi" | "per_account",
                )
              }
              className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong"
            >
              <option value="single">Uma única pessoa (1 resgate total)</option>
              <option value="multi">
                Várias pessoas (limite global opcional)
              </option>
              <option value="per_account">
                Limite por conta (com encerramento)
              </option>
            </select>
          </div>
          {usageMode === "multi" && (
            <div>
              <label
                htmlFor="coupon-max-uses"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
              >
                Limite global (opcional)
              </label>
              <input
                id="coupon-max-uses"
                type="number"
                min="1"
                step="1"
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                placeholder="Sem limite de resgates"
                className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-outline-strong"
              />
            </div>
          )}
          {usageMode === "per_account" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="coupon-max-account"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
                >
                  Usos permitidos por conta
                </label>
                <input
                  id="coupon-max-account"
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={maxPerAccount}
                  onChange={(event) => setMaxPerAccount(event.target.value)}
                  className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong"
                />
              </div>
              <div>
                <label
                  htmlFor="coupon-max-account-global"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
                >
                  Limite global (opcional)
                </label>
                <input
                  id="coupon-max-account-global"
                  type="number"
                  min="1"
                  step="1"
                  value={maxUses}
                  onChange={(event) => setMaxUses(event.target.value)}
                  placeholder="Sem limite global"
                  className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-outline-strong"
                />
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="coupon-starts-at"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
              >
                Disponível a partir de (opcional)
              </label>
              <input
                id="coupon-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="min-h-11 w-full border border-outline/40 bg-canvas px-2 text-xs text-white outline-none focus:border-outline-strong"
              />
            </div>
            <div>
              <label
                htmlFor="coupon-expires-at"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
              >
                Encerramento
                {usageMode === "per_account" ? " · obrigatório" : " · opcional"}
              </label>
              <input
                id="coupon-expires-at"
                type="datetime-local"
                required={usageMode === "per_account"}
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="min-h-11 w-full border border-outline/40 bg-canvas px-2 text-xs text-white outline-none focus:border-outline-strong"
              />
            </div>
          </div>
          {products.includes("monthly") && (
            <p className="border-l-2 border-outline-strong/50 bg-surface-deep px-3 py-2 text-[10px] leading-4 text-white/50">
              No Creeper, o desconto permanece nas cobranças mensais enquanto a
              assinatura estiver ativa.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="border-l-4 border-red-300 bg-red-950/25 px-3 py-2 text-xs text-red-100"
            >
              {error}
            </p>
          )}
          {notice && (
            <output className="block border-l-4 border-outline-strong bg-surface px-3 py-2 text-xs text-accent-soft">
              {notice}
            </output>
          )}
          <button
            type="submit"
            disabled={saving || products.length === 0}
            className="font-minecraft-text inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:border-outline disabled:bg-disabled"
          >
            {saving ? (
              <TbLoader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <TbCheck aria-hidden="true" />
            )}
            Criar cupom
          </button>
        </form>
      </article>

      <article className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
        <div className="flex items-center justify-between gap-3 border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
              Cupons e resgates
            </p>
            <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
              Códigos cadastrados
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void loadCoupons(true)}
            disabled={refreshing}
            className="min-h-9 border border-outline/35 px-3 text-[10px] font-bold text-white/65 hover:text-white disabled:opacity-40"
          >
            {refreshing ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
        {loading ? (
          <p className="p-5 text-xs text-white/45">Carregando cupons…</p>
        ) : coupons.length === 0 ? (
          <p className="p-5 text-xs leading-5 text-white/45">
            Nenhum cupom criado. Códigos inativos também aparecem aqui para
            consulta.
          </p>
        ) : (
          <div className="max-h-[44rem] divide-y divide-white/[0.06] overflow-auto">
            {coupons.map((coupon) => (
              <article key={coupon.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-minecraft-text text-base font-bold tracking-wider text-white">
                      {coupon.code}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-accent-soft">
                      {discountLabel(coupon)} de desconto
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void setCouponActive(coupon, !coupon.isActive)
                    }
                    disabled={Boolean(activeToggleId)}
                    className={`min-h-9 border px-3 text-[10px] font-bold transition disabled:opacity-40 ${coupon.isActive ? "border-outline-strong/35 bg-accent/10 text-accent-soft hover:border-red-300/45 hover:text-red-100" : "border-white/15 text-white/55 hover:text-white"}`}
                  >
                    {activeToggleId === coupon.id
                      ? "Salvando…"
                      : coupon.isActive
                        ? "Desativar"
                        : "Ativar"}
                  </button>
                </div>
                <p className="mt-3 text-[10px] leading-5 text-white/55">
                  {coupon.products.map(productLabel).join(" · ")}
                </p>
                <p className="text-[10px] leading-5 text-white/45">
                  {coupon.usageMode === "single"
                    ? "Uso único · 1 resgate total"
                    : coupon.usageMode === "per_account"
                      ? `${coupon.maxPerAccount} usos por conta`
                      : "Várias pessoas"}
                  {coupon.maxUses != null
                    ? ` · ${coupon.usageCount + coupon.reservedCount}/${coupon.maxUses} usos reservados ou concluídos`
                    : ` · ${coupon.usageCount} usos concluídos`}
                </p>
                <p className="text-[10px] leading-5 text-white/40">
                  {coupon.startsAt
                    ? `A partir de ${formatDate(coupon.startsAt)}`
                    : "Disponível assim que ativado"}
                  {coupon.expiresAt
                    ? ` · até ${formatDate(coupon.expiresAt)}`
                    : " · sem data de encerramento"}
                </p>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export function PanelPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [accountSpend, setAccountSpend] = useState<AccountSpendPage | null>(
    null,
  );
  const [transactions, setTransactions] = useState<TransactionPage | null>(
    null,
  );
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [offset, setOffset] = useState(0);
  const [accountOffset, setAccountOffset] = useState(0);
  const [identifier, setIdentifier] = useState("");
  const [lookup, setLookup] = useState<AccountDetails | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [plan, setPlan] = useState<PlanSelection>("none");
  const [expiresAt, setExpiresAt] = useState("");
  const [serverLimit, setServerLimit] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % panelTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + panelTabs.length) % panelTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = panelTabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActiveTab(panelTabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  const money = useMemo(
    () =>
      new Intl.NumberFormat(dashboard?.locale ?? "pt-BR", {
        style: "currency",
        currency: dashboard?.currency ?? "BRL",
      }),
    [dashboard?.currency, dashboard?.locale],
  );

  const loadPanel = useCallback(
    async (nextOffset = 0, showRefresh = false, nextAccountOffset = 0) => {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      setForbidden(false);
      try {
        const [nextDashboard, nextAccounts, nextTransactions, nextActivity] =
          await Promise.all([
            apiRequest<Dashboard>("/panel/dashboard"),
            apiRequest<AccountSpendPage>(
              `/panel/accounts?limit=25&offset=${nextAccountOffset}`,
            ),
            apiRequest<TransactionPage>(
              `/panel/transactions?limit=25&offset=${nextOffset}`,
            ),
            apiRequest<Activity>("/panel/activity"),
          ]);
        setDashboard(nextDashboard);
        setAccountSpend(nextAccounts);
        setTransactions(nextTransactions);
        setActivity(nextActivity);
        setOffset(nextOffset);
        setAccountOffset(nextAccountOffset);
      } catch (loadError) {
        const status =
          loadError && typeof loadError === "object" && "status" in loadError
            ? Number(loadError.status)
            : 0;
        if (status === 403) setForbidden(true);
        else
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os dados do painel.",
          );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!sessionPending && session) void loadPanel();
    if (!sessionPending && !session) setLoading(false);
  }, [session, sessionPending, loadPanel]);

  useEffect(() => {
    if (!lookup) return;
    const activePlan: PlanSelection =
      lookup.access.status === "active" &&
      (lookup.access.plan === "monthly" ||
        lookup.access.plan === "lifetime" ||
        lookup.access.plan === "aether")
        ? lookup.access.plan
        : "none";
    setPlan(activePlan);
    setExpiresAt(asLocalDateTime(lookup.access.expiresAt));
    setUnlimited(lookup.access.serverLimitUnlimited);
    const limit =
      lookup.access.serverLimitOverride ?? lookup.access.defaultServerLimit;
    setServerLimit(limit ? String(limit) : "");
  }, [lookup]);

  async function lookupAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupLoading(true);
    setNotice("");
    setError("");
    setLookup(null);
    try {
      const result = await apiRequest<AccountDetails>(
        "/panel/accounts/lookup",
        {
          method: "POST",
          body: JSON.stringify({ identifier }),
        },
      );
      setLookup(result);
      setIdentifier(result.account.id);
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Não foi possível encontrar a conta.",
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookup) return;
    setSavingAccess(true);
    setError("");
    setNotice("");
    try {
      const date =
        plan === "monthly" && expiresAt
          ? new Date(expiresAt).toISOString()
          : null;
      await apiRequest("/panel/accounts/access", {
        method: "POST",
        body: JSON.stringify({
          identifier: lookup.account.id,
          plan,
          expiresAt: date,
          serverLimit:
            unlimited || plan === "none" ? null : Number(serverLimit),
          unlimited: plan !== "none" && unlimited,
        }),
      });
      const refreshed = await apiRequest<AccountDetails>(
        "/panel/accounts/lookup",
        {
          method: "POST",
          body: JSON.stringify({ identifier: lookup.account.id }),
        },
      );
      setLookup(refreshed);
      setNotice(
        "Acesso atualizado. A alteração também foi registrada no log do painel.",
      );
      void loadPanel(offset, true, accountOffset);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o plano.",
      );
    } finally {
      setSavingAccess(false);
    }
  }

  const chartMax = Math.max(
    1,
    ...(dashboard?.monthlyRevenue.map((month) => month.amount) ?? []),
  );
  const planRevenueMax = Math.max(
    1,
    ...(dashboard?.revenueByPlan.map((item) => item.amount) ?? []),
  );

  return (
    <main
      className="relative z-10 mx-auto min-h-screen w-full max-w-7xl px-4 pb-32 pt-20 sm:px-6 sm:pt-24 lg:px-8"
      aria-labelledby="panel-title"
    >
      <header className="mx-auto mb-7 max-w-6xl border-b-2 border-outline/50 pb-5">
        <a
          href="/account"
          className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-accent-soft hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-outline-strong"
        >
          <TbArrowLeft aria-hidden="true" size={16} />
          Voltar à conta
        </a>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="grid size-12 place-items-center border-2 border-outline-strong/45 bg-surface-raised text-accent-soft shadow-[inset_0_0_0_3px_color-mix(in_srgb,var(--site-background)_70%,transparent),0_4px_0_var(--site-shadow)]">
            <TbChartBar size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
              PluginsX / controle do proprietário
            </p>
            <h1
              id="panel-title"
              className="font-minecraft-text text-2xl font-black text-white sm:text-3xl"
            >
              Painel de vendas
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void loadPanel(offset, true, accountOffset)}
            disabled={loading || refreshing}
            className="ml-auto inline-flex min-h-10 items-center gap-2 border border-outline/40 bg-surface px-3 text-xs font-semibold text-white/75 transition hover:border-outline-strong/55 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:opacity-50"
          >
            {refreshing ? (
              <TbLoader2
                size={15}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <TbRefresh size={15} aria-hidden="true" />
            )}
            Atualizar dados
          </button>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Receita confirmada, cobranças recorrentes, compras por conta e
          controles de acesso. Nenhuma chave de licença é exibida neste painel.
        </p>
      </header>

      {sessionPending || loading ? (
        <section
          aria-live="polite"
          className="mx-auto grid min-h-64 max-w-6xl place-items-center border border-outline/30 bg-surface text-sm text-white/55"
        >
          <span className="flex items-center gap-2">
            <TbLoader2 aria-hidden="true" className="animate-spin" />
            Carregando painel e vendas…
          </span>
        </section>
      ) : !session ? (
        <section className="mx-auto grid min-h-64 max-w-3xl place-items-center border border-amber-300/20 bg-surface p-6 text-center">
          <div>
            <TbShieldCheck
              size={34}
              className="mx-auto text-amber-200"
              aria-hidden="true"
            />
            <h2 className="font-minecraft-text mt-3 text-xl font-bold text-white">
              Entre para continuar
            </h2>
            <p className="mt-2 text-sm text-white/55">
              O painel exige uma sessão de proprietário.
            </p>
            <a
              href="/account?returnTo=%2Fpanel"
              className="font-minecraft-text mt-5 inline-flex min-h-11 items-center border-b-4 border-accent-edge bg-accent-strong px-5 text-xs font-bold text-white"
            >
              Acessar conta
            </a>
          </div>
        </section>
      ) : forbidden ? (
        <section className="mx-auto grid min-h-64 max-w-3xl place-items-center border border-red-300/20 bg-surface p-6 text-center">
          <div>
            <TbShieldCheck
              size={34}
              className="mx-auto text-red-200"
              aria-hidden="true"
            />
            <h2 className="font-minecraft-text mt-3 text-xl font-bold text-white">
              Acesso restrito
            </h2>
            <p className="mt-2 text-sm text-white/55">
              Esta conta não tem a role owner no Better Auth.
            </p>
          </div>
        </section>
      ) : error && !dashboard ? (
        <div
          role="alert"
          className="mx-auto max-w-6xl border-l-4 border-red-300 bg-red-950/30 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </div>
      ) : dashboard && transactions && activity ? (
        <div className="mx-auto grid max-w-6xl gap-6">
          {error && (
            <div
              role="alert"
              className="border-l-4 border-red-300 bg-red-950/30 px-4 py-3 text-sm text-red-100"
            >
              {error}
            </div>
          )}
          {notice && (
            <output
              aria-live="polite"
              className="border-l-4 border-outline-strong bg-surface px-4 py-3 text-sm text-accent-soft"
            >
              {notice}
            </output>
          )}

          <div
            role="tablist"
            aria-label="Categorias do painel"
            aria-orientation="horizontal"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
          >
            {panelTabs.map(({ id, label, icon: Icon }, index) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  id={`panel-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-tabpanel-${id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`inline-flex min-h-12 items-center gap-2 border px-3 text-left text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong sm:justify-center ${
                    selected
                      ? "border-outline-strong/45 bg-surface-raised text-accent-soft shadow-[inset_0_-2px_0_var(--site-accent)]"
                      : "border-outline/20 bg-surface-deep text-white/55 hover:border-outline/45 hover:bg-surface hover:text-white/85"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          <div
            id="panel-tabpanel-overview"
            role="tabpanel"
            aria-labelledby="panel-tab-overview"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must be keyboard focusable to enter their content.
            tabIndex={0}
            className={activeTab === "overview" ? "grid gap-6" : "hidden"}
          >
            <section
              aria-label="Indicadores de vendas"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <Metric
                label="Receita aprovada"
                value={money.format(dashboard.totals.grossRevenue)}
                note={`${dashboard.totals.approvedPayments} cobranças confirmadas no histórico registrado`}
                icon={TbCurrencyReal}
              />
              <Metric
                label="Receita neste mês"
                value={money.format(dashboard.totals.thisMonthRevenue)}
                note={`${dashboard.totals.thisMonthPayments} pagamentos aprovados`}
                icon={TbChartBar}
              />
              <Metric
                label="Mensalidades ativas"
                value={String(dashboard.totals.activePaidSubscriptions)}
                note={`MRR atual: ${money.format(dashboard.totals.monthlyRecurringRevenue)}`}
                icon={TbActivity}
              />
              <Metric
                label="Contas com vendas"
                value={String(dashboard.totals.accountsWithSales)}
                note="Contas com ao menos uma cobrança aprovada"
                icon={TbUsers}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.75fr)]">
              <article className="border border-outline/30 bg-surface p-4 shadow-[0_4px_0_var(--site-shadow)] sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                      Últimos 12 meses
                    </p>
                    <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                      Receita mensal
                    </h2>
                  </div>
                  <span className="text-[10px] text-white/40">
                    Somente cobranças aprovadas
                  </span>
                </div>
                <div
                  role="img"
                  aria-label="Gráfico de receita aprovada por mês nos últimos doze meses"
                  className="mt-6 grid h-48 grid-cols-12 items-end gap-1 border-b border-white/10 px-0.5 sm:gap-2 sm:px-1"
                >
                  {dashboard.monthlyRevenue.map((month) => {
                    const height =
                      month.amount === 0
                        ? 3
                        : Math.max((month.amount / chartMax) * 100, 5);
                    return (
                      <div
                        key={month.month}
                        className="group flex h-full min-w-0 flex-col items-center justify-end gap-2"
                      >
                        <span className="pointer-events-none hidden whitespace-nowrap rounded border border-white/10 bg-canvas px-2 py-1 text-[9px] text-white group-hover:block">
                          {money.format(month.amount)}
                        </span>
                        <div
                          className="w-full bg-accent shadow-[0_0_14px_color-mix(in_srgb,var(--site-accent)_17%,transparent)]"
                          style={{ height: `${height}%` }}
                        />
                        <span className="pb-2 text-[7px] uppercase tracking-[-0.04em] text-white/40 sm:text-[9px] sm:tracking-normal">
                          {monthLabel(month.month)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] text-white/40">
                  O gráfico considera pagamentos individuais recebidos desde a
                  ativação do registro financeiro. Cobranças antigas disponíveis
                  no Mercado Pago podem não estar no histórico importado.
                </p>
              </article>

              <article className="border border-outline/30 bg-surface p-4 shadow-[0_4px_0_var(--site-shadow)] sm:p-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                  Mix de receita
                </p>
                <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                  Por produto
                </h2>
                <div className="mt-5 grid gap-4">
                  {dashboard.revenueByPlan.length ? (
                    dashboard.revenueByPlan.map((item) => (
                      <div key={item.plan}>
                        <div className="mb-1.5 flex justify-between gap-3 text-xs">
                          <span className="font-semibold text-white/75">
                            {item.label}
                          </span>
                          <strong className="text-white">
                            {money.format(item.amount)}
                          </strong>
                        </div>
                        <div className="h-2 bg-white/10">
                          <div
                            className="h-full bg-accent"
                            style={{
                              width: `${Math.max((item.amount / planRevenueMax) * 100, 2)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[9px] text-white/35">
                          {item.count} cobranças aprovadas
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/45">
                      Nenhuma cobrança registrada ainda.
                    </p>
                  )}
                </div>
              </article>
            </section>
          </div>

          <div
            id="panel-tabpanel-coupons"
            role="tabpanel"
            aria-labelledby="panel-tab-coupons"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must be keyboard focusable to enter their content.
            tabIndex={0}
            className={activeTab === "coupons" ? "block" : "hidden"}
          >
            <CouponManager />
          </div>

          <div
            id="panel-tabpanel-accounts"
            role="tabpanel"
            aria-labelledby="panel-tab-accounts"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must be keyboard focusable to enter their content.
            tabIndex={0}
            className={activeTab === "accounts" ? "grid gap-6" : "hidden"}
          >
            <section className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Contas
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                    Gastos por conta
                  </h2>
                </div>
                <span className="text-[10px] text-white/40">
                  {accountSpend?.total ?? 0} contas com pagamentos aprovados
                </span>
              </div>
              <div className="grid gap-2 p-3 lg:hidden">
                {accountSpend?.items.map((account) => (
                  <article
                    key={account.userId}
                    className="border border-white/10 bg-canvas p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold text-white">
                          {account.account?.name || "Conta não localizada"}
                        </h3>
                        <p className="mt-1 break-all text-[10px] leading-4 text-white/40">
                          {account.account?.email || account.userId}
                        </p>
                      </div>
                      <strong className="shrink-0 text-sm text-accent-soft">
                        {money.format(account.spent)}
                      </strong>
                    </div>
                    <div className="mt-3 grid gap-2 border-t border-white/[0.06] pt-3">
                      {account.products.map((product) => (
                        <div
                          key={product.plan}
                          className="flex items-start justify-between gap-3 text-[10px]"
                        >
                          <span className="min-w-0 text-white/70">
                            {product.label}
                            <span className="ml-1 text-white/35">
                              ({product.paymentCount} cobranças)
                            </span>
                          </span>
                          <strong className="shrink-0 text-white/65">
                            {money.format(product.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-white/40">
                      {account.paymentCount} cobranças aprovadas
                    </p>
                  </article>
                ))}
                {!accountSpend?.items.length && (
                  <p className="px-2 py-8 text-center text-xs text-white/45">
                    Nenhuma conta com cobrança aprovada registrada.
                  </p>
                )}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[46rem] text-left text-xs">
                  <thead className="text-[9px] uppercase tracking-[0.14em] text-white/40">
                    <tr>
                      <th className="px-4 py-3">Conta</th>
                      <th className="px-4 py-3">Produtos comprados</th>
                      <th className="px-4 py-3">Cobranças</th>
                      <th className="px-4 py-3 text-right">Total gasto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {accountSpend?.items.map((account) => (
                      <tr
                        key={account.userId}
                        className="align-top hover:bg-white/[0.025]"
                      >
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-white">
                            {account.account?.name || "Conta não localizada"}
                          </span>
                          <span className="mt-1 block text-[10px] text-white/40">
                            {account.account?.email || account.userId}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="grid gap-1.5">
                            {account.products.map((product) => (
                              <div
                                key={product.plan}
                                className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px]"
                              >
                                <span className="text-white/70">
                                  {product.label}{" "}
                                  <span className="text-white/35">
                                    · {product.paymentCount} cobranças
                                  </span>
                                </span>
                                <strong className="text-white/65">
                                  {money.format(product.amount)}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/55">
                          {account.paymentCount}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-accent-soft">
                          {money.format(account.spent)}
                        </td>
                      </tr>
                    ))}
                    {accountSpend?.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-10 text-center text-white/45"
                        >
                          Nenhuma conta com cobrança aprovada registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
                <span className="text-[10px] text-white/40">
                  {accountSpend?.total
                    ? `${accountOffset + 1}–${Math.min(accountOffset + (accountSpend?.items.length ?? 0), accountSpend.total)} de ${accountSpend.total}`
                    : "Sem contas"}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Contas anteriores"
                    disabled={accountOffset <= 0 || refreshing}
                    onClick={() =>
                      void loadPanel(
                        offset,
                        true,
                        Math.max(0, accountOffset - 25),
                      )
                    }
                    className="grid size-9 place-items-center border border-white/10 text-white/70 disabled:opacity-30"
                  >
                    <TbChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Próximas contas"
                    disabled={
                      !accountSpend ||
                      accountOffset + 25 >= accountSpend.total ||
                      refreshing
                    }
                    onClick={() =>
                      void loadPanel(offset, true, accountOffset + 25)
                    }
                    className="grid size-9 place-items-center border border-white/10 text-white/70 disabled:opacity-30"
                  >
                    <TbChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div
            id="panel-tabpanel-access"
            role="tabpanel"
            aria-labelledby="panel-tab-access"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must be keyboard focusable to enter their content.
            tabIndex={0}
            className={activeTab === "access" ? "grid gap-4" : "hidden"}
          >
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
              <article className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
                <div className="border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Acesso e capacidade
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                    Gerenciar conta
                  </h2>
                </div>
                <div className="p-4 sm:p-5">
                  <form
                    onSubmit={lookupAccount}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <label
                      className="sr-only"
                      htmlFor="panel-account-identifier"
                    >
                      ID ou e-mail da conta
                    </label>
                    <input
                      id="panel-account-identifier"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      placeholder="ID MongoDB ou e-mail"
                      className="min-h-11 min-w-0 flex-1 border border-outline/40 bg-canvas px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-outline-strong"
                    />
                    <button
                      type="submit"
                      disabled={lookupLoading || !identifier.trim()}
                      className="font-minecraft-text inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {lookupLoading ? (
                        <TbLoader2
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <TbSearch aria-hidden="true" />
                      )}
                      Buscar conta
                    </button>
                  </form>
                  {lookup && (
                    <div className="mt-5 border-t border-white/10 pt-5">
                      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">
                            {lookup.account.name}
                          </p>
                          <p className="mt-1 text-xs text-white/50">
                            {lookup.account.email}{" "}
                            <span className="mx-1 text-white/20">·</span> ID{" "}
                            {lookup.account.id}
                          </p>
                          <p className="mt-1 text-[10px] text-white/35">
                            Gasto confirmado:{" "}
                            {money.format(lookup.spending.total)} ·{" "}
                            {lookup.spending.approvedPayments} pagamentos
                          </p>
                        </div>
                        <span className="border border-outline/30 px-2 py-1 text-[9px] uppercase tracking-wider text-white/45">
                          {lookup.account.role}
                        </span>
                      </div>
                      {error && (
                        <p
                          role="alert"
                          className="mb-4 border-l-4 border-red-300 bg-red-950/25 px-3 py-2 text-xs text-red-100"
                        >
                          {error}
                        </p>
                      )}
                      {notice && (
                        <output
                          aria-live="polite"
                          className="mb-4 border-l-4 border-outline-strong bg-surface px-3 py-2 text-xs text-accent-soft"
                        >
                          {notice}
                        </output>
                      )}
                      <form onSubmit={savePlan} className="grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="panel-plan"
                              className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
                            >
                              Plano
                            </label>
                            <select
                              id="panel-plan"
                              value={plan}
                              onChange={(event) => {
                                const nextPlan = event.target
                                  .value as PlanSelection;
                                setPlan(nextPlan);
                                if (nextPlan !== "none") {
                                  setServerLimit(
                                    String(
                                      lookup.access.planServerLimits[nextPlan],
                                    ),
                                  );
                                }
                              }}
                              className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong"
                            >
                              <option value="none">Sem acesso pago</option>
                              <option value="monthly">Creeper · mensal</option>
                              <option value="lifetime">
                                Ender Dragon · vitalício
                              </option>
                              <option value="aether">Aether · vitalício</option>
                            </select>
                          </div>
                          {plan === "monthly" && (
                            <div>
                              <label
                                htmlFor="panel-expires"
                                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
                              >
                                Acesso até
                              </label>
                              <input
                                id="panel-expires"
                                type="datetime-local"
                                required
                                value={expiresAt}
                                onChange={(event) =>
                                  setExpiresAt(event.target.value)
                                }
                                className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong"
                              />
                            </div>
                          )}
                        </div>
                        <fieldset
                          disabled={plan === "none"}
                          className="grid gap-3 border border-outline/25 bg-surface-deep p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                        >
                          <div>
                            <label
                              htmlFor="panel-server-limit"
                              className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/50"
                            >
                              Limite de servidores
                            </label>
                            <input
                              id="panel-server-limit"
                              type="number"
                              min={1}
                              max={1_000_000}
                              disabled={plan === "none" || unlimited}
                              value={serverLimit}
                              onChange={(event) =>
                                setServerLimit(event.target.value)
                              }
                              className="min-h-11 w-full border border-outline/40 bg-canvas px-3 text-sm text-white outline-none focus:border-outline-strong disabled:opacity-45"
                            />
                          </div>
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 border border-outline/30 px-3 text-xs text-white/75">
                            <input
                              type="checkbox"
                              checked={unlimited}
                              disabled={plan === "none"}
                              onChange={(event) =>
                                setUnlimited(event.target.checked)
                              }
                              className="size-4 accent-[#8bc34a]"
                            />
                            Ilimitado
                          </label>
                        </fieldset>
                        {lookup.access.hasProviderSubscription &&
                          plan !== "monthly" && (
                            <p className="border-l-4 border-amber-300 bg-amber-950/20 px-3 py-2 text-[10px] leading-5 text-amber-100">
                              Esta conta tem uma assinatura Creeper no Mercado
                              Pago. Ao mudar ou remover o plano, o painel também
                              cancela a renovação externa.
                            </p>
                          )}
                        <button
                          type="submit"
                          disabled={
                            savingAccess ||
                            (plan !== "none" && !unlimited && !serverLimit)
                          }
                          className="font-minecraft-text inline-flex min-h-11 items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:border-outline disabled:bg-disabled"
                        >
                          {savingAccess ? (
                            <TbLoader2
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <TbCheck aria-hidden="true" />
                          )}
                          Aplicar acesso
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </article>

              <article className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
                <div className="border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Histórico da conta
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                    Compras e cobranças
                  </h2>
                </div>
                <div className="max-h-[31rem] overflow-auto p-3 sm:p-4">
                  {!lookup ? (
                    <p className="py-8 text-center text-xs text-white/40">
                      Busque uma conta para ver o histórico financeiro.
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 px-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">
                        Cobranças
                      </p>
                      {lookup.transactions.length ? (
                        lookup.transactions.map((transaction, index) => (
                          <div
                            key={`${transaction.reference}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] py-3 text-xs"
                          >
                            <div>
                              <p className="font-semibold text-white/80">
                                {transaction.product}
                              </p>
                              <p className="mt-1 text-[9px] text-white/40">
                                {formatDate(transaction.paidAt)} ·{" "}
                                {statusLabel(transaction.status)}
                              </p>
                              {transaction.couponCode && (
                                <p className="mt-1 text-[9px] text-accent-soft">
                                  Cupom {transaction.couponCode} · −
                                  {money.format(transaction.discountAmount)}
                                </p>
                              )}
                            </div>
                            <strong className="text-accent-soft">
                              {money.format(transaction.amount)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="py-3 text-xs text-white/40">
                          Nenhuma cobrança no histórico registrado.
                        </p>
                      )}
                      <p className="mb-2 mt-5 px-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">
                        Pedidos
                      </p>
                      {lookup.orders.length ? (
                        lookup.orders.map((order) => (
                          <div
                            key={order.reference}
                            className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] py-3 text-xs"
                          >
                            <div>
                              <p className="font-semibold text-white/80">
                                {order.product}
                              </p>
                              <p className="mt-1 text-[9px] text-white/40">
                                {formatDate(order.createdAt)} ·{" "}
                                {statusLabel(order.status)}
                              </p>
                              {order.couponCode && (
                                <p className="mt-1 text-[9px] text-accent-soft">
                                  Cupom {order.couponCode} · −
                                  {money.format(order.discountAmount)}
                                </p>
                              )}
                            </div>
                            <strong className="text-white/65">
                              {money.format(order.amount)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="py-3 text-xs text-white/40">
                          Nenhum pedido localizado.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </article>
            </section>
          </div>

          <div
            id="panel-tabpanel-transactions"
            role="tabpanel"
            aria-labelledby="panel-tab-transactions"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must be keyboard focusable to enter their content.
            tabIndex={0}
            className={activeTab === "transactions" ? "grid gap-4" : "hidden"}
          >
            <section className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Financeiro
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                    Todas as cobranças
                  </h2>
                </div>
                <span className="text-[10px] text-white/40">
                  {transactions.total} no livro de pagamentos
                </span>
              </div>
              <div className="grid gap-2 p-3 lg:hidden">
                {transactions.items.map((transaction, index) => (
                  <article
                    key={`${transaction.purchaseReference}-${index}-mobile`}
                    className="border border-white/10 bg-canvas p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] text-white/45">
                          {formatDate(transaction.paidAt)}
                        </p>
                        <h3 className="mt-1 break-words text-sm font-semibold text-white/85">
                          {transaction.product}
                        </h3>
                      </div>
                      <strong className="shrink-0 text-sm text-white">
                        {money.format(transaction.amount)}
                      </strong>
                    </div>
                    <p className="mt-2 break-words text-xs text-white/65">
                      {transaction.account?.name ?? "Conta não localizada"}
                    </p>
                    {transaction.couponCode && (
                      <p className="mt-1 text-[10px] text-accent-soft">
                        Cupom {transaction.couponCode} · −
                        {money.format(transaction.discountAmount)}
                      </p>
                    )}
                    <p className="mt-0.5 break-all text-[10px] text-white/35">
                      {transaction.account?.email ?? transaction.userId}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                      <span
                        className={`inline-flex border px-2 py-1 text-[9px] ${statusStyle(transaction.status)}`}
                      >
                        {statusLabel(transaction.status)}
                      </span>
                      <span className="max-w-full break-all font-mono text-[9px] text-white/30">
                        {transaction.purchaseReference}
                      </span>
                    </div>
                  </article>
                ))}
                {transactions.items.length === 0 && (
                  <p className="px-2 py-8 text-center text-xs text-white/45">
                    Nenhuma cobrança registrada.
                  </p>
                )}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[47rem] text-left text-xs">
                  <thead className="text-[9px] uppercase tracking-[0.14em] text-white/40">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Conta</th>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {transactions.items.map((transaction, index) => (
                      <tr
                        key={`${transaction.purchaseReference}-${index}`}
                        className="hover:bg-white/[0.025]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-white/45">
                          {formatDate(transaction.paidAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block text-white/75">
                            {transaction.account?.name ??
                              "Conta não localizada"}
                          </span>
                          <span className="text-[9px] text-white/35">
                            {transaction.account?.email ?? transaction.userId}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/65">
                          {transaction.product}
                          {transaction.couponCode && (
                            <span className="mt-1 block text-[9px] text-accent-soft">
                              {transaction.couponCode} · −
                              {money.format(transaction.discountAmount)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex border px-2 py-1 text-[9px] ${statusStyle(transaction.status)}`}
                          >
                            {statusLabel(transaction.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-white">
                          {money.format(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
                <span className="text-[10px] text-white/40">
                  {transactions.total
                    ? `${offset + 1}–${Math.min(offset + transactions.items.length, transactions.total)} de ${transactions.total}`
                    : "Sem cobranças"}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Cobranças anteriores"
                    disabled={offset <= 0}
                    onClick={() =>
                      void loadPanel(
                        Math.max(0, offset - 25),
                        true,
                        accountOffset,
                      )
                    }
                    className="grid size-9 place-items-center border border-white/10 text-white/70 disabled:opacity-30"
                  >
                    <TbChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Próximas cobranças"
                    disabled={offset + 25 >= transactions.total}
                    onClick={() =>
                      void loadPanel(offset + 25, true, accountOffset)
                    }
                    className="grid size-9 place-items-center border border-white/10 text-white/70 disabled:opacity-30"
                  >
                    <TbChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>

            <p className="flex items-center gap-2 text-[10px] leading-5 text-white/35">
              <TbClockHour4 size={14} aria-hidden="true" />
              Mensalidades ativas exibem o valor recorrente registrado na
              assinatura do Mercado Pago. Cobranças anteriores à ativação do
              livro podem não ter todos os ciclos históricos.
            </p>
          </div>

          <div
            id="panel-tabpanel-audit"
            role="tabpanel"
            aria-labelledby="panel-tab-audit"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Tab panels must be keyboard focusable to enter their content.
            tabIndex={0}
            className={activeTab === "audit" ? "grid gap-4" : "hidden"}
          >
            <section className="grid gap-4 xl:grid-cols-2">
              <article className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
                <div className="border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Auditoria de acesso
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                    Alterações de plano
                  </h2>
                </div>
                <div className="max-h-80 overflow-auto px-4">
                  {activity.planChanges.length ? (
                    activity.planChanges.map((log) => (
                      <div
                        key={`${log.targetUserId}-${log.createdAt}`}
                        className="border-b border-white/[0.06] py-3 text-xs"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-semibold text-white/75">
                            {log.targetEmail}
                          </p>
                          <span
                            className={`border px-2 py-0.5 text-[9px] ${statusStyle(log.status)}`}
                          >
                            {statusLabel(log.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-white/45">
                          {planName(log.before.plan)} →{" "}
                          {planName(log.after.plan)} · por {log.actorEmail}
                        </p>
                        <p className="mt-1 text-[9px] text-white/35">
                          {formatDate(log.createdAt)} · limite{" "}
                          {log.after.serverLimitUnlimited
                            ? "ilimitado"
                            : (log.after.serverLimitOverride ?? "padrão")}
                          {log.after.expiresAt
                            ? ` · até ${formatDate(log.after.expiresAt)}`
                            : ""}
                        </p>
                        {log.error && (
                          <p className="mt-1 text-[9px] text-red-200">
                            {log.error}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-xs text-white/40">
                      Nenhuma alteração de plano registrada.
                    </p>
                  )}
                </div>
              </article>
              <article className="border border-outline/30 bg-surface shadow-[0_4px_0_var(--site-shadow)]">
                <div className="border-b border-outline/25 bg-surface-raised px-4 py-3 sm:px-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
                    Notificações de pagamento
                  </p>
                  <h2 className="font-minecraft-text mt-1 text-lg font-bold text-white">
                    Logs do Mercado Pago
                  </h2>
                </div>
                <div className="max-h-80 overflow-auto px-4">
                  {activity.paymentEvents.length ? (
                    activity.paymentEvents.map((event) => (
                      <div
                        key={event.eventId}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] py-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-white/70">
                            {event.type}
                          </p>
                          <p className="mt-1 text-[9px] text-white/35">
                            Ref. {event.resourceId} ·{" "}
                            {formatDate(event.receivedAt)}
                          </p>
                        </div>
                        <span
                          className={`border px-2 py-0.5 text-[9px] ${statusStyle(event.status)}`}
                        >
                          {statusLabel(event.status)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-xs text-white/40">
                      Nenhuma notificação registrada.
                    </p>
                  )}
                </div>
              </article>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  TbArrowLeft,
  TbBlocks,
  TbBrandDiscord,
  TbBrandGithub,
  TbCheck,
  TbChevronRight,
  TbCopy,
  TbEye,
  TbEyeOff,
  TbLoader2,
  TbPick,
  TbRefresh,
  TbShieldCheck,
  TbSparkles,
  TbUserCircle,
} from "react-icons/tb";

import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { useHydrated } from "@/hooks/useHydrated";
import { useLoadingDelay } from "@/hooks/useLoadingDelay";
import { apiUrl, authClient } from "@/lib/auth-client";

type ActivationState =
  | "PENDING"
  | "ACTIVE"
  | "INACTIVE"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "ERROR";

type ServerActivation = {
  id: string;
  serverId: string;
  name: string;
  minecraftVersion: string;
  implementation: string;
  implementationVersion: string;
  pluginVersion: string;
  state: ActivationState;
  createdAt: string;
  lastValidatedAt: string | null;
  connection: string;
};

type AccountLicense = {
  id: string;
  tier: string;
  valid: boolean;
  plan: "trial" | "monthly" | "lifetime" | "aether" | null;
  expiresAt?: string | null;
  used: number;
  limit: number | null;
  unlimited?: boolean;
  servers: ServerActivation[];
};

type Feedback = { tone: "success" | "error"; text: string };

const portalTiles = Array.from({ length: 16 }, (_, index) => index);

const serverStates: Record<
  ActivationState,
  { label: string; classes: string }
> = {
  PENDING: {
    label: "Aguardando aprovação",
    classes: "border-amber-200/25 bg-amber-300/10 text-amber-100",
  },
  ACTIVE: {
    label: "Autorizado",
    classes: "border-[#a6cf74]/30 bg-[#a6cf74]/10 text-[#d2efb2]",
  },
  INACTIVE: {
    label: "Inativo",
    classes: "border-white/15 bg-white/5 text-white/65",
  },
  REJECTED: {
    label: "Rejeitado",
    classes: "border-red-200/20 bg-red-950/35 text-red-100/80",
  },
  EXPIRED: {
    label: "Expirado",
    classes: "border-red-200/20 bg-red-950/35 text-red-100/80",
  },
  REVOKED: {
    label: "Revogado",
    classes: "border-red-200/20 bg-red-950/35 text-red-100/80",
  },
  ERROR: {
    label: "Erro",
    classes: "border-red-200/20 bg-red-950/35 text-red-100/80",
  },
};

function formatTrialCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getPlanName(license: AccountLicense) {
  if (license.plan === "trial") return "Trial";
  if (license.plan === "monthly") return "Creeper";
  if (license.plan === "lifetime") return "Ender Dragon";
  if (license.plan === "aether") return "Aether";
  return license.tier === "plus" ? "Plus" : "Standard";
}

function getLicenseTheme(license: AccountLicense) {
  if (license.plan === "lifetime") {
    return {
      card: "border-[#71649e]/55 shadow-[0_5px_0_#090811,0_0_28px_rgba(117,96,170,0.12)]",
      header: "border-b border-[#71649e]/40 bg-[#171522]",
      rail: "bg-[#a18ce0]",
      icon: TbEye,
      iconFrame: "border-[#a18ce0]/45 bg-[#55447d]/25 text-[#dfd3ff]",
      eyebrow: "text-[#c0aef7]",
      title: "text-[#f5f1ff]",
      productTag: "border-[#a18ce0]/35 bg-[#332a4b]/65 text-[#e2d8ff]",
      productLabel: "THE END · EDIÇÃO VITALÍCIA",
      validBadge: "border-[#a18ce0]/35 bg-[#332a4b]/65 text-[#e2d8ff]",
      validDot: "bg-[#b4a0f0]",
      keyText: "text-[#ded6ff]",
      capacityTrack: "bg-[#332e40]",
      activeSlot: "bg-[#b4a0f0]",
      progressFill: "bg-[#a18ce0]",
      worldPanel: "border-t border-[#71649e]/35 bg-[#111019]",
      worldAccent: "text-[#c0aef7]",
      worldCount: "border-[#a18ce0]/25 bg-[#332a4b]/45 text-[#e2d8ff]",
    };
  }

  if (license.plan === "aether") {
    return {
      card: "border-[#67e8f9]/45 shadow-[0_5px_0_#0c1e31,0_0_34px_rgba(34,211,238,0.12)]",
      header: "border-b border-[#67e8f9]/25 bg-[#12232e]",
      rail: "bg-[#67d7df]",
      icon: TbSparkles,
      iconFrame: "border-[#67e8f9]/40 bg-[#0e7490]/20 text-[#a5f3fc]",
      eyebrow: "text-[#a5f3fc]",
      title: "text-[#effaff]",
      productTag: "border-[#a78bfa]/35 bg-[#4c1d95]/25 text-[#ddd6fe]",
      productLabel: "AETHER · PLANO CELESTE",
      validBadge: "border-[#67e8f9]/35 bg-[#0e7490]/20 text-[#a5f3fc]",
      validDot: "bg-[#67e8f9]",
      keyText: "text-[#cffafe]",
      capacityTrack: "bg-[#173c52]",
      activeSlot: "bg-[#67e8f9]",
      progressFill: "bg-[#67d7df]",
      worldPanel: "border-t border-[#67e8f9]/25 bg-[#0e1926]",
      worldAccent: "text-[#a5f3fc]",
      worldCount: "border-[#67e8f9]/25 bg-[#0e7490]/15 text-[#cffafe]",
    };
  }

  return {
    card: "border-[#718667]/35 shadow-[0_4px_0_#080d09]",
    header: "border-b border-[#8bc34a]/25 bg-[#172019]",
    rail: "bg-[#8bc34a]",
    icon: TbBlocks,
    iconFrame: "border-[#a6cf74]/35 bg-[#a6cf74]/10 text-[#c9e9a8]",
    eyebrow: "text-[#a6cf74]",
    title: "text-white",
    productTag: "border-[#8bc34a]/30 bg-[#8bc34a]/10 text-[#d9f2bd]",
    productLabel:
      license.plan === "trial"
        ? "TRIAL · ACESSO TEMPORÁRIO"
        : license.plan === "monthly"
          ? "CREEPER · MENSAL"
          : "LICENÇA PLUS",
    validBadge: "border-[#8bc34a]/30 bg-[#8bc34a]/10 text-[#d9f2bd]",
    validDot: "bg-[#8bc34a]",
    keyText: "text-[#d9f2bd]",
    capacityTrack: "bg-white/10",
    activeSlot: "bg-[#8bc34a]",
    progressFill: "bg-[#8bc34a]",
    worldPanel: "border-t border-[#718667]/25 bg-[#111a16]/70",
    worldAccent: "text-[#a6cf74]",
    worldCount: "border-white/10 bg-black/20 text-white/65",
  };
}

function getSafeReturnTo(value: string | null, origin: string) {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/account";
  }

  try {
    const target = new URL(value, origin);
    if (target.origin !== origin) return "/account";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/account";
  }
}

function TrialCountdown({
  licenseId,
  expiresAt,
  onExpired,
}: {
  licenseId: string;
  expiresAt: string;
  onExpired: (licenseId: string) => void;
}) {
  const [clockNow, setClockNow] = useState<number | null>(null);
  const expiration = Date.parse(expiresAt);

  useEffect(() => {
    if (!Number.isFinite(expiration)) return;

    let interval = 0;
    const updateClock = () => {
      const now = Date.now();
      setClockNow(now);
      if (now >= expiration) {
        window.clearInterval(interval);
        onExpired(licenseId);
      }
    };

    interval = window.setInterval(updateClock, 1000);
    updateClock();
    return () => window.clearInterval(interval);
  }, [expiration, licenseId, onExpired]);

  if (!Number.isFinite(expiration))
    return <>Validade temporária não disponível.</>;
  if (clockNow === null) return <>Calculando tempo restante…</>;
  if (expiration <= clockNow) return <>Este acesso temporário expirou.</>;

  return (
    <span role="timer" aria-live="off">
      Expira em{" "}
      {formatTrialCountdown(Math.ceil((expiration - clockNow) / 1000))}
    </span>
  );
}

function LicensesPanel() {
  const [licenses, setLicenses] = useState<AccountLicense[]>([]);
  const [expiredTrials, setExpiredTrials] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyServerId, setBusyServerId] = useState("");
  const [busyAction, setBusyAction] = useState<
    "approve" | "reject" | "remove" | "delete" | ""
  >("");
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [busyKeyRef, setBusyKeyRef] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/license/servers", {
        credentials: "include",
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error("Não foi possível carregar as licenças agora.");
      }
      if (!Array.isArray(result)) {
        throw new Error(
          "A resposta de licenças está em um formato inesperado.",
        );
      }

      setLicenses(result as AccountLicense[]);
      setVisibleKeys({});
      setRevealedKeys({});
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "A consulta demorou demais. Tente atualizar novamente."
          : error instanceof Error
            ? error.message
            : "Não foi possível carregar as licenças agora.";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markTrialExpired = useCallback((licenseId: string) => {
    setExpiredTrials((expired) => {
      if (expired.has(licenseId)) return expired;
      return new Set(expired).add(licenseId);
    });
  }, []);

  async function requestLicenseKey(licenseRef: string) {
    const response = await fetch("/license/servers/key", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseRef }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.key !== "string") {
      throw new Error("Não foi possível obter esta key agora.");
    }
    return result.key as string;
  }

  async function toggleKey(licenseRef: string) {
    if (visibleKeys[licenseRef]) {
      setVisibleKeys((keys) => ({ ...keys, [licenseRef]: false }));
      setRevealedKeys((keys) => {
        const next = { ...keys };
        delete next[licenseRef];
        return next;
      });
      return;
    }

    setBusyKeyRef(licenseRef);
    setFeedback(null);
    try {
      const key =
        revealedKeys[licenseRef] ?? (await requestLicenseKey(licenseRef));
      setRevealedKeys((keys) => ({ ...keys, [licenseRef]: key }));
      setVisibleKeys((keys) => ({ ...keys, [licenseRef]: true }));
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível mostrar a key.",
      });
    } finally {
      setBusyKeyRef("");
    }
  }

  async function copyKey(licenseRef: string) {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard indisponível");
      const key = await requestLicenseKey(licenseRef);
      await navigator.clipboard.writeText(key);
      setFeedback({
        tone: "success",
        text: "Key copiada para a área de transferência.",
      });
    } catch {
      setFeedback({
        tone: "error",
        text: "Não foi possível copiar automaticamente. Mostre a key e copie manualmente.",
      });
    }
  }

  async function act(
    server: ServerActivation,
    action: "approve" | "reject" | "remove" | "delete",
  ) {
    const prompt =
      action === "delete"
        ? `Apagar o registro antigo de ${server.name}? Esta ação não pode ser desfeita.`
        : action === "remove"
          ? `Remover ${server.name}? Isso desvinculará esta instalação da licença.`
          : `${action === "approve" ? "Autorizar" : "Rejeitar"} a solicitação de ${server.name}?`;
    if (!window.confirm(prompt)) return;

    setBusyServerId(server.id);
    setBusyAction(action);
    setFeedback(null);
    try {
      const response = await fetch(`/license/servers/${server.id}/${action}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const message =
          response.status === 409
            ? "O estado do servidor mudou. Atualize a lista e tente novamente."
            : "Não foi possível concluir a operação. Atualize e tente novamente.";
        throw new Error(message);
      }

      const successMessage = {
        approve: "Servidor autorizado.",
        reject: "Solicitação rejeitada.",
        remove: "Servidor removido e autorização revogada.",
        delete: "Registro antigo apagado.",
      }[action];
      setFeedback({ tone: "success", text: successMessage });
      await refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "A operação falhou. Tente novamente.",
      });
    } finally {
      setBusyServerId("");
      setBusyAction("");
    }
  }

  const licenseCount = licenses.length;
  const usedSlots = licenses.reduce(
    (total, license) => total + license.used,
    0,
  );
  const hasUnlimitedCapacity = licenses.some((license) => license.unlimited);
  const totalSlots = licenses.reduce(
    (total, license) => total + (license.limit ?? 0),
    0,
  );
  const pendingRequests = licenses.reduce(
    (total, license) =>
      total +
      license.servers.filter((server) => server.state === "PENDING").length,
    0,
  );
  const showUnavailableMetrics =
    licenses.length === 0 && (isLoading || Boolean(loadError));

  return (
    <>
      <section
        aria-label="Resumo da conta"
        className="mb-8 grid gap-3 sm:grid-cols-3"
      >
        {[
          { label: "LICENÇAS", value: `${licenseCount}` },
          {
            label: "VAGAS RESERVADAS",
            value: `${usedSlots} / ${hasUnlimitedCapacity ? "∞" : totalSlots}`,
          },
          { label: "PEDIDOS PENDENTES", value: `${pendingRequests}` },
        ].map((metric, index) => (
          <article
            key={metric.label}
            className="relative overflow-hidden border border-[#718667]/30 bg-[#101811] px-4 py-4 shadow-[0_4px_0_#070b08]"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 w-1 ${index === 2 && pendingRequests > 0 ? "bg-amber-300" : "bg-[#8bc34a]"}`}
            />
            <p className="text-[10px] font-bold tracking-[0.18em] text-white/55">
              {metric.label}
            </p>
            <p className="font-minecraft-text mt-2 text-xl font-bold text-white">
              {showUnavailableMetrics ? "—" : metric.value}
            </p>
          </article>
        ))}
      </section>

      <section
        aria-labelledby="inventory-title"
        className="border-2 border-[#718667]/40 bg-[#111a16] shadow-[0_6px_0_#070b08]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#718667]/30 bg-[#19251b] px-4 py-4 sm:px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a6cf74]">
              Inventário de acesso
            </p>
            <h2
              id="inventory-title"
              className="font-minecraft-text mt-1 text-lg font-bold text-white sm:text-xl"
            >
              Licenças e mundos
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="inline-flex min-h-10 items-center gap-2 border border-[#718667]/40 bg-[#0c130f] px-3 text-xs font-semibold text-white/80 transition hover:border-[#a6cf74]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8] disabled:cursor-wait disabled:opacity-55"
          >
            <TbRefresh
              className={`size-4 ${isLoading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {isLoading ? "Atualizando" : "Atualizar"}
          </button>
        </div>

        <div className="p-3 sm:p-5">
          {feedback && (
            <p
              role={feedback.tone === "error" ? "alert" : "status"}
              className={`mb-4 border-l-4 px-4 py-3 text-sm ${feedback.tone === "success" ? "border-[#8bc34a] bg-[#101a12] text-[#d9f2bd]" : "border-red-300 bg-red-950/40 text-red-100"}`}
            >
              {feedback.text}
            </p>
          )}

          {isLoading && licenses.length === 0 ? (
            <div className="grid gap-3" aria-live="polite">
              <p className="text-sm text-white/65">
                Abrindo o inventário da conta…
              </p>
              <div className="h-28 animate-pulse border border-white/10 bg-black/20" />
            </div>
          ) : loadError && licenses.length === 0 ? (
            <div className="border border-red-200/15 bg-red-950/20 p-5 sm:p-6">
              <p role="alert" className="text-sm leading-6 text-red-100">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="font-minecraft-text mt-4 inline-flex min-h-11 items-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-4 text-xs font-bold text-white transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <TbRefresh size={16} aria-hidden="true" /> Tentar novamente
              </button>
            </div>
          ) : licenses.length === 0 ? (
            <div className="relative overflow-hidden border border-dashed border-[#718667]/45 bg-[#0c130f] p-5 sm:p-8">
              <div
                aria-hidden="true"
                className="absolute -right-10 -top-10 size-40 rotate-12 border-[12px] border-[#8bc34a]/10"
              />
              <div className="relative max-w-xl">
                <span className="grid size-11 place-items-center border border-[#a6cf74]/30 bg-[#a6cf74]/10 text-[#c9e9a8]">
                  <TbPick size={22} aria-hidden="true" />
                </span>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a6cf74]">
                  Inventário vazio
                </p>
                <h3 className="font-minecraft-text mt-1 text-xl font-bold text-white">
                  Seu primeiro mundo ainda não está conectado.
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Escolha um acesso e depois aprove aqui os servidores que
                  solicitarem uma vaga.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/plans"
                    className="font-minecraft-text inline-flex min-h-11 items-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-4 text-xs font-bold text-white transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Ver planos <TbChevronRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex min-h-11 items-center gap-2 border border-white/15 px-4 text-xs font-semibold text-white/75 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8]"
                  >
                    Explorar plugins{" "}
                    <TbChevronRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {loadError && (
                <p
                  role="alert"
                  className="border-l-4 border-amber-300 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
                >
                  A atualização falhou. Os dados exibidos podem estar
                  desatualizados. {loadError}
                </p>
              )}
              {licenses.map((license) => {
                const theme = getLicenseTheme(license);
                const LicenseIcon = theme.icon;
                const expiresAt = license.expiresAt
                  ? Date.parse(license.expiresAt)
                  : Number.NaN;
                const trialExpired =
                  license.plan === "trial" &&
                  (expiredTrials.has(license.id) ||
                    (Number.isFinite(expiresAt) && expiresAt <= Date.now()));
                const licenseUsable = license.valid && !trialExpired;
                const keyVisible =
                  Boolean(visibleKeys[license.id]) && !trialExpired;
                const displayLimit = license.limit ?? Math.max(license.used, 1);
                const slotCount = license.unlimited
                  ? Math.max(12, Math.min(license.used + 2, 24))
                  : Math.max(displayLimit, 1);
                const slotPercent = license.unlimited
                  ? 100
                  : displayLimit > 0
                    ? Math.min((license.used / displayLimit) * 100, 100)
                    : 0;

                return (
                  <article
                    key={license.id}
                    className={`overflow-hidden border bg-[#0c130f] ${theme.card}`}
                  >
                    <div
                      className={`relative flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5 ${theme.header}`}
                    >
                      {license.plan === "lifetime" && (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 176 88"
                          fill="none"
                          className="pointer-events-none absolute bottom-1 right-5 hidden h-[5.5rem] w-44 opacity-45 sm:block"
                        >
                          <path
                            d="M25 77V39L87 8l62 31v38H25Z"
                            fill="#211D2D"
                            stroke="#9A87D3"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M38 77V46l49-24 49 24v31"
                            stroke="#7867AA"
                            strokeWidth="1"
                            strokeDasharray="3 4"
                          />
                          <path
                            d="m87 35 20 20-20 20-20-20 20-20Z"
                            fill="#100F17"
                            stroke="#B5A2EA"
                            strokeWidth="1.5"
                          />
                          <path
                            d="m87 45 10 10-10 10-10-10 10-10Z"
                            fill="#A18CE0"
                          />
                          <path
                            d="M10 69h16m123 0h17M47 78l-8 6h96l-8-6"
                            stroke="#B7B19F"
                            strokeWidth="2"
                            strokeLinecap="square"
                          />
                          <path
                            d="m17 23 3 5 5 2-5 2-3 5-2-5-5-2 5-2 2-5Zm119 0 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z"
                            fill="#D6D0BF"
                          />
                          <circle cx="152" cy="18" r="1.5" fill="#B6A2EE" />
                          <circle cx="32" cy="15" r="1" fill="#B6A2EE" />
                        </svg>
                      )}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-1 ${theme.rail}`}
                      />
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`grid size-11 shrink-0 place-items-center border ${theme.iconFrame}`}
                        >
                          <LicenseIcon size={21} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`text-[10px] font-bold uppercase tracking-[0.18em] ${theme.eyebrow}`}
                          >
                            SpawnerX · licença
                          </p>
                          <h3
                            className={`font-minecraft-text mt-1 truncate text-base font-bold sm:text-lg ${theme.title}`}
                          >
                            {getPlanName(license)}
                          </h3>
                          <span
                            className={`mt-2 inline-flex min-h-6 items-center border px-2 text-[9px] font-bold uppercase tracking-[0.13em] ${theme.productTag}`}
                          >
                            {theme.productLabel}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex min-h-8 items-center gap-2 border px-3 text-[10px] font-bold uppercase tracking-[0.12em] ${licenseUsable ? theme.validBadge : "border-red-200/20 bg-red-950/30 text-red-100"}`}
                      >
                        <span
                          className={`size-1.5 ${licenseUsable ? theme.validDot : "bg-red-300"}`}
                          aria-hidden="true"
                        />
                        {trialExpired
                          ? "Trial expirado"
                          : license.valid
                            ? "Licença válida"
                            : "Licença inválida"}
                      </span>
                    </div>

                    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(14rem,0.85fr)]">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                          Key de acesso
                        </p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <code
                            className={`flex min-h-12 min-w-0 flex-1 select-all items-center break-all border border-white/10 bg-black/35 px-3 py-3 font-mono text-xs ${theme.keyText}`}
                          >
                            {trialExpired
                              ? "Key temporária expirada"
                              : keyVisible
                                ? revealedKeys[license.id]
                                : "••••••••••••••••••••••••••••••••"}
                          </code>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={
                                trialExpired || busyKeyRef === license.id
                              }
                              aria-label={
                                keyVisible ? "Ocultar key" : "Mostrar key"
                              }
                              aria-pressed={keyVisible}
                              onClick={() => void toggleKey(license.id)}
                              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-white/15 px-3 text-xs text-white/80 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                              {busyKeyRef === license.id ? (
                                <TbLoader2
                                  size={16}
                                  className="animate-spin"
                                  aria-hidden="true"
                                />
                              ) : keyVisible ? (
                                <TbEyeOff size={16} aria-hidden="true" />
                              ) : (
                                <TbEye size={16} aria-hidden="true" />
                              )}
                              {keyVisible
                                ? "Ocultar"
                                : trialExpired
                                  ? "Expirada"
                                  : "Mostrar"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                trialExpired || busyKeyRef === license.id
                              }
                              onClick={() => void copyKey(license.id)}
                              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-white/15 px-3 text-xs text-white/80 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                              <TbCopy size={15} aria-hidden="true" /> Copiar
                            </button>
                          </div>
                        </div>
                        <p
                          className={`mt-2 text-xs opacity-85 ${licenseUsable ? theme.eyebrow : "text-red-100/75"}`}
                        >
                          {license.plan === "trial" && license.expiresAt ? (
                            trialExpired ? (
                              "Este acesso temporário expirou."
                            ) : (
                              <TrialCountdown
                                licenseId={license.id}
                                expiresAt={license.expiresAt}
                                onExpired={markTrialExpired}
                              />
                            )
                          ) : license.unlimited ? (
                            `${license.used} vagas reservadas · capacidade ilimitada`
                          ) : (
                            `${license.used} de ${license.limit} vagas reservadas`
                          )}
                        </p>
                      </div>

                      <div className="border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-bold text-white/75">
                            Vagas de servidor
                          </span>
                          <span className="font-minecraft-text text-sm font-bold text-white">
                            {license.used}/
                            {license.unlimited ? "∞" : license.limit}
                          </span>
                        </div>
                        <meter
                          className="sr-only"
                          aria-label={
                            license.unlimited
                              ? `${license.used} vagas reservadas, capacidade ilimitada`
                              : `${license.used} de ${license.limit} vagas reservadas`
                          }
                          min={0}
                          max={
                            license.unlimited
                              ? Math.max(license.used, 1)
                              : Math.max(displayLimit, 1)
                          }
                          value={
                            license.unlimited
                              ? license.used
                              : Math.min(
                                  license.used,
                                  Math.max(displayLimit, 1),
                                )
                          }
                        />
                        <div
                          aria-hidden="true"
                          className="mt-3 grid h-2 gap-1"
                          style={{
                            gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from(
                            { length: slotCount },
                            (_, index) => index,
                          ).map((slot) => (
                            <span
                              key={slot}
                              className={
                                slot < license.used
                                  ? theme.activeSlot
                                  : theme.capacityTrack
                              }
                            />
                          ))}
                        </div>
                        <div
                          className={`mt-3 h-1 w-full ${theme.capacityTrack}`}
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full transition-[width] ${theme.progressFill}`}
                            style={{ width: `${slotPercent}%` }}
                          />
                        </div>
                        {license.expiresAt && license.plan !== "trial" && (
                          <p className="mt-3 text-xs text-white/65">
                            Válida até {formatDate(license.expiresAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className={theme.worldPanel}>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                        <div>
                          <p
                            className={`text-[10px] font-bold uppercase tracking-[0.18em] ${theme.worldAccent}`}
                          >
                            Mundos vinculados
                          </p>
                          <h4 className="font-minecraft-text mt-1 text-sm font-bold text-white">
                            Servidores
                          </h4>
                        </div>
                        <span
                          className={`border px-2.5 py-1 text-[10px] font-bold ${theme.worldCount}`}
                        >
                          {license.servers.length}{" "}
                          {license.servers.length === 1
                            ? "registro"
                            : "registros"}
                        </span>
                      </div>

                      {license.servers.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-white/65 sm:px-5">
                          Nenhum servidor solicitou uma vaga nesta licença
                          ainda.
                        </p>
                      ) : (
                        <div className="grid gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
                          {license.servers.map((server) => {
                            const state = serverStates[server.state] ?? {
                              label: "Estado desconhecido",
                              classes:
                                "border-white/15 bg-white/5 text-white/65",
                            };
                            const isBusy = busyServerId === server.id;
                            return (
                              <article
                                key={server.id}
                                className="border border-white/10 bg-black/20 p-3 sm:p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h5 className="break-words text-sm font-bold text-white">
                                      {server.name}
                                    </h5>
                                    <p className="mt-1 break-all font-mono text-[11px] text-white/65">
                                      ID {server.serverId}
                                    </p>
                                  </div>
                                  <span
                                    className={`inline-flex min-h-7 items-center border px-2.5 text-[10px] font-bold ${state.classes}`}
                                  >
                                    {state.label}
                                  </span>
                                </div>

                                <div className="mt-3 grid gap-2 border-t border-white/8 pt-3 text-xs text-white/75 sm:grid-cols-2">
                                  <p>
                                    Minecraft{" "}
                                    <strong className="text-white">
                                      {server.minecraftVersion}
                                    </strong>
                                  </p>
                                  <p>
                                    Servidor{" "}
                                    <strong className="text-white">
                                      {server.implementation}{" "}
                                      {server.implementationVersion}
                                    </strong>
                                  </p>
                                  <p>
                                    SpawnerX{" "}
                                    <strong className="text-white">
                                      {server.pluginVersion}
                                    </strong>
                                  </p>
                                  <p>
                                    Conexão{" "}
                                    <strong className="text-white">
                                      {server.connection === "UNKNOWN"
                                        ? "Sem informação"
                                        : server.connection}
                                    </strong>
                                  </p>
                                  <p className="sm:col-span-2">
                                    Última validação{" "}
                                    <strong className="text-white">
                                      {formatDate(server.lastValidatedAt)}
                                    </strong>
                                    <span className="mx-2 text-white/35">
                                      ·
                                    </span>
                                    Registrado{" "}
                                    <strong className="text-white">
                                      {formatDate(server.createdAt)}
                                    </strong>
                                  </p>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {server.state === "PENDING" && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          void act(server, "approve")
                                        }
                                        className="inline-flex min-h-10 items-center justify-center gap-2 bg-[#a6cf74] px-3 text-xs font-bold text-[#17210f] transition hover:bg-[#c0e29d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
                                      >
                                        {isBusy && busyAction === "approve" ? (
                                          <TbLoader2
                                            size={15}
                                            className="animate-spin"
                                            aria-hidden="true"
                                          />
                                        ) : (
                                          <TbCheck
                                            size={15}
                                            aria-hidden="true"
                                          />
                                        )}
                                        {isBusy && busyAction === "approve"
                                          ? "Autorizando…"
                                          : "Autorizar"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          void act(server, "reject")
                                        }
                                        className="min-h-10 border border-white/15 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8] disabled:cursor-wait disabled:opacity-50"
                                      >
                                        {isBusy && busyAction === "reject"
                                          ? "Rejeitando…"
                                          : "Rejeitar"}
                                      </button>
                                    </>
                                  )}
                                  {["PENDING", "ACTIVE"].includes(
                                    server.state,
                                  ) && (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => void act(server, "remove")}
                                      className="min-h-10 border border-red-200/20 px-3 text-xs font-semibold text-red-100/85 transition hover:bg-red-950/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-200 disabled:cursor-wait disabled:opacity-50"
                                    >
                                      {isBusy && busyAction === "remove"
                                        ? "Removendo…"
                                        : "Remover servidor"}
                                    </button>
                                  )}
                                  {[
                                    "REVOKED",
                                    "REJECTED",
                                    "EXPIRED",
                                    "ERROR",
                                    "INACTIVE",
                                  ].includes(server.state) && (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => void act(server, "delete")}
                                      className="min-h-10 border border-white/15 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8] disabled:cursor-wait disabled:opacity-50"
                                    >
                                      {isBusy && busyAction === "delete"
                                        ? "Apagando…"
                                        : "Apagar registro antigo"}
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function AccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const hasHydrated = useHydrated();
  const isSessionReady = hasHydrated && !isPending;
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [premiumWarning, setPremiumWarning] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<
    "loading" | "enabled" | "disabled" | "error"
  >("loading");
  const showLoading = useLoadingDelay(!isSessionReady);

  useEffect(() => {
    if (!apiUrl) {
      setDiscordStatus("disabled");
      return;
    }

    let active = true;
    fetch("/about/", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Provider status unavailable");
        return (await response.json()) as {
          authProviders?: { discord?: boolean };
        };
      })
      .then((result) => {
        if (active) {
          setDiscordStatus(
            result.authProviders?.discord ? "enabled" : "disabled",
          );
        }
      })
      .catch(() => {
        if (active) setDiscordStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("notice") !== "premium-key") return;

    setPremiumWarning(true);
    currentUrl.searchParams.delete("notice");
    window.history.replaceState(
      window.history.state,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
    const timeout = window.setTimeout(() => setPremiumWarning(false), 8000);
    return () => window.clearTimeout(timeout);
  }, []);

  async function signInWith(provider: "github" | "discord") {
    if (!apiUrl) {
      setError(
        "O login está temporariamente indisponível. Tente novamente mais tarde.",
      );
      return;
    }
    if (provider === "discord" && discordStatus !== "enabled") return;

    setIsSigningIn(true);
    setError("");
    const requestedReturn = new URLSearchParams(window.location.search).get(
      "returnTo",
    );
    const returnTo = getSafeReturnTo(requestedReturn, window.location.origin);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}${returnTo}`,
      });

      if (result.error) {
        setError(
          `Não foi possível iniciar o login com ${provider === "github" ? "GitHub" : "Discord"}. Tente novamente.`,
        );
        setIsSigningIn(false);
      }
    } catch {
      setError(
        `Não foi possível conectar ao ${provider === "github" ? "GitHub" : "Discord"}. Tente novamente.`,
      );
      setIsSigningIn(false);
    }
  }

  return (
    <>
      {showLoading && (
        <SiteLoadingScreen
          detail="Verificando a sessão da conta."
          stage="PORTAL · AUTENTICAÇÃO"
        />
      )}
      <main
        aria-hidden={showLoading}
        className={`relative z-10 mx-auto w-full max-w-7xl px-4 pb-28 pt-20 sm:px-6 sm:pt-24 lg:px-8 ${showLoading ? "invisible" : ""}`}
        aria-labelledby="account-title"
      >
        {premiumWarning && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-5 flex items-center justify-between gap-4 border-l-4 border-amber-300 bg-[#211b0e] px-4 py-3 text-sm text-amber-100 shadow-[0_4px_0_#070b08]"
          >
            <span>
              <strong className="font-minecraft-text mr-2">
                Login necessário
              </strong>
              Entre na conta para acessar sua key Premium.
            </span>
            <button
              type="button"
              onClick={() => setPremiumWarning(false)}
              className="min-h-9 shrink-0 px-2 font-semibold text-amber-100 underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Entendi
            </button>
          </div>
        )}

        <header className="mx-auto mb-7 max-w-6xl border-b-2 border-[#687b5a]/50 pb-5 sm:mb-8 sm:pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="grid size-12 shrink-0 place-items-center border-2 border-[#b5d58a]/45 bg-[#1b2c22] text-[#b9d59b] shadow-[inset_0_0_0_3px_rgba(10,18,12,0.7),0_4px_0_#080d09] sm:size-14">
              <TbBlocks aria-hidden="true" className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a6cf74] sm:text-xs">
                PluginsX <span className="text-white/35">/</span> Central de
                mundos
              </p>
              <h1
                id="account-title"
                className="font-minecraft-text text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl"
              >
                {session ? "Central de Mundos" : "Portal de acesso"}
              </h1>
            </div>
            {session && (
              <span className="ml-auto hidden items-center gap-2 border border-[#718667]/35 bg-[#101811] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b9d59b] sm:inline-flex">
                <span className="size-1.5 bg-[#8bc34a]" aria-hidden="true" />{" "}
                Sessão conectada
              </span>
            )}
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70 sm:ml-16">
            {session
              ? "Gerencie suas licenças e decida quais servidores podem entrar no seu mundo."
              : "Entre para administrar suas licenças e os servidores conectados ao PluginsX."}
          </p>
          <div
            aria-hidden="true"
            className="mt-5 grid h-2 grid-cols-8 overflow-hidden"
          >
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

        {!isSessionReady ? (
          <output
            className="flex min-h-56 items-center justify-center gap-3 text-sm text-white/70"
            aria-live="polite"
          >
            <TbLoader2
              className="size-5 animate-spin text-[#b4d991]"
              aria-hidden="true"
            />
            Conferindo a sessão…
          </output>
        ) : session ? (
          <div className="mx-auto max-w-6xl">
            <section className="mb-6 grid overflow-hidden border-2 border-[#718667]/40 bg-[#111a16] shadow-[0_6px_0_#070b08] md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
                {session.user.image ? (
                  <span
                    aria-hidden="true"
                    className="size-14 shrink-0 rounded-full border-2 border-[#a6cf74]/45 bg-cover bg-center shadow-[0_0_24px_rgba(166,207,116,0.15)] sm:size-16"
                    style={{ backgroundImage: `url("${session.user.image}")` }}
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center border-2 border-[#a6cf74]/30 bg-[#a6cf74]/10 text-[#c9e9a8] sm:size-16">
                    <TbUserCircle className="size-9" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a6cf74]">
                    Operador autenticado
                  </p>
                  <h2 className="font-minecraft-text mt-1 truncate text-lg font-bold text-white sm:text-xl">
                    {session.user.name}
                  </h2>
                  <p className="truncate text-sm text-white/70">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center border-t border-[#718667]/30 bg-black/15 p-4 md:border-l md:border-t-0 sm:p-5">
                <Link
                  href="/plans"
                  className="font-minecraft-text inline-flex min-h-11 w-full items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-4 text-xs font-bold text-white transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:w-auto"
                >
                  Gerenciar acesso{" "}
                  <TbChevronRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </section>

            <LicensesPanel />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-white/65">
              <p className="inline-flex items-center gap-2">
                <TbShieldCheck
                  className="size-4 text-[#b9d59b]"
                  aria-hidden="true"
                />
                Sua sessão é protegida pelo provedor escolhido.
              </p>
              <Link
                href="/"
                className="inline-flex min-h-10 items-center gap-2 font-semibold text-[#c9e9a8] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8]"
              >
                <TbArrowLeft size={15} aria-hidden="true" /> Voltar ao catálogo
              </Link>
            </div>
          </div>
        ) : (
          <section className="mx-auto grid max-w-5xl overflow-hidden border-2 border-[#718667]/40 bg-[#111a16] shadow-[0_8px_0_#070b08,0_24px_70px_-40px_rgba(35,77,45,0.75)] md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
            <div className="order-2 relative flex min-h-64 flex-col justify-between overflow-hidden border-t border-[#718667]/25 bg-[linear-gradient(145deg,#1b2c22,#111a16)] p-5 sm:p-7 md:order-1 md:border-r md:border-t-0">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 -right-8 grid size-56 rotate-12 grid-cols-4 gap-2 opacity-20"
              >
                {portalTiles.map((tile) => (
                  <span
                    key={tile}
                    className={
                      tile % 3 === 0
                        ? "border border-[#b9d59b]"
                        : "bg-[#8bc34a]/20"
                    }
                  />
                ))}
              </div>
              <Link
                href="/"
                className="relative inline-flex min-h-10 w-fit items-center gap-2 text-sm font-semibold text-white/75 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b2d78c]"
              >
                <TbArrowLeft size={16} aria-hidden="true" /> Voltar ao catálogo
              </Link>
              <div className="relative my-7">
                <span className="grid size-12 place-items-center border border-[#b4d991]/25 bg-[#a6cf74]/10 text-[#c5e4a5]">
                  <TbPick size={24} aria-hidden="true" />
                </span>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#b4d991]">
                  Acesso do operador
                </p>
                <h2 className="font-minecraft-text mt-2 max-w-sm text-2xl font-black leading-tight text-white sm:text-3xl">
                  Seus mundos começam aqui.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-white/70">
                  Use GitHub ou Discord para recuperar suas keys, revisar
                  pedidos e liberar os servidores que você controla.
                </p>
              </div>
              <p className="relative flex items-center gap-2 text-xs text-white/65">
                <TbShieldCheck
                  size={16}
                  className="text-[#a6cf74]"
                  aria-hidden="true"
                />
                Sua senha nunca é compartilhada com o PluginsX.
              </p>
            </div>

            <div className="order-1 flex flex-col justify-center p-5 sm:p-7 md:order-2 md:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a6cf74]">
                Entrar na conta
              </p>
              <h3 className="font-minecraft-text mt-2 text-xl font-bold text-white sm:text-2xl">
                Escolha como entrar
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Autorize o acesso no provedor escolhido e você retornará ao
                PluginsX ao terminar.
              </p>

              <button
                type="button"
                onClick={() => void signInWith("github")}
                disabled={isSigningIn || !apiUrl}
                className="font-minecraft-text mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 border-b-4 border-[#345d2f] bg-[#5e9b43] px-5 text-sm font-bold text-white shadow-[0_5px_18px_rgba(71,134,55,0.18)] transition hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-55"
              >
                {isSigningIn ? (
                  <TbLoader2
                    className="size-5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <TbBrandGithub className="size-5" aria-hidden="true" />
                )}
                {isSigningIn ? "Conectando ao GitHub…" : "Continuar com GitHub"}
              </button>

              <button
                type="button"
                onClick={() => void signInWith("discord")}
                disabled={isSigningIn || !apiUrl || discordStatus !== "enabled"}
                aria-describedby="discord-login-status"
                className="font-minecraft-text mt-3 inline-flex min-h-12 w-full items-center justify-center gap-3 border-b-4 border-[#303c9b] bg-[#5865f2] px-5 text-sm font-bold text-white shadow-[0_5px_18px_rgba(88,101,242,0.18)] transition hover:bg-[#6975ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSigningIn ? (
                  <TbLoader2
                    className="size-5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <TbBrandDiscord className="size-5" aria-hidden="true" />
                )}
                {isSigningIn ? "Conectando…" : "Continuar com Discord"}
              </button>

              <output
                id="discord-login-status"
                aria-live="polite"
                className={`mt-2 text-xs leading-5 ${discordStatus === "enabled" ? "text-white/45" : "text-amber-100/75"}`}
              >
                {discordStatus === "loading"
                  ? "Verificando a disponibilidade do Discord…"
                  : discordStatus === "disabled"
                    ? "O login pelo Discord ainda não está configurado neste servidor."
                    : discordStatus === "error"
                      ? "Não foi possível verificar o login pelo Discord agora."
                      : ""}
              </output>

              {!apiUrl && (
                <p className="mt-3 text-xs leading-5 text-amber-100/85">
                  O login está temporariamente indisponível. Tente novamente
                  mais tarde.
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-4 border-l-4 border-red-300 bg-red-950/40 px-4 py-3 text-sm text-red-100"
                >
                  {error}
                </p>
              )}
              <p className="mt-5 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-white/65">
                <TbShieldCheck
                  size={15}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                A autenticação é confirmada pelo provedor escolhido; o PluginsX
                nunca recebe sua senha.
              </p>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

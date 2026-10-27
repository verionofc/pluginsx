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
  TbPencil,
  TbPick,
  TbPin,
  TbPinnedOff,
  TbRefresh,
  TbShieldCheck,
  TbUserCircle,
} from "react-icons/tb";
import { LicenseCapacity } from "@/components/account/LicenseCapacity";
import { LicenseIdentity } from "@/components/account/LicenseIdentity";
import { MinecraftItemIcon } from "@/components/account/LicenseWorldScene";
import {
  MonthlyBillingCountdown,
  type MonthlyBillingInfo,
} from "@/components/account/MonthlyBillingCountdown";
import { ServerDetailsDialog } from "@/components/account/ServerDetailsDialog";
import { ServerItemIcon } from "@/components/account/ServerItemIcon";
import { ServerProfileEditor } from "@/components/account/ServerProfileEditor";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { useHydrated } from "@/hooks/useHydrated";
import { useLoadingDelay } from "@/hooks/useLoadingDelay";
import { apiUrl, authClient } from "@/lib/auth-client";
import {
  orderServers,
  type ServerProfileFields,
  type ServerProfilePatch,
  serverDisplayName,
} from "@/lib/server-profiles";

type ActivationState =
  | "PENDING"
  | "ACTIVE"
  | "INACTIVE"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "ERROR";

type ServerActivation = ServerProfileFields & {
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
  activatedBy?: {
    executionType: "PLAYER" | "CONSOLE";
    username: string | null;
    uuid: string | null;
  } | null;
  approvedAt?: string | null;
  lastHeartbeatAt?: string | null;
};

type AccountLicense = {
  id: string;
  tier: string;
  planName?: string;
  valid: boolean;
  plan: "trial" | "monthly" | "lifetime" | "aether" | null;
  expiresAt?: string | null;
  used: number;
  limit: number | null;
  unlimited?: boolean;
  servers: ServerActivation[];
  billing?: MonthlyBillingInfo | null;
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
    classes: "border-outline-strong/30 bg-accent/10 text-accent-soft",
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
  if (license.planName) return license.planName;
  if (license.plan === "trial") return "Trial";
  if (license.plan === "monthly") return "Creeper";
  if (license.plan === "lifetime") return "Ender Dragon";
  if (license.plan === "aether") return "Aether";
  return license.tier === "plus" ? "Plus" : "Standard";
}

const licenseStyles = {
  eyebrow: "license-card__accent",
  keyText: "license-card__key",
  worldPanel: "license-card__worlds",
  worldAccent: "license-card__accent",
  worldCount: "license-card__world-count",
};

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
  const [detailsServerId, setDetailsServerId] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<AccountLicense[]>([]);
  const [expiredTrials, setExpiredTrials] = useState<Set<string>>(
    () => new Set(),
  );
  const [expiredMonthlyDates, setExpiredMonthlyDates] = useState<
    Record<string, string>
  >({});
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
  const [editingServer, setEditingServer] = useState<ServerActivation | null>(
    null,
  );
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});
  const [profileSavingIds, setProfileSavingIds] = useState<Set<string>>(
    () => new Set(),
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    setPinErrors({});

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

  const markMonthlyExpired = useCallback(
    (licenseId: string, periodEndsAt: string) => {
      setExpiredMonthlyDates((current) =>
        current[licenseId] === periodEndsAt
          ? current
          : { ...current, [licenseId]: periodEndsAt },
      );
      void refresh();
    },
    [refresh],
  );

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

  async function updateServerProfile(
    server: ServerActivation,
    patch: ServerProfilePatch,
  ) {
    const response = await fetch(`/license/servers/${server.id}/appearance`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null);
    if (response.status === 401)
      throw new Error(
        "Sua sessão expirou. Entre novamente para editar o servidor.",
      );
    if (!response.ok)
      throw new Error(
        typeof result?.message === "string"
          ? result.message
          : response.status === 422
            ? "Confira os limites dos campos e tente novamente."
            : "Não foi possível salvar a identificação do servidor.",
      );
    if (result?.id !== server.id || result?.state !== "ACTIVE")
      throw new Error(
        "A autorização mudou. Atualize os servidores e tente novamente.",
      );
    setLicenses((current) =>
      current.map((license) => ({
        ...license,
        servers: license.servers.map((entry) =>
          entry.id === server.id ? { ...entry, ...result } : entry,
        ),
      })),
    );
  }

  async function togglePinned(server: ServerActivation) {
    if (profileSavingIds.has(server.id)) return;
    setPinErrors((current) => {
      const next = { ...current };
      delete next[server.id];
      return next;
    });
    setProfileSavingIds((current) => new Set(current).add(server.id));
    try {
      await updateServerProfile(server, { pinned: !server.pinned });
    } catch (reason) {
      setPinErrors((current) => ({
        ...current,
        [server.id]:
          reason instanceof Error
            ? reason.message
            : "Não foi possível fixar o servidor.",
      }));
    } finally {
      setProfileSavingIds((current) => {
        const next = new Set(current);
        next.delete(server.id);
        return next;
      });
    }
  }

  async function act(
    server: ServerActivation,
    action: "approve" | "reject" | "remove" | "delete",
  ) {
    const prompt =
      action === "delete"
        ? `Apagar o registro antigo de ${serverDisplayName(server)}? Esta ação não pode ser desfeita.`
        : action === "remove"
          ? `Remover ${serverDisplayName(server)}? Isso desvinculará esta instalação da licença.`
          : `${action === "approve" ? "Autorizar" : "Rejeitar"} a solicitação de ${serverDisplayName(server)}?`;
    if (!window.confirm(prompt)) return;

    setBusyServerId(server.id);
    setBusyAction(action);
    setFeedback(null);
    try {
      const response = await fetch(`/license/servers/${server.id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
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
            className="relative overflow-hidden border border-outline/30 bg-surface px-4 py-4 shadow-[0_4px_0_var(--site-shadow)]"
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 w-1 ${index === 2 && pendingRequests > 0 ? "bg-amber-300" : "bg-accent"}`}
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
        className="border-2 border-outline/40 bg-surface shadow-[0_6px_0_var(--site-shadow)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline/30 bg-surface-raised px-4 py-4 sm:px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
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
            className="inline-flex min-h-10 items-center gap-2 border border-outline/40 bg-surface-deep px-3 text-xs font-semibold text-white/80 transition hover:border-outline-strong/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:cursor-wait disabled:opacity-55"
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
              className={`mb-4 border-l-4 px-4 py-3 text-sm ${feedback.tone === "success" ? "border-outline-strong bg-surface text-accent-soft" : "border-red-300 bg-red-950/40 text-red-100"}`}
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
                className="font-minecraft-text mt-4 inline-flex min-h-11 items-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-white transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <TbRefresh size={16} aria-hidden="true" /> Tentar novamente
              </button>
            </div>
          ) : licenses.length === 0 ? (
            <div className="relative overflow-hidden border border-dashed border-outline/45 bg-surface-deep p-5 sm:p-8">
              <div
                aria-hidden="true"
                className="absolute -right-10 -top-10 size-40 rotate-12 border-[12px] border-outline-strong/10"
              />
              <div className="relative max-w-xl">
                <span className="grid size-11 place-items-center border border-outline-strong/30 bg-accent/10 text-accent-soft">
                  <TbPick size={22} aria-hidden="true" />
                </span>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
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
                    className="font-minecraft-text inline-flex min-h-11 items-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-white transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Ver planos <TbChevronRight size={16} aria-hidden="true" />
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex min-h-11 items-center gap-2 border border-white/15 px-4 text-xs font-semibold text-white/75 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
                  >
                    Explorar plugins{" "}
                    <TbChevronRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
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
                const theme = licenseStyles;
                const edition = license.plan ?? "standard";
                const titleId = `license-title-${license.id}`;
                const expiresAt = license.expiresAt
                  ? Date.parse(license.expiresAt)
                  : Number.NaN;
                const trialExpired =
                  license.plan === "trial" &&
                  (expiredTrials.has(license.id) ||
                    (Number.isFinite(expiresAt) && expiresAt <= Date.now()));
                const monthlyEnd = license.billing?.currentPeriodEndsAt;
                const monthlyExpired =
                  license.plan === "monthly" &&
                  Boolean(monthlyEnd) &&
                  (expiredMonthlyDates[license.id] === monthlyEnd ||
                    Date.parse(monthlyEnd ?? "") <= Date.now());
                const accessExpired = trialExpired || monthlyExpired;
                const licenseUsable = license.valid && !accessExpired;
                const keyVisible =
                  Boolean(visibleKeys[license.id]) && !accessExpired;
                return (
                  <article
                    key={license.id}
                    className="license-card"
                    data-license-plan={edition}
                    data-license-state={licenseUsable ? "active" : "inactive"}
                    aria-labelledby={titleId}
                  >
                    <LicenseIdentity
                      edition={edition}
                      name={getPlanName(license)}
                      titleId={titleId}
                      reference={license.id}
                      usable={licenseUsable}
                      status={
                        trialExpired
                          ? "Trial expirado"
                          : monthlyExpired
                            ? "Mensal expirado"
                            : license.valid
                              ? "Licença válida"
                              : "Licença inválida"
                      }
                    >
                      {license.plan === "trial" && license.expiresAt ? (
                        trialExpired ? (
                          "Expedição encerrada"
                        ) : (
                          <TrialCountdown
                            licenseId={license.id}
                            expiresAt={license.expiresAt}
                            onExpired={markTrialExpired}
                          />
                        )
                      ) : null}
                    </LicenseIdentity>
                    {license.plan === "monthly" && (
                      <MonthlyBillingCountdown
                        billing={license.billing}
                        licenseId={license.id}
                        onExpired={markMonthlyExpired}
                      />
                    )}

                    <div className="license-card__body">
                      <div className="license-card__credentials">
                        <p className="license-card__section-label">
                          Key de acesso
                        </p>
                        <div className="license-card__key-controls mt-2 flex flex-col gap-2 sm:flex-row">
                          <code
                            className={`license-card__key-field ${theme.keyText}`}
                          >
                            <span
                              className="license-card__key-item"
                              aria-hidden="true"
                            >
                              <MinecraftItemIcon kind="key" />
                            </span>
                            {accessExpired ? (
                              monthlyExpired ? (
                                "Acesso mensal expirado"
                              ) : (
                                "Key temporária expirada"
                              )
                            ) : keyVisible ? (
                              revealedKeys[license.id]
                            ) : (
                              <>
                                <span aria-hidden="true">
                                  ••••••••••••••••••••••••••••••••
                                </span>
                                <span className="sr-only">Key oculta</span>
                              </>
                            )}
                          </code>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={
                                accessExpired || busyKeyRef === license.id
                              }
                              aria-label={`${keyVisible ? "Ocultar" : "Mostrar"} key de ${getPlanName(license)}`}
                              aria-pressed={keyVisible}
                              onClick={() => void toggleKey(license.id)}
                              className="license-mc-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-white/15 px-3 text-xs text-white/80 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
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
                                : accessExpired
                                  ? "Expirada"
                                  : "Mostrar"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                accessExpired || busyKeyRef === license.id
                              }
                              aria-label={`Copiar key de ${getPlanName(license)}`}
                              onClick={() => void copyKey(license.id)}
                              className="license-mc-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-white/15 px-3 text-xs text-white/80 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                            >
                              <TbCopy size={15} aria-hidden="true" /> Copiar
                            </button>
                          </div>
                        </div>
                        {trialExpired && (
                          <Link
                            href="/plans"
                            className="license-card__expired-link"
                          >
                            Continue sua jornada com um plano{" "}
                            <TbChevronRight size={13} aria-hidden="true" />
                          </Link>
                        )}
                      </div>

                      <LicenseCapacity
                        used={license.used}
                        limit={license.limit}
                        unlimited={license.unlimited}
                      >
                        {license.expiresAt &&
                          license.plan !== "trial" &&
                          license.plan !== "monthly" && (
                            <p className="mt-3 text-xs text-white/65">
                              Válida até {formatDate(license.expiresAt)}
                            </p>
                          )}
                      </LicenseCapacity>
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
                        <div className="license-card__server-list grid gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
                          {orderServers(license.servers).map((server) => {
                            const state = serverStates[server.state] ?? {
                              label: "Estado desconhecido",
                              classes:
                                "border-white/15 bg-white/5 text-white/65",
                            };
                            const isBusy =
                              busyServerId === server.id ||
                              profileSavingIds.has(server.id);
                            return (
                              <article
                                key={server.id}
                                id={`server-${server.id}`}
                                data-pinned={
                                  server.state === "ACTIVE" &&
                                  Boolean(server.pinned)
                                }
                                className="license-server border border-white/10 bg-black/20 p-3 sm:p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="license-server__heading">
                                    <span
                                      className="license-server__block"
                                      aria-hidden="true"
                                    >
                                      <ServerItemIcon icon={server.icon} />
                                    </span>
                                    <div className="min-w-0">
                                      <h5 className="break-words text-sm font-bold text-white">
                                        {serverDisplayName(server)}
                                      </h5>
                                      {server.pinned &&
                                        server.state === "ACTIVE" && (
                                          <span className="server-pinned-label">
                                            <TbPin
                                              size={11}
                                              aria-hidden="true"
                                            />
                                            Fixado
                                          </span>
                                        )}
                                      {server.displayName &&
                                        server.displayName !== server.name && (
                                          <p className="server-original-name">
                                            Original: {server.name}
                                          </p>
                                        )}
                                      <p className="mt-1 break-all font-mono text-[11px] text-white/65">
                                        ID {server.serverId}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="license-server__toolbar">
                                    {server.state === "ACTIVE" && (
                                      <>
                                        <button
                                          type="button"
                                          className="server-pin-button"
                                          disabled={isBusy}
                                          aria-pressed={Boolean(server.pinned)}
                                          aria-label={`${server.pinned ? "Desafixar" : "Fixar"} servidor ${serverDisplayName(server)}`}
                                          title={
                                            server.pinned
                                              ? "Desafixar servidor"
                                              : "Fixar no topo"
                                          }
                                          onClick={() =>
                                            void togglePinned(server)
                                          }
                                        >
                                          {profileSavingIds.has(server.id) ? (
                                            <TbLoader2
                                              className="animate-spin"
                                              size={16}
                                              aria-hidden="true"
                                            />
                                          ) : server.pinned ? (
                                            <TbPinnedOff
                                              size={16}
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <TbPin
                                              size={16}
                                              aria-hidden="true"
                                            />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          className="server-edit-button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            setEditingServer(server)
                                          }
                                          aria-label={`Editar identificação de ${serverDisplayName(server)}`}
                                        >
                                          <TbPencil
                                            size={14}
                                            aria-hidden="true"
                                          />
                                          Editar
                                        </button>
                                      </>
                                    )}
                                    <span
                                      className={`inline-flex min-h-7 items-center border px-2.5 text-[10px] font-bold ${state.classes}`}
                                    >
                                      {state.label}
                                    </span>
                                  </div>
                                </div>

                                {pinErrors[server.id] && (
                                  <p role="alert" className="server-pin-error">
                                    {pinErrors[server.id]}
                                  </p>
                                )}
                                {server.tags && server.tags.length > 0 && (
                                  <ul
                                    className="server-tags"
                                    aria-label={`Tags de ${serverDisplayName(server)}`}
                                  >
                                    {server.tags.map((tag) => (
                                      <li key={tag}>{tag}</li>
                                    ))}
                                  </ul>
                                )}
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
                                      {server.connection === "ONLINE"
                                        ? "Online"
                                        : server.connection === "OFFLINE"
                                          ? "Sem comunicação recente"
                                          : server.connection === "UNKNOWN"
                                            ? "Não confirmada"
                                            : "Inativo"}
                                    </strong>
                                  </p>
                                  <p className="sm:col-span-2">
                                    Última comunicação{" "}
                                    <strong className="text-white">
                                      {formatDate(
                                        server.lastHeartbeatAt ??
                                          server.lastValidatedAt,
                                      )}
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

                                <p className="mt-3 text-xs text-muted">
                                  Responsável:{" "}
                                  <strong className="text-foreground">
                                    {server.activatedBy?.username ??
                                      (server.activatedBy?.executionType ===
                                      "CONSOLE"
                                        ? "Console"
                                        : "Não registrado")}
                                  </strong>{" "}
                                  · ID {server.serverId.slice(0, 8)} · Ativação{" "}
                                  {formatDate(server.approvedAt)}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDetailsServerId(server.id)
                                    }
                                    className="min-h-10 border border-outline px-3 text-xs font-semibold text-accent-soft hover:bg-surface-raised"
                                  >
                                    Ver detalhes
                                  </button>
                                  {server.state === "PENDING" && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          void act(server, "approve")
                                        }
                                        className="inline-flex min-h-10 items-center justify-center gap-2 bg-accent px-3 text-xs font-bold text-on-accent transition hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
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
                                        className="min-h-10 border border-white/15 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:cursor-wait disabled:opacity-50"
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
                                      className="min-h-10 border border-white/15 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:cursor-wait disabled:opacity-50"
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
      {detailsServerId && (
        <ServerDetailsDialog
          key={detailsServerId}
          serverId={detailsServerId}
          onClose={() => setDetailsServerId(null)}
        />
      )}
      {editingServer && (
        <ServerProfileEditor
          key={editingServer.id}
          server={editingServer}
          onSave={(patch) => updateServerProfile(editingServer, patch)}
          onClose={() => setEditingServer(null)}
        />
      )}
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
            className="mb-5 flex items-center justify-between gap-4 border-l-4 border-amber-300 bg-warning-surface px-4 py-3 text-sm text-amber-100 shadow-[0_4px_0_var(--site-shadow)]"
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

        <header className="mx-auto mb-7 max-w-6xl border-b-2 border-outline/50 pb-5 sm:mb-8 sm:pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="grid size-12 shrink-0 place-items-center border-2 border-outline-strong/45 bg-surface-raised text-accent-soft shadow-[inset_0_0_0_3px_color-mix(in_srgb,var(--site-background)_70%,transparent),0_4px_0_var(--site-shadow)] sm:size-14">
              <TbBlocks aria-hidden="true" className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-accent sm:text-xs">
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
              <span className="ml-auto hidden items-center gap-2 border border-outline/35 bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-soft sm:inline-flex">
                <span className="size-1.5 bg-accent" aria-hidden="true" />{" "}
                Sessão conectada
              </span>
            )}
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70 sm:ml-16">
            {session
              ? "Consulte suas keys e aprove ou revogue o acesso de cada instalação."
              : "Entre para recuperar suas keys e administrar as instalações autorizadas."}
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

        {!isSessionReady ? (
          <output
            className="flex min-h-56 items-center justify-center gap-3 text-sm text-white/70"
            aria-live="polite"
          >
            <TbLoader2
              className="size-5 animate-spin text-accent-soft"
              aria-hidden="true"
            />
            Conferindo a sessão…
          </output>
        ) : session ? (
          <div className="mx-auto max-w-6xl">
            <section className="mb-6 grid overflow-hidden border-2 border-outline/40 bg-surface shadow-[0_6px_0_var(--site-shadow)] md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
                {session.user.image ? (
                  <span
                    aria-hidden="true"
                    className="size-14 shrink-0 rounded-full border-2 border-outline-strong/45 bg-cover bg-center shadow-[0_0_24px_color-mix(in_srgb,var(--site-accent)_15%,transparent)] sm:size-16"
                    style={{ backgroundImage: `url("${session.user.image}")` }}
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center border-2 border-outline-strong/30 bg-accent/10 text-accent-soft sm:size-16">
                    <TbUserCircle className="size-9" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
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
              <div className="flex items-center border-t border-outline/30 bg-black/15 p-4 md:border-l md:border-t-0 sm:p-5">
                <Link
                  href="/plans"
                  className="font-minecraft-text inline-flex min-h-11 w-full items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 text-xs font-bold text-white transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:w-auto"
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
                  className="size-4 text-accent-soft"
                  aria-hidden="true"
                />
                Sua sessão é protegida pelo provedor escolhido.
              </p>
              <Link
                href="/"
                className="inline-flex min-h-10 items-center gap-2 font-semibold text-accent-soft hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
              >
                <TbArrowLeft size={15} aria-hidden="true" /> Voltar ao catálogo
              </Link>
            </div>
          </div>
        ) : (
          <section className="mx-auto grid max-w-5xl overflow-hidden border-2 border-outline/40 bg-surface shadow-[0_8px_0_var(--site-shadow),0_24px_70px_-40px_color-mix(in_srgb,var(--site-accent-strong)_25%,transparent)] md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
            <div className="order-2 relative flex min-h-64 flex-col justify-between overflow-hidden border-t border-outline/25 bg-[linear-gradient(145deg,var(--site-surface-raised),var(--site-surface))] p-5 sm:p-7 md:order-1 md:border-r md:border-t-0">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 -right-8 grid size-56 rotate-12 grid-cols-4 gap-2 opacity-20"
              >
                {portalTiles.map((tile) => (
                  <span
                    key={tile}
                    className={
                      tile % 3 === 0
                        ? "border border-outline-strong"
                        : "bg-accent/20"
                    }
                  />
                ))}
              </div>
              <Link
                href="/"
                className="relative inline-flex min-h-10 w-fit items-center gap-2 text-sm font-semibold text-white/75 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-outline-strong"
              >
                <TbArrowLeft size={16} aria-hidden="true" /> Voltar ao catálogo
              </Link>
              <div className="relative my-7">
                <span className="grid size-12 place-items-center border border-outline-strong/25 bg-accent/10 text-accent-soft">
                  <TbPick size={24} aria-hidden="true" />
                </span>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-soft">
                  Acesso do operador
                </p>
                <h2 className="font-minecraft-text mt-2 max-w-sm text-2xl font-black leading-tight text-white sm:text-3xl">
                  Volte direto à sua operação.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-white/70">
                  Entre para recuperar keys, responder a pedidos de acesso e
                  controlar as instalações vinculadas à sua conta.
                </p>
              </div>
              <p className="relative flex items-center gap-2 text-xs text-white/65">
                <TbShieldCheck
                  size={16}
                  className="text-accent"
                  aria-hidden="true"
                />
                Sua senha nunca é compartilhada com o PluginsX.
              </p>
            </div>

            <div className="order-1 flex flex-col justify-center p-5 sm:p-7 md:order-2 md:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                Entrar na conta
              </p>
              <h3 className="font-minecraft-text mt-2 text-xl font-bold text-white sm:text-2xl">
                Escolha como entrar
              </h3>

              <button
                type="button"
                onClick={() => void signInWith("github")}
                disabled={isSigningIn || !apiUrl}
                className="font-minecraft-text mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 border-b-4 border-accent-edge bg-accent-strong px-5 text-sm font-bold text-white shadow-[0_5px_18px_color-mix(in_srgb,var(--site-accent)_18%,transparent)] transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-55"
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

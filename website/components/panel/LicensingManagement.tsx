"use client";
import { useCallback, useEffect, useState } from "react";
import { TbLoader2, TbRefresh } from "react-icons/tb";

type Plan = {
  id: "free" | "monthly" | "lifetime" | "aether";
  name: string;
  description: string;
  basePriceCents: number;
  salePriceCents: number | null;
  promotionEnabled: boolean;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  billingType: "free" | "recurring" | "lifetime";
  durationUnit: "hours" | "days" | "months" | "lifetime";
  duration: number;
  serverLimit: number;
  features: string[];
  permissions: string[];
  enabled: boolean;
  visible: boolean;
  featured: boolean;
  order: number;
};
type Policy = {
  approvalMinutes: number;
  privateRequestsPerMinute: number;
  proofRequestsPerMinute: number;
  maxRequestsPerWindow: number;
  requestWindowSeconds: number;
  maxPendingPerLicense: number;
  reactivationCooldownSeconds: number;
  allowReactivation: boolean;
  alertsEnabled: boolean;
  heartbeatSeconds: number;
  offlineAfterSeconds: number;
  graceSeconds: number;
  maxRetries: number;
  retrySeconds: number;
  clockSkewSeconds: number;
  logRetentionDays: number;
  sensitiveRetentionDays: number;
  collectPlayerIp: boolean;
  geolocationEnabled: boolean;
  consentVersion: number;
  allowLegacyActivations: boolean;
  requireSensitiveConfirmation: true;
};
type Config = {
  serverSlot: { name: string; priceCents: number; maxPerPurchase: number };
  version: number;
  plans: Plan[];
  policy: Policy;
  updatedAt: string;
};
type Revision = {
  providerDeliveries?: {
    applied: number;
    failed: number;
    cancellationFailed?: number;
    cancellationPending?: number;
  };
  _id: string;
  version: number;
  resource: string;
  actorUserId: string;
  reason: string;
  createdAt: string;
  providerStrategy: string;
  providerStatus: string;
};
type ProviderIssue = {
  externalReference: string;
  plan: string;
  status: string;
  subscriptionCancellationStatus?: "pending" | "cancelled" | "failed";
  upgradeCreditReversed?: boolean;
  providerDeliveryStatus?: "pending" | "applied" | "failed";
  updatedAt: string;
};
const features = [
  { id: "spawners", label: "Spawners" },
  { id: "shop", label: "Loja" },
  { id: "upgrades", label: "Melhorias" },
  { id: "trading", label: "Trocas" },
  { id: "public_sales", label: "Vendas públicas" },
];
const policyNumbers: {
  id: keyof Policy;
  label: string;
  min: number;
  max: number;
  hint: string;
}[] = [
  {
    id: "privateRequestsPerMinute",
    label: "Consultas privadas por minuto",
    min: 30,
    max: 600,
    hint: "Limite autenticado por conta e operação.",
  },
  {
    id: "proofRequestsPerMinute",
    label: "Provas assinadas por minuto",
    min: 10,
    max: 600,
    hint: "Limite por identidade de instalação, incluindo heartbeats.",
  },
  {
    id: "approvalMinutes",
    label: "Prazo de aprovação (min)",
    min: 1,
    max: 60,
    hint: "Novas solicitações; as já emitidas mantêm sua expiração.",
  },
  {
    id: "maxRequestsPerWindow",
    label: "Tentativas por janela",
    min: 1,
    max: 100,
    hint: "Limite por licença.",
  },
  {
    id: "requestWindowSeconds",
    label: "Janela de tentativas (s)",
    min: 30,
    max: 3600,
    hint: "Intervalo usado pelo limitador.",
  },
  {
    id: "maxPendingPerLicense",
    label: "Solicitações simultâneas",
    min: 1,
    max: 100,
    hint: "Também respeita as vagas contratadas.",
  },
  {
    id: "reactivationCooldownSeconds",
    label: "Intervalo de reativação (s)",
    min: 0,
    max: 86400,
    hint: "Após rejeitar ou revogar; reativar exige aprovação.",
  },
  {
    id: "heartbeatSeconds",
    label: "Intervalo de heartbeat (s)",
    min: 15,
    max: 600,
    hint: "Comunicação autenticada por instalação.",
  },
  {
    id: "offlineAfterSeconds",
    label: "Timeout offline (s)",
    min: 30,
    max: 3600,
    hint: "Deve permitir pelo menos dois heartbeats.",
  },
  {
    id: "graceSeconds",
    label: "Tolerância à indisponibilidade (s)",
    min: 0,
    max: 3600,
    hint: "Somente após autorização confirmada; não concede acesso em uma primeira ativação.",
  },
  {
    id: "maxRetries",
    label: "Retentativas rápidas",
    min: 0,
    max: 5,
    hint: "Depois disso, volta à cadência normal de heartbeat.",
  },
  {
    id: "retrySeconds",
    label: "Intervalo inicial de retentativa (s)",
    min: 5,
    max: 300,
    hint: "Usado com recuo progressivo.",
  },
  {
    id: "clockSkewSeconds",
    label: "Tolerância do relógio (s)",
    min: 30,
    max: 300,
    hint: "Protege assinaturas contra replay.",
  },
  {
    id: "logRetentionDays",
    label: "Retenção de eventos (dias)",
    min: 1,
    max: 365,
    hint: "Novos eventos recebem expiração automática.",
  },
  {
    id: "sensitiveRetentionDays",
    label: "Retenção de IP opcional (dias)",
    min: 1,
    max: 30,
    hint: "IP é criptografado; a conta recebe somente a versão mascarada.",
  },
  {
    id: "consentVersion",
    label: "Versão da política de consentimento",
    min: 1,
    max: 1000,
    hint: "Aumente quando a finalidade ou a política mudar; consentimentos anteriores deixam de autorizar novas coletas.",
  },
];
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const localDate = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const utcDate = (value: string) =>
  value ? new Date(value).toISOString() : null;
async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message ?? "Falha ao salvar a configuração.");
  return data;
}
export function LicensingManagement({ mode }: { mode: "plans" | "settings" }) {
  const [permissionsText, setPermissionsText] = useState("");
  const [slot, setSlot] = useState<Config["serverSlot"] | null>(null);
  const [alerts, setAlerts] = useState<
    { _id: string; action: string; serverRecordId: string; createdAt: string }[]
  >([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [providerIssues, setProviderIssues] = useState<ProviderIssue[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api("/panel/licensing");
      setConfig(result.config);
      setSlot(result.config.serverSlot);
      setAlerts(result.alerts ?? []);
      setPlan(result.config.plans[0]);
      setPolicy(result.config.policy);
      setRevisions(result.revisions);
      setProviderIssues(result.providerIssues ?? []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar a configuração.",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const incomingPermissions = plan?.permissions;
  useEffect(() => {
    setPermissionsText(incomingPermissions?.join("\n") ?? "");
  }, [incomingPermissions]);
  function updatePlan<K extends keyof Plan>(key: K, value: Plan[K]) {
    setPlan((current) => (current ? { ...current, [key]: value } : null));
    setConfirmed(false);
    setNotice("");
  }
  function updatePolicy<K extends keyof Policy>(key: K, value: Policy[K]) {
    setPolicy((current) => (current ? { ...current, [key]: value } : null));
    setConfirmed(false);
    setNotice("");
  }
  const promotion = Boolean(
    plan?.promotionEnabled &&
      plan.salePriceCents !== null &&
      plan.salePriceCents < plan.basePriceCents &&
      (!plan.promotionStartsAt ||
        Date.parse(plan.promotionStartsAt) <= Date.now()) &&
      (!plan.promotionEndsAt || Date.parse(plan.promotionEndsAt) > Date.now()),
  );
  const currentPrice = plan
    ? promotion
      ? (plan.salePriceCents ?? plan.basePriceCents)
      : plan.basePriceCents
    : 0;
  const validation =
    mode === "plans" && plan?.promotionEnabled && plan.salePriceCents === null
      ? "Informe o preço promocional antes de ativar a promoção."
      : mode === "plans" &&
          plan &&
          plan.salePriceCents !== null &&
          plan.salePriceCents > plan.basePriceCents
        ? "O preço promocional não pode superar o preço base."
        : mode === "plans" &&
            plan?.promotionStartsAt &&
            plan.promotionEndsAt &&
            Date.parse(plan.promotionStartsAt) >=
              Date.parse(plan.promotionEndsAt)
          ? "O término da promoção deve ocorrer após o início."
          : mode === "settings" &&
              policy &&
              policy.offlineAfterSeconds < policy.heartbeatSeconds * 2
            ? "O timeout offline deve permitir pelo menos dois heartbeats."
            : mode === "settings" &&
                policy?.geolocationEnabled &&
                !policy.collectPlayerIp
              ? "Geolocalização exige a coleta opcional de IP habilitada."
              : "";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!config || !plan || !policy || !confirmed || validation) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        mode === "plans"
          ? `/panel/plans/${plan.id}`
          : "/panel/licensing/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: config.version,
            reason,
            confirm: true,
            ...(mode === "plans"
              ? {
                  plan: {
                    ...plan,
                    permissions: permissionsText
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                }
              : { policy, serverSlot: slot ?? config.serverSlot }),
          }),
        },
      );
      setConfig(result.config);
      setConfirmed(false);
      setReason("");
      setNotice(result.message);
      const refreshed = await api("/panel/licensing");
      setRevisions(refreshed.revisions);
      setProviderIssues(refreshed.providerIssues ?? []);
      setAlerts(refreshed.alerts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="licensing-admin">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-minecraft-text text-xl font-bold">
            {mode === "plans"
              ? "Planos e condições comerciais"
              : "Configurações do licenciamento"}
          </h2>
          <p className="mt-2 text-xs text-muted">
            {config
              ? `Revisão ${config.version} · persistida no backend`
              : "Consultando configurações…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="flex min-h-10 items-center gap-2 border border-outline px-3 text-xs"
        >
          <TbRefresh /> Recarregar
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="border-l-4 border-red-300 bg-red-950/20 p-3 text-sm text-red-100"
        >
          {error}
        </p>
      )}
      {notice && (
        <output className="block border-l-4 border-outline-strong bg-surface-raised p-3 text-sm text-accent-soft">
          {notice}
        </output>
      )}
      {config && plan && policy ? (
        <>
          {mode === "plans" && (
            <div className="licensing-admin__plans">
              {config.plans.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={plan.id === item.id}
                  onClick={() => {
                    setPlan(item);
                    setConfirmed(false);
                    setNotice("");
                  }}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {money(item.basePriceCents)} · {item.serverLimit} vagas
                  </span>
                  <span>
                    {item.enabled ? "Disponível" : "Contratações suspensas"}
                  </span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={save}>
            {mode === "plans" ? (
              <>
                <div className="licensing-admin__grid">
                  <label>
                    Nome público
                    <input
                      value={plan.name}
                      required
                      maxLength={80}
                      onChange={(e) => updatePlan("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Ordem no catálogo
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={plan.order}
                      onChange={(e) =>
                        updatePlan("order", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <label>
                  Descrição comercial
                  <textarea
                    value={plan.description}
                    maxLength={1000}
                    onChange={(e) => updatePlan("description", e.target.value)}
                  />
                </label>
                <div className="licensing-admin__grid">
                  <label>
                    Preço base (R$)
                    <input
                      type="number"
                      step="0.01"
                      min={plan.id === "free" ? 0 : 0.01}
                      max={1000000}
                      disabled={plan.id === "free"}
                      value={plan.basePriceCents / 100}
                      onChange={(e) =>
                        updatePlan(
                          "basePriceCents",
                          Math.round(Number(e.target.value) * 100),
                        )
                      }
                    />
                  </label>
                  <label>
                    Preço promocional (R$)
                    <input
                      type="number"
                      step="0.01"
                      min={plan.id === "free" ? 0 : 0.01}
                      max={plan.basePriceCents / 100}
                      disabled={plan.id === "free"}
                      value={
                        plan.salePriceCents === null
                          ? ""
                          : plan.salePriceCents / 100
                      }
                      onChange={(e) =>
                        updatePlan(
                          "salePriceCents",
                          e.target.value === ""
                            ? null
                            : Math.round(Number(e.target.value) * 100),
                        )
                      }
                    />
                  </label>
                  <label>
                    Início da promoção (se houver)
                    <input
                      type="datetime-local"
                      value={localDate(plan.promotionStartsAt)}
                      onChange={(e) =>
                        updatePlan("promotionStartsAt", utcDate(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Fim da promoção (se houver)
                    <input
                      type="datetime-local"
                      value={localDate(plan.promotionEndsAt)}
                      onChange={(e) =>
                        updatePlan("promotionEndsAt", utcDate(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Servidores por licença
                    <input
                      required
                      type="number"
                      min={1}
                      max={1000000}
                      value={plan.serverLimit}
                      onChange={(e) =>
                        updatePlan("serverLimit", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Tipo de cobrança
                    <input
                      readOnly
                      value={
                        plan.billingType === "free"
                          ? "Gratuito"
                          : plan.billingType === "recurring"
                            ? "Recorrente"
                            : "Vitalício"
                      }
                    />
                  </label>
                  {plan.billingType !== "lifetime" && (
                    <>
                      <label>
                        Duração / intervalo
                        <input
                          required
                          type="number"
                          min={1}
                          max={3650}
                          value={plan.duration}
                          onChange={(e) =>
                            updatePlan("duration", Number(e.target.value))
                          }
                        />
                      </label>
                      <label>
                        Unidade
                        <select
                          value={plan.durationUnit}
                          onChange={(e) =>
                            updatePlan(
                              "durationUnit",
                              e.target.value as Plan["durationUnit"],
                            )
                          }
                        >
                          {plan.id === "free" ? (
                            <>
                              <option value="hours">Horas</option>
                              <option value="days">Dias</option>
                            </>
                          ) : (
                            <>
                              <option value="months">Meses</option>
                              <option value="days">Dias</option>
                            </>
                          )}
                        </select>
                      </label>
                    </>
                  )}
                </div>
                <div className="licensing-admin__grid">
                  {(
                    [
                      ["visible", "Exibir no catálogo"],
                      ["enabled", "Permitir novas contratações"],
                      ["featured", "Destacar como recomendado"],
                      ["promotionEnabled", "Ativar promoção"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="licensing-admin__check">
                      <input
                        type="checkbox"
                        checked={plan[key]}
                        onChange={(e) => updatePlan(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <fieldset>
                  <legend className="text-xs text-muted">
                    Recursos incluídos em novas licenças
                  </legend>
                  <div className="licensing-admin__grid">
                    {features.map((feature) => (
                      <label
                        key={feature.id}
                        className="licensing-admin__check"
                      >
                        <input
                          type="checkbox"
                          checked={plan.features.includes(feature.id)}
                          onChange={(e) =>
                            updatePlan(
                              "features",
                              e.target.checked
                                ? [...plan.features, feature.id]
                                : plan.features.filter(
                                    (id) => id !== feature.id,
                                  ),
                            )
                          }
                        />
                        {feature.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  Permissões da licença (uma por linha)
                  <textarea
                    value={permissionsText}
                    onChange={(e) => {
                      setPermissionsText(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <p className="server-details__note">
                  spawnerx.plus permite os recursos selecionados. Permissões da
                  licença não concedem permissões administrativas a jogadores.
                  Reduzir vagas ou recursos aqui afeta novas contratações;
                  licenças emitidas preservam as condições aceitas.
                </p>
                <section
                  className="licensing-admin__preview"
                  aria-label="Prévia do preço efetivo"
                >
                  <h3>{plan.name}</h3>
                  {promotion && <del>{money(plan.basePriceCents)}</del>}
                  <strong>{money(currentPrice)}</strong>
                  {plan.billingType === "recurring" && (
                    <span>
                      {" "}
                      / {plan.duration}{" "}
                      {plan.durationUnit === "months" ? "mês(es)" : "dia(s)"}
                    </span>
                  )}
                  <p>
                    {promotion
                      ? `${Math.round((1 - currentPrice / plan.basePriceCents) * 100)}% de desconto`
                      : "Preço base · sem promoção em vigor"}
                  </p>
                  <p className="mt-2">
                    Até {plan.serverLimit} servidores vinculados.
                  </p>
                  {plan.promotionEnabled &&
                    plan.promotionStartsAt &&
                    Date.parse(plan.promotionStartsAt) > Date.now() && (
                      <p className="mt-2">
                        Promoção agendada para{" "}
                        {new Date(plan.promotionStartsAt).toLocaleString(
                          "pt-BR",
                        )}
                        : {money(plan.salePriceCents ?? plan.basePriceCents)}.
                      </p>
                    )}
                </section>
                <p className="server-details__note">
                  Mercado Pago recebe o valor e a revisão comercial ao criar
                  cada novo checkout. Alterar este formulário não modifica
                  cobranças de assinaturas já autorizadas. Uma falha de entrega
                  ao provedor aparece na compra; esta revisão permanece
                  disponível para novas tentativas.
                </p>
              </>
            ) : (
              <>
                <div className="licensing-admin__grid">
                  <label>
                    Preço da vaga extra (R$)
                    <input
                      type="number"
                      required
                      min={0.01}
                      max={1000000}
                      step="0.01"
                      value={
                        (slot?.priceCents ?? config.serverSlot.priceCents) / 100
                      }
                      onChange={(e) => {
                        setSlot({
                          ...config.serverSlot,
                          ...slot,
                          priceCents: Math.round(Number(e.target.value) * 100),
                        });
                        setConfirmed(false);
                      }}
                    />
                  </label>
                  <label>
                    Máximo de vagas por compra
                    <input
                      type="number"
                      required
                      min={1}
                      max={1000}
                      value={
                        slot?.maxPerPurchase ?? config.serverSlot.maxPerPurchase
                      }
                      onChange={(e) => {
                        setSlot({
                          ...config.serverSlot,
                          ...slot,
                          maxPerPurchase: Number(e.target.value),
                        });
                        setConfirmed(false);
                      }}
                    />
                  </label>
                  {policyNumbers.map((field) => (
                    <label key={field.id}>
                      {field.label}
                      <input
                        type="number"
                        required
                        min={field.min}
                        max={field.max}
                        value={Number(policy[field.id])}
                        onChange={(e) =>
                          updatePolicy(field.id, Number(e.target.value))
                        }
                      />
                      <small>{field.hint}</small>
                    </label>
                  ))}
                </div>
                {(
                  [
                    [
                      "alertsEnabled",
                      "Exibir alertas de validação e identidade no painel",
                    ],
                    [
                      "allowReactivation",
                      "Permitir reativação mediante nova aprovação",
                    ],
                    [
                      "allowLegacyActivations",
                      "Permitir solicitações de plugins anteriores à beta.3",
                    ],
                    [
                      "collectPlayerIp",
                      "Disponibilizar coleta opcional de IP com consentimento",
                    ],
                    [
                      "geolocationEnabled",
                      "Derivar país/região/cidade aproximados com IPinfo",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="licensing-admin__check">
                    <input
                      type="checkbox"
                      checked={policy[key]}
                      onChange={(e) => updatePolicy(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <p className="server-details__note">
                  Ativar IP aqui não ativa a coleta no plugin: ela exige também
                  configuração local e consentimento informado do jogador.
                  Configure IPINFO_TOKEN no backend para usar geolocalização. IP
                  completo não é exibido. A localização é aproximada e não
                  comprova residência nem identidade.
                </p>
              </>
            )}
            <label className="mt-5">
              Motivo da alteração
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva a mudança para o histórico de auditoria."
              />
            </label>
            <label className="licensing-admin__check my-4">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Confirmo a revisão destas condições e a preservação dos contratos
              existentes.
            </label>
            {validation && (
              <p role="alert" className="mb-3 text-sm text-red-200">
                {validation}
              </p>
            )}
            <button
              type="submit"
              className="licensing-admin__save"
              disabled={busy || !confirmed || Boolean(validation)}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <TbLoader2 className="animate-spin" />
                  Salvando…
                </span>
              ) : (
                "Salvar nova revisão"
              )}
            </button>
          </form>
          {providerIssues.length > 0 && (
            <section aria-label="Pendências comerciais no provedor">
              <h3 className="font-minecraft-text mb-3 text-sm font-bold">
                Compras que precisam de acompanhamento
              </h3>
              <p className="mb-3 text-xs leading-5 text-muted">
                Acompanhe falhas de checkout, encerramento de renovação e
                estornos do pagamento utilizado como crédito de upgrade.
              </p>
              <ol className="licensing-admin__revisions">
                {providerIssues.map((issue) => (
                  <li key={issue.externalReference}>
                    <strong>
                      {config.plans.find((item) => item.id === issue.plan)
                        ?.name ?? issue.plan}
                      {" · "}
                      {issue.upgradeCreditReversed
                        ? "Crédito estornado · revisão necessária"
                        : issue.subscriptionCancellationStatus === "failed"
                          ? "Falha ao cancelar renovação"
                          : issue.providerDeliveryStatus === "failed"
                            ? "Falha na criação do checkout"
                            : issue.subscriptionCancellationStatus === "pending"
                              ? "Cancelamento em processamento"
                              : "Criação do checkout em processamento"}
                    </strong>
                    <p className="mt-1 break-all text-muted">
                      Compra {issue.externalReference}
                    </p>
                    <time dateTime={issue.updatedAt}>
                      {new Date(issue.updatedAt).toLocaleString("pt-BR")}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {mode === "settings" && (
            <section>
              <h3 className="font-minecraft-text mb-3 text-sm font-bold">
                Alertas de instalação
              </h3>
              {alerts.length ? (
                <ol className="licensing-admin__revisions">
                  {alerts.map((alert) => (
                    <li key={alert._id}>
                      <strong>
                        {alert.action === "SUSPICIOUS_ACTIVATION"
                          ? "Tentativa com identidade diferente"
                          : "Falha de validação"}
                      </strong>
                      <p>Instalação {alert.serverRecordId.slice(0, 8)}</p>
                      <time dateTime={alert.createdAt}>
                        {new Date(alert.createdAt).toLocaleString("pt-BR")}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted">
                  Nenhum alerta preservado na janela de retenção.
                </p>
              )}
            </section>
          )}
          <section>
            <h3 className="font-minecraft-text mb-3 text-sm font-bold">
              Histórico administrativo
            </h3>
            <ol className="licensing-admin__revisions">
              {revisions.map((revision) => (
                <li key={revision._id}>
                  <strong>
                    Revisão {revision.version} · {revision.resource}
                  </strong>
                  <p className="mt-1">{revision.reason}</p>
                  <p className="mt-1 text-muted">
                    Responsável: {revision.actorUserId} · Estratégia: novas
                    contratações
                  </p>
                  {revision.providerDeliveries && (
                    <p className="mt-2 text-accent-soft">
                      Checkouts entregues ao provedor:{" "}
                      {revision.providerDeliveries.applied} · Falhas
                      registradas: {revision.providerDeliveries.failed}
                      {" · Cancelamentos de upgrade pendentes: "}
                      {revision.providerDeliveries.cancellationPending ?? 0}
                      {" · Falhas de cancelamento: "}
                      {revision.providerDeliveries.cancellationFailed ?? 0}
                    </p>
                  )}
                  <time dateTime={revision.createdAt}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(revision.createdAt))}
                  </time>
                </li>
              ))}
            </ol>
            {!revisions.length && (
              <p className="text-xs text-muted">
                Nenhuma alteração após a migração inicial.
              </p>
            )}
          </section>
        </>
      ) : (
        busy && (
          <output className="flex items-center gap-2 p-4">
            <TbLoader2 className="animate-spin" />
            Carregando configuração real…
          </output>
        )
      )}
    </div>
  );
}

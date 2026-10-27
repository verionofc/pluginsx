"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { TbExternalLink, TbLoader2, TbX } from "react-icons/tb";

type Actor = {
  executionType: "PLAYER" | "CONSOLE";
  username: string | null;
  uuid: string | null;
};
type Details = {
  server: {
    id: string;
    serverId: string;
    name: string;
    displayName?: string;
    state: string;
    connection: string;
    minecraftVersion: string;
    implementation: string;
    implementationVersion: string;
    pluginVersion: string;
    createdAt: string;
    approvedAt: string | null;
    lastHeartbeatAt: string | null;
    activatedBy: Actor | null;
    accountVerification: string;
    authentication: {
      onlineMode: boolean;
      authenticationMode: string;
      trustedProxyForwarding: boolean;
    } | null;
  };
  license: {
    id: string;
    plan: string;
    valid: boolean;
    acquiredAt: string | null;
    expiresAt: string | null;
    limit: number;
    used: number;
    terms: {
      name: string;
      features: string[];
      permissions: string[];
      version: number;
    } | null;
  };
  events: { _id: string; action: string; createdAt: string }[];
  privacy: {
    maskedIp: string;
    location: {
      city: string | null;
      region: string | null;
      country: string | null;
    } | null;
    consentedAt: string;
    expiresAt: string;
  } | null;
};
const tabs = [
  { id: "overview", name: "Visão geral" },
  { id: "administrator", name: "Administrador" },
  { id: "license", name: "Licença" },
  { id: "history", name: "Histórico" },
] as const;
const events: Record<string, string> = {
  CONFIGURATION_UPDATED: "Configuração da licença reenviada",
  OPTIONAL_DATA_DELETED: "Dados opcionais excluídos",
  SUSPICIOUS_ACTIVATION: "Tentativa com identidade diferente",
  REQUEST_CREATED: "Solicitação criada",
  REQUEST_EXPIRED: "Solicitação expirada",
  AUTHORIZATION_APPROVED: "Autorização aprovada",
  AUTHORIZATION_REJECTED: "Autorização recusada",
  LICENSE_ACTIVATED: "Credencial de ativação emitida",
  LICENSE_REVOKED: "Licença revogada",
  SERVER_REMOVED: "Servidor removido",
  VALIDATION_FAILED: "Falha de validação",
};
const verification: Record<string, string> = {
  VERIFIED: "Identidade verificada",
  UNVERIFIED: "Identidade não verificada",
  UNKNOWN: "Verificação desconhecida",
  NOT_APPLICABLE: "Não se aplica ao console",
};
const featureNames: Record<string, string> = {
  spawners: "Spawners",
  shop: "Loja",
  upgrades: "Melhorias",
  trading: "Trocas",
  public_sales: "Vendas públicas",
};
function DateValue({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value} title={new Date(value).toISOString()}>
      {new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))}
    </time>
  ) : (
    <>Sem registro</>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
export function ServerDetailsDialog({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview");
  const [data, setData] = useState<Details | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/license/servers/${encodeURIComponent(serverId)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(
            body.message ?? "Não foi possível carregar os detalhes.",
          );
        setData(body as Details);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Falha ao consultar o servidor.",
          );
      });
    return () => controller.abort();
  }, [serverId]);
  const actor = data?.server.activatedBy;
  const uuid =
    actor?.uuid &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(actor.uuid)
      ? actor.uuid
      : null;
  return (
    <dialog
      ref={ref}
      className="server-details"
      aria-labelledby="server-details-title"
      onClose={onClose}
    >
      <header>
        <div>
          <p className="server-details__eyebrow">Instalação PaperMC</p>
          <h2 id="server-details-title">
            {data?.server.displayName ||
              data?.server.name ||
              "Detalhes do servidor"}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Fechar detalhes"
          onClick={() => ref.current?.close()}
        >
          <TbX size={22} />
        </button>
      </header>
      <div
        role="tablist"
        aria-label="Detalhes da instalação"
        className="server-details__tabs"
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            id={`details-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`details-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!offset && !["Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (index + offset + tabs.length) % tabs.length;
              setTab(tabs[next].id);
              tabRefs.current[next]?.focus();
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="server-details__body">
        {error ? (
          <p role="alert">{error}</p>
        ) : !data ? (
          <output className="flex items-center gap-2">
            <TbLoader2 className="animate-spin" />
            Consultando a instalação…
          </output>
        ) : (
          <section
            id={`details-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`details-tab-${tab}`}
          >
            {tab === "overview" && (
              <>
                <div className="server-details__status">
                  <strong>{data.server.state}</strong>
                  <span>
                    {data.server.connection === "ONLINE"
                      ? "Online · heartbeat autenticado"
                      : data.server.connection === "OFFLINE"
                        ? "Sem comunicação recente"
                        : data.server.connection === "UNKNOWN"
                          ? "Comunicação ainda não confirmada"
                          : "Instalação inativa"}
                  </span>
                </div>
                <dl className="server-details__fields">
                  <Field label="Identidade do servidor">
                    <code>{data.server.serverId}</code>
                  </Field>
                  <Field label="Minecraft">
                    {data.server.minecraftVersion}
                  </Field>
                  <Field label="PaperMC">
                    {data.server.implementationVersion}
                  </Field>
                  <Field label="SpawnerX">{data.server.pluginVersion}</Field>
                  <Field label="Solicitado em">
                    <DateValue value={data.server.createdAt} />
                  </Field>
                  <Field label="Autorizado em">
                    <DateValue value={data.server.approvedAt} />
                  </Field>
                  <Field label="Último heartbeat">
                    <DateValue value={data.server.lastHeartbeatAt} />
                  </Field>
                  <Field label="Licença">
                    <code>{data.license.id.slice(0, 16)}…</code>
                  </Field>
                </dl>
              </>
            )}
            {tab === "administrator" && (
              <>
                <div className="server-details__player">
                  {uuid ? (
                    <Image
                      src={`/license/players/${uuid}/avatar`}
                      alt={`Avatar público de ${actor?.username ?? "Minecraft"}`}
                      width={88}
                      height={88}
                      unoptimized
                    />
                  ) : (
                    <span className="server-details__console">
                      {actor?.executionType === "CONSOLE" ? ">_" : "?"}
                    </span>
                  )}
                  <div>
                    <h3>
                      {actor?.username ??
                        (actor?.executionType === "CONSOLE"
                          ? "Console"
                          : "Administrador não registrado")}
                    </h3>
                    <p>
                      {verification[data.server.accountVerification] ??
                        verification.UNKNOWN}
                    </p>
                    {uuid && (
                      <a
                        href={`https://namemc.com/profile/${uuid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver perfil no NameMC{" "}
                        <TbExternalLink aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
                <dl className="server-details__fields">
                  <Field label="UUID público">
                    <code>{uuid ?? "Não se aplica"}</code>
                  </Field>
                  <Field label="Online mode">
                    {data.server.authentication
                      ? String(data.server.authentication.onlineMode)
                      : "Não informado"}
                  </Field>
                  <Field label="Autenticação informada">
                    {data.server.authentication?.authenticationMode ??
                      "UNKNOWN"}
                  </Field>
                  <Field label="Encaminhamento confiável configurado">
                    {data.server.authentication?.trustedProxyForwarding
                      ? "Sim, declarado pela instalação"
                      : "Não declarado"}
                  </Field>
                  <Field label="Data da autorização">
                    <DateValue value={data.server.approvedAt} />
                  </Field>
                  <Field label="Localização aproximada">
                    {data.privacy?.location
                      ? [
                          data.privacy.location.city,
                          data.privacy.location.region,
                          data.privacy.location.country,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Indisponível"
                      : "Não coletada ou indisponível"}
                  </Field>
                  {data.privacy && (
                    <Field label="IP mascarado autorizado">
                      {data.privacy.maskedIp}
                    </Field>
                  )}
                </dl>
                {data.privacy && (
                  <button
                    type="button"
                    disabled={deleting}
                    className="mt-4 min-h-10 border border-outline px-3 text-xs text-accent-soft"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Excluir IP e localização opcionais desta vinculação? A licença continuará funcionando.",
                        )
                      )
                        return;
                      setDeleting(true);
                      setPrivacyError("");
                      try {
                        const response = await fetch(
                          `/license/servers/${serverId}/privacy`,
                          {
                            method: "DELETE",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ confirm: true }),
                          },
                        );
                        if (!response.ok)
                          throw new Error(
                            "Não foi possível confirmar a exclusão.",
                          );
                        setData((current) =>
                          current ? { ...current, privacy: null } : null,
                        );
                      } catch (e) {
                        setPrivacyError(
                          e instanceof Error ? e.message : "Falha na exclusão.",
                        );
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    {deleting ? "Excluindo…" : "Excluir dados opcionais"}
                  </button>
                )}
                {privacyError && (
                  <p role="alert" className="mt-3 text-xs text-red-200">
                    {privacyError}
                  </p>
                )}
                <p className="server-details__note">
                  O relatório da instalação e uma skin pública não comprovam a
                  titularidade de uma conta Microsoft. Online mode desativado
                  também não identifica uma cópia não licenciada. Dados
                  opcionais dependem de consentimento e expiram conforme a
                  retenção configurada.
                </p>
                {uuid && (
                  <figure className="server-details__skin">
                    <Image
                      src={`/license/players/${uuid}/body`}
                      width={112}
                      height={224}
                      unoptimized
                      alt={`Skin pública de ${actor?.username ?? "Minecraft"}`}
                    />
                    <figcaption>
                      Skin pública com cache e fallback padrão quando
                      indisponível.
                    </figcaption>
                  </figure>
                )}
              </>
            )}
            {tab === "license" && (
              <>
                <dl className="server-details__fields">
                  <Field label="Plano contratado">
                    {data.license.terms?.name ?? data.license.plan}
                  </Field>
                  <Field label="Autorização">
                    {data.license.valid ? "Licença válida" : "Licença inativa"}
                  </Field>
                  <Field label="Aquisição">
                    <DateValue value={data.license.acquiredAt} />
                  </Field>
                  <Field label="Vencimento">
                    {data.license.expiresAt ? (
                      <DateValue value={data.license.expiresAt} />
                    ) : (
                      "Vitalício"
                    )}
                  </Field>
                  <Field label="Capacidade">
                    {data.license.used} /{" "}
                    {data.license.limit === Number.MAX_SAFE_INTEGER
                      ? "∞"
                      : data.license.limit}
                  </Field>
                  <Field label="Revisão comercial">
                    {data.license.terms?.version ?? "Legado preservado"}
                  </Field>
                </dl>
                <h3>Recursos da licença</h3>
                <ul className="server-details__features">
                  {(data.license.terms?.features ?? []).map((feature) => (
                    <li key={feature}>{featureNames[feature] ?? feature}</li>
                  ))}
                </ul>
                <p className="server-details__note">
                  Alterações no catálogo não removem automaticamente as vagas ou
                  condições já contratadas.
                </p>
              </>
            )}
            {tab === "history" && (
              <>
                <h3>Histórico da vinculação</h3>
                {data.events.length ? (
                  <ol className="server-details__history">
                    {data.events.map((event) => (
                      <li key={event._id}>
                        <strong>{events[event.action] ?? event.action}</strong>
                        <DateValue value={event.createdAt} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="server-details__note">
                    Sem eventos preservados nesta janela de retenção.
                    Vinculações anteriores à beta.3 podem não ter histórico
                    detalhado.
                  </p>
                )}
                <p className="server-details__note">
                  Eventos são armazenados em UTC e apresentados no fuso do seu
                  navegador.
                </p>
              </>
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}

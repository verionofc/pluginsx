"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TbAdjustments,
  TbArrowLeft,
  TbArrowRight,
  TbCheck,
  TbClipboardList,
  TbCloudUpload,
  TbCube,
  TbDeviceGamepad2,
  TbHistory,
  TbInfoCircle,
  TbPlugConnected,
  TbPlugConnectedX,
  TbRefresh,
  TbRestore,
  TbServer,
  TbShoppingBag,
} from "react-icons/tb";
import { ServerItemIcon } from "@/components/account/ServerItemIcon";
import { useHydrated } from "@/hooks/useHydrated";
import { authClient } from "@/lib/auth-client";
import { mobDisplayName } from "@/lib/mob-heads";
import {
  configChanges,
  documentsEqual,
  operationLabels,
  operationPending,
  operationStatusLabels,
  type RemoteDocuments,
  type RemoteOperation,
  type RemoteRevision,
  type RemoteServerState,
  remoteSessionLabels,
  remoteTimestamp,
  validateDocuments,
} from "@/lib/remote-spawnerx";
import { MobHead } from "./MobHead";
import { RemoteConfigEditor } from "./RemoteConfigEditor";
import { RemoteShopEditor } from "./RemoteShopEditor";
import { remoteMutation, useRemoteServer } from "./useRemoteServer";

const sections = [
  { id: "overview", label: "Visão geral", icon: TbServer },
  { id: "spawners", label: "Spawners", icon: TbCube },
  { id: "shop", label: "Loja", icon: TbShoppingBag },
  { id: "config", label: "Configurações", icon: TbAdjustments },
  { id: "sync", label: "Sincronização", icon: TbCloudUpload },
  { id: "connection", label: "Conexão", icon: TbPlugConnected },
  { id: "history", label: "Histórico", icon: TbHistory },
  { id: "plugin", label: "Informações do plugin", icon: TbInfoCircle },
] as const;
type Section = (typeof sections)[number]["id"];
type Confirmation = {
  kind: "PLUGIN_RELOAD" | "RESTORE" | "DISCONNECT" | "DEFAULTS";
  revisionId?: string;
  title: string;
  message: string;
};
type EditorState = {
  documents: RemoteDocuments;
  saved: RemoteDocuments;
  baseHash: string;
  revisionId: string | null;
  identity: string;
};

function ConfirmationDialog({
  confirmation,
  busy,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="remote-confirm"
      aria-labelledby="remote-confirm-title"
      aria-describedby="remote-confirm-description"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <div className="remote-confirm__icon">
        <TbShieldCheckIcon />
      </div>
      <h2 id="remote-confirm-title" className="font-minecraft-text">
        {confirmation.title}
      </h2>
      <p id="remote-confirm-description">{confirmation.message}</p>
      <div className="remote-row">
        <button
          type="button"
          className="remote-button"
          disabled={busy}
          onClick={onCancel}
        >
          Voltar
        </button>
        <button
          type="button"
          className="remote-button remote-button--primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Enviando…" : "Confirmar"}
        </button>
      </div>
    </dialog>
  );
}
function TbShieldCheckIcon() {
  return <TbClipboardList size={30} aria-hidden="true" />;
}

function friendlyEntity(value: string) {
  return value
    .toLowerCase()
    .split(/[ _-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entry = (value as Record<string, unknown>)[key];
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as Record<string, unknown>)
    : {};
}

function SpawnerCatalog({
  state,
  onOpenShop,
}: {
  state: RemoteServerState;
  onOpenShop: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "listed" | "configured">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const config = state.snapshot?.documents.config ?? {};
  const shop = state.snapshot?.documents.shop ?? {};
  const configured = objectAt(config, "mob-rarities");
  const spawner = objectAt(shop, "spawner");
  const shopRoot = objectAt(spawner, "shop");
  const categories = objectAt(shopRoot, "categories");
  const listed = new Map<string, Record<string, unknown>>();
  for (const category of Object.values(categories)) {
    const items = objectAt(category, "items");
    for (const [entity, item] of Object.entries(items)) {
      if (item && typeof item === "object" && !Array.isArray(item))
        listed.set(entity, item as Record<string, unknown>);
    }
  }
  const entities = [...new Set([...Object.keys(configured), ...listed.keys()])]
    .filter((entity) => entity !== "DEFAULT")
    .filter((entity) => {
      const normalized = `${entity} ${friendlyEntity(entity)}`.toLowerCase();
      return normalized.includes(query.toLowerCase().trim());
    })
    .filter((entity) =>
      filter === "all"
        ? true
        : filter === "listed"
          ? listed.has(entity)
          : configured[entity] !== undefined,
    )
    .sort((a, b) => a.localeCompare(b));
  return (
    <section className="remote-catalog">
      <div className="remote-catalog__toolbar">
        <div>
          <p className="remote-eyebrow">Inventário da instalação</p>
          <h3>Spawners configurados</h3>
          <p className="remote-muted">
            Dados derivados do snapshot confirmado pelo plugin. Nenhum item é
            inventado pelo painel.
          </p>
        </div>
        <div className="remote-catalog__controls">
          <label className="remote-search">
            <span className="sr-only">Pesquisar entidade</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar mob…"
            />
          </label>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            aria-label="Filtrar spawners"
          >
            <option value="all">Todos</option>
            <option value="configured">Com raridade</option>
            <option value="listed">Na loja</option>
          </select>
          <fieldset className="remote-view-toggle" aria-label="Visualização">
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              Grade
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              Lista
            </button>
          </fieldset>
        </div>
      </div>
      {!entities.length ? (
        <div className="remote-empty-state">
          <TbCube size={30} />
          <strong>Nenhum spawner encontrado</strong>
          <span>Sincronize o servidor ou ajuste os filtros.</span>
        </div>
      ) : (
        <div className={`remote-spawner-grid remote-spawner-grid--${view}`}>
          {entities.map((entity) => {
            const item = listed.get(entity);
            const price = typeof item?.price === "number" ? item.price : null;
            const rarity =
              typeof configured[entity] === "string"
                ? configured[entity]
                : null;
            return (
              <article className="remote-spawner-card" key={entity}>
                <div className="remote-spawner-card__art">
                  <MobHead mobId={entity} size={52} />
                  <span
                    className="remote-spawner-card__status"
                    data-listed={Boolean(item)}
                  >
                    {item ? "Na loja" : "Configurado"}
                  </span>
                </div>
                <div className="remote-spawner-card__body">
                  <div>
                    <strong>{mobDisplayName(entity)}</strong>
                    <code>
                      minecraft:
                      {entity.toLowerCase().replace(/^minecraft:/, "")}
                    </code>
                  </div>
                  <dl>
                    <div>
                      <dt>Raridade</dt>
                      <dd>{rarity ?? "Não definida"}</dd>
                    </div>
                    <div>
                      <dt>Compra</dt>
                      <dd>
                        {price == null
                          ? "Não publicada"
                          : `${price.toLocaleString("pt-BR")} XP`}
                      </dd>
                    </div>
                  </dl>
                </div>
                <button
                  type="button"
                  className="remote-button remote-button--quiet"
                  onClick={onOpenShop}
                >
                  Abrir configuração <TbArrowRight />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ConnectionSteps({ state }: { state: string | undefined }) {
  const current =
    state === "CONNECTED"
      ? 5
      : state === "WEB_APPROVED"
        ? 3
        : state === "PENDING"
          ? 2
          : 0;
  return (
    <ol className="remote-connection-steps">
      {[
        "Executar /sx connect",
        "Abrir o link privado",
        "Autorizar no website",
        "Confirmar no Minecraft",
        "Conexão estabelecida",
      ].map((label, index) => (
        <li
          key={label}
          data-done={index < current}
          aria-current={index === current ? "step" : undefined}
        >
          <span>
            {index < current ? <TbCheck aria-hidden="true" /> : index + 1}
          </span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

function ConnectionInstructions({
  state,
  serverId,
}: {
  state: RemoteServerState;
  serverId: string;
}) {
  const trial =
    state.server.license.plan === "trial" ||
    state.server.license.plan === "free";
  return (
    <section className="remote-panel remote-connect-instructions">
      <div className="remote-panel__symbol">
        <TbDeviceGamepad2 size={34} aria-hidden="true" />
      </div>
      <p className="remote-eyebrow">O controle começa dentro do jogo</p>
      <h2 className="font-minecraft-text">Conectar SpawnerX</h2>
      <p>
        {trial
          ? "O gerenciamento remoto exige um plano pago Premium/Plus. O Trial continua disponível para testar os recursos do plugin no jogo."
          : !state.server.license.valid
            ? "Regularize a licença vinculada para estabelecer uma sessão de gerenciamento."
            : "Para gerenciar seu plugin remotamente, entre no servidor Minecraft com permissão e execute o comando abaixo."}
      </p>
      <code className="remote-command">/sx connect</code>
      <ConnectionSteps state={state.session?.state} />
      <p className="remote-muted">
        A autorização no site e a confirmação do jogador são obrigatórias. O
        link sozinho não libera o painel.
      </p>
      <Link
        className="remote-button"
        href={`/server/${serverId}/spawnerx/connect`}
      >
        Acompanhar conexão <TbArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

function OperationFeed({ operations }: { operations: RemoteOperation[] }) {
  if (!operations.length)
    return (
      <p className="remote-empty">
        Nenhuma operação foi enviada por esta sessão.
      </p>
    );
  return (
    <div className="remote-operation-list">
      {operations.slice(0, 12).map((operation) => (
        <article
          key={operation.id}
          className="remote-operation"
          data-status={operation.status}
        >
          <span className="remote-operation__icon">
            <TbCloudUpload aria-hidden="true" />
          </span>
          <div>
            <strong>{operationLabels[operation.kind] ?? operation.kind}</strong>
            <p>{operationStatusLabels[operation.status] ?? operation.status}</p>
            {operation.message && <small>{operation.message}</small>}
            <code>
              {operation.id.slice(0, 8)} ·{" "}
              {remoteTimestamp(operation.completedAt ?? operation.createdAt)}
            </code>
            {operation.backupId && (
              <small>Backup confirmado: {operation.backupId}</small>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function ChangesTable({
  before,
  after,
}: {
  before: RemoteDocuments;
  after: RemoteDocuments;
}) {
  const changes = configChanges(before, after);
  if (!changes.length)
    return (
      <p className="remote-muted">
        Esta revisão corresponde às configurações comparadas.
      </p>
    );
  return (
    <div className="remote-table-wrap">
      <table className="remote-change-table">
        <caption>
          {changes.length}{" "}
          {changes.length === 1
            ? "propriedade diferente"
            : "propriedades diferentes"}
        </caption>
        <thead>
          <tr>
            <th>Propriedade</th>
            <th>Antes</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          {changes.slice(0, 250).map((change) => (
            <tr key={change.path}>
              <th>
                <code>{change.path}</code>
              </th>
              <td>
                <code>{JSON.stringify(change.before) ?? "Ausente"}</code>
              </td>
              <td>
                <code>{JSON.stringify(change.after) ?? "Removida"}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {changes.length > 250 && (
        <p className="remote-muted">
          Mostrando as primeiras 250 propriedades. O documento completo
          permanece disponível na revisão.
        </p>
      )}
    </div>
  );
}

export function RemoteDashboard({
  serverId,
  initialState,
  ownerId,
}: {
  serverId: string;
  initialState: RemoteServerState | null;
  ownerId: string;
}) {
  const hydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();
  const {
    state,
    error: connectionError,
    checking,
    refresh,
    manageable,
  } = useRemoteServer(serverId, initialState);
  const [section, setSection] = useState<Section>("overview");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [comparedRevision, setComparedRevision] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const accountChanged = !isPending && session?.user.id !== ownerId;
  const inFlight = state?.operations.some(operationPending) ?? false;
  const blocked = !manageable || Boolean(busy) || inFlight || accountChanged;
  const unsaved = Boolean(
    editor && !documentsEqual(editor.documents, editor.saved),
  );
  const conflict = Boolean(
    editor && state?.snapshot && editor.baseHash !== state.snapshot.hash,
  );
  const validation = useMemo(
    () =>
      editor && state?.capabilities
        ? validateDocuments(editor.documents, state.capabilities)
        : [],
    [editor, state?.capabilities],
  );
  useEffect(() => {
    if (!state?.snapshot) return;
    const snapshot = state.snapshot;
    const draft = state.draft?.baseHash === snapshot.hash ? state.draft : null;
    const identity = `${snapshot.hash}:${draft?.id ?? "snapshot"}`;
    setEditor((current) => {
      if (
        current?.identity === identity ||
        (current && !documentsEqual(current.documents, current.saved))
      )
        return current;
      const documents = structuredClone(draft?.documents ?? snapshot.documents);
      return {
        documents,
        saved: structuredClone(documents),
        baseHash: snapshot.hash,
        revisionId: draft?.id ?? null,
        identity,
      };
    });
  }, [state?.snapshot, state?.draft]);
  useEffect(() => {
    if (!unsaved) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [unsaved]);
  const updateDocument = (
    document: "config" | "shop",
    value: RemoteDocuments["config"],
  ) =>
    setEditor((current) =>
      current
        ? { ...current, documents: { ...current.documents, [document]: value } }
        : current,
    );
  async function saveDraft(): Promise<RemoteRevision> {
    if (!editor || !state?.snapshot || blocked || conflict)
      throw new Error(
        "A conexão precisa estar ativa e as configurações sincronizadas para salvar.",
      );
    if (validation.length) throw new Error(validation.slice(0, 4).join(" "));
    const data = await remoteMutation(serverId, "draft", {
      expectedRevision: editor.revisionId,
      expectedHash: editor.baseHash,
      documents: editor.documents,
    });
    const revision = data.revision as RemoteRevision;
    setEditor((current) =>
      current
        ? {
            ...current,
            saved: structuredClone(current.documents),
            revisionId: revision.id,
            identity: `${current.baseHash}:${revision.id}`,
          }
        : current,
    );
    return revision;
  }
  async function save() {
    if (blocked) return;
    setBusy("save");
    setError("");
    setMessage("");
    try {
      await saveDraft();
      setMessage(
        "Rascunho salvo no website. As configurações do servidor ainda não foram alteradas.",
      );
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy("");
    }
  }
  async function operation(
    kind: "APPLY" | "PLUGIN_RELOAD" | "SYNC" | "RESTORE",
    revisionId?: string,
  ) {
    if (!state?.snapshot || blocked || (kind === "APPLY" && conflict)) return;
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      let revision = revisionId ?? editor?.revisionId;
      if (kind === "APPLY" && (unsaved || !revision))
        revision = (await saveDraft()).id;
      await remoteMutation(serverId, "operations", {
        kind,
        expectedHash: state.snapshot.hash,
        ...(revision ? { revisionId: revision } : {}),
        confirmed: true,
      });
      setMessage(
        "Solicitação aceita. Aguarde a confirmação do SpawnerX na lista de operações.",
      );
      setConfirmation(null);
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "A operação não foi aceita.",
      );
    } finally {
      setBusy("");
    }
  }
  async function confirm() {
    if (!confirmation || blocked) return;
    if (confirmation.kind === "DEFAULTS") {
      if (state?.capabilities)
        setEditor((current) =>
          current
            ? {
                ...current,
                documents: structuredClone(
                  state.capabilities?.defaults as RemoteDocuments,
                ),
              }
            : current,
        );
      setConfirmation(null);
      setMessage(
        "Padrões carregados no formulário. Revise as alterações antes de salvar e aplicar.",
      );
      return;
    }
    if (confirmation.kind !== "DISCONNECT") {
      await operation(confirmation.kind, confirmation.revisionId);
      return;
    }
    setBusy("disconnect");
    setError("");
    try {
      await remoteMutation(serverId, "disconnect", { confirmed: true });
      setConfirmation(null);
      setMessage(
        "Sessão de gerenciamento encerrada. Nenhuma operação nova será enviada.",
      );
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível encerrar a sessão.",
      );
    } finally {
      setBusy("");
    }
  }
  if (!hydrated)
    return (
      <main className="remote-shell">
        <output aria-live="polite">Preparando a bancada do servidor…</output>
      </main>
    );
  if (accountChanged)
    return (
      <main className="remote-shell remote-unavailable">
        <TbPlugConnectedX size={42} aria-hidden="true" />
        <h1 className="font-minecraft-text">Acesso não disponível</h1>
        <p>
          {accountChanged
            ? "A conta mudou. Abra novamente o servidor a partir do inventário da sua conta."
            : connectionError}
        </p>
        <Link href="/account" className="remote-button">
          Voltar para minha conta
        </Link>
      </main>
    );
  if (!state)
    return (
      <main className="remote-shell remote-unavailable">
        <TbPlugConnectedX size={42} aria-hidden="true" />
        <h1 className="font-minecraft-text">Aguardando o servidor</h1>
        <p>
          {connectionError ||
            "A autorização foi registrada, mas a instalação ainda não respondeu ao canal remoto."}
        </p>
        <button
          type="button"
          className="remote-button remote-button--primary"
          disabled={checking}
          onClick={() => void refresh()}
        >
          <TbRefresh className={checking ? "animate-spin" : undefined} />
          {checking ? "Consultando…" : "Tentar novamente"}
        </button>
      </main>
    );
  const latest = state.operations[0];
  const compared = state.revisions.find(
    (revision) => revision.id === comparedRevision,
  );
  const currentSection = sections.find((entry) => entry.id === section);
  return (
    <main className="remote-shell">
      <div className="remote-breadcrumb">
        <Link href="/account">
          <TbArrowLeft aria-hidden="true" /> Meus servidores
        </Link>
        <span>/</span>
        <span>SpawnerX</span>
        <span className="remote-version">WEB 0.5.3</span>
      </div>
      <header className="remote-hero">
        <div className="remote-hero__emblem">
          {state.server.iconData?.startsWith("data:image/png;base64,") ? (
            // The API validates this as a normalized 64×64 PNG before it is
            // persisted; no arbitrary remote URL is accepted by the browser.
            <Image
              src={state.server.iconData}
              alt=""
              width={64}
              height={64}
              unoptimized
            />
          ) : (
            <ServerItemIcon icon={state.server.icon ?? "grass"} />
          )}
        </div>
        <div className="remote-hero__copy">
          <p className="remote-eyebrow">Bancada de controle · SpawnerX</p>
          <h1 className="font-minecraft-text">{state.server.name}</h1>
          <p>
            Minecraft {state.server.minecraftVersion} <span>·</span> SpawnerX{" "}
            {state.server.pluginVersion} <span>·</span> ID{" "}
            {state.server.serverId.slice(0, 8)}
          </p>
          <span className="remote-hero__address">
            Instalação {state.server.serverId.slice(0, 16)}… · PaperMC
            autorizado
          </span>
        </div>
        <div className="remote-hero__status" data-online={manageable}>
          <i aria-hidden="true" />
          <strong>
            {manageable
              ? "Conectado"
              : state.session?.state === "CONNECTED"
                ? "Servidor desconectado"
                : state.session
                  ? (remoteSessionLabels[state.session.state] ??
                    state.session.state)
                  : "Sem sessão remota"}
          </strong>
          <span>
            Último contato:{" "}
            {remoteTimestamp(
              state.session?.lastSeenAt ?? state.server.lastHeartbeatAt,
            )}
          </span>
        </div>
      </header>
      {(!manageable || connectionError) && (
        <output className="remote-banner" aria-live="polite">
          <TbPlugConnectedX aria-hidden="true" />
          <div>
            <strong>
              {connectionError
                ? "Comunicação interrompida"
                : "Gerenciamento indisponível"}
            </strong>
            <p>
              {connectionError ||
                state.reason ||
                "O servidor precisa estar online e com uma sessão autorizada para receber alterações."}
            </p>
            <small>
              O último estado confirmado e o histórico continuam disponíveis
              para consulta.
            </small>
          </div>
        </output>
      )}
      <div className="remote-workspace">
        <aside className="remote-sidebar">
          <nav aria-label="Navegação do SpawnerX">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="remote-sidebar__note">
            <TbPlugConnected size={22} aria-hidden="true" />
            <p>
              Acesso seguro pelo canal da instalação. Nenhuma porta adicional no
              seu servidor.
            </p>
          </div>
        </aside>
        <div className="remote-main">
          <div className="remote-section-title">
            <h2>{currentSection?.label}</h2>
            <button
              type="button"
              className="remote-button remote-button--compact"
              disabled={checking}
              onClick={() => void refresh()}
            >
              <TbRefresh
                className={checking ? "animate-spin" : ""}
                aria-hidden="true"
              />
              {checking ? "Consultando…" : "Atualizar status"}
            </button>
          </div>
          {error && (
            <div className="remote-banner remote-banner--error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <output
              className="remote-banner remote-banner--notice"
              aria-live="polite"
            >
              {message}
            </output>
          )}
          {section === "overview" && (
            <>
              <div className="remote-stats">
                <article>
                  <span>Licença vinculada</span>
                  <strong>
                    {state.server.license.plan ?? "Não identificada"}
                  </strong>
                  <small>
                    {state.server.license.valid
                      ? "Acesso válido"
                      : "Acesso indisponível"}
                  </small>
                </article>
                <article>
                  <span>Spawner catalogados</span>
                  <strong>
                    {state.snapshot
                      ? Object.keys(
                          objectAt(
                            state.snapshot.documents.config,
                            "mob-rarities",
                          ),
                        ).filter((key) => key !== "DEFAULT").length
                      : "—"}
                  </strong>
                  <small>Entidades presentes no snapshot confirmado</small>
                </article>
                <article>
                  <span>Itens na loja</span>
                  <strong>
                    {state.snapshot
                      ? Object.values(
                          objectAt(
                            objectAt(
                              objectAt(
                                state.snapshot.documents.shop,
                                "spawner",
                              ),
                              "shop",
                            ),
                            "categories",
                          ),
                        ).reduce<number>(
                          (total, category) =>
                            total +
                            Object.keys(objectAt(category, "items")).length,
                          0,
                        )
                      : "—"}
                  </strong>
                  <small>Entradas XP publicadas nas categorias</small>
                </article>
                <article>
                  <span>Canal administrativo</span>
                  <strong>{manageable ? "Operacional" : "Bloqueado"}</strong>
                  <small>
                    {state.online
                      ? "Servidor em comunicação"
                      : "Sem confirmação operacional recente"}
                  </small>
                </article>
                <article>
                  <span>Última sincronização</span>
                  <strong>
                    {state.snapshot
                      ? remoteTimestamp(state.snapshot.capturedAt)
                      : "Aguardando conexão"}
                  </strong>
                  <small>
                    {state.snapshot
                      ? `Revisão ${state.snapshot.hash.slice(0, 12)}`
                      : "O plugin enviará os arquivos públicos"}
                  </small>
                </article>
              </div>
              {!manageable && (
                <ConnectionInstructions state={state} serverId={serverId} />
              )}
              {manageable && (
                <section className="remote-panel remote-quick-actions">
                  <div>
                    <p className="remote-eyebrow">Seu servidor, suas regras</p>
                    <h3 className="font-minecraft-text">
                      Ajuste no painel. Confirme no mundo.
                    </h3>
                    <p>
                      Edite os parâmetros públicos da instalação. A bancada só
                      marca uma alteração como aplicada depois da resposta do
                      plugin.
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="remote-button remote-button--primary"
                      onClick={() => setSection("config")}
                    >
                      <TbAdjustments aria-hidden="true" /> Configurar plugin
                    </button>
                    <button
                      type="button"
                      className="remote-button"
                      onClick={() => setSection("shop")}
                    >
                      <TbShoppingBag aria-hidden="true" /> Abrir loja
                    </button>
                  </div>
                </section>
              )}
              <section className="remote-panel">
                <header className="remote-section-heading">
                  <div>
                    <h3>Operações recentes</h3>
                    <p>
                      O resultado vem do SpawnerX. Uma solicitação enviada ainda
                      não é uma alteração aplicada.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="remote-button"
                    disabled={
                      blocked ||
                      !state.capabilities?.operations.includes("SYNC")
                    }
                    onClick={() => void operation("SYNC")}
                  >
                    <TbRefresh aria-hidden="true" /> Sincronizar agora
                  </button>
                </header>
                <OperationFeed operations={state.operations} />
              </section>
            </>
          )}
          {section === "spawners" && (
            <SpawnerCatalog
              state={state}
              onOpenShop={() => setSection("shop")}
            />
          )}
          {section === "sync" && (
            <>
              <section className="remote-panel remote-sync-hero">
                <div>
                  <p className="remote-eyebrow">Canal autenticado</p>
                  <h3 className="font-minecraft-text">
                    Sincronização sob confirmação
                  </h3>
                  <p>
                    O painel só considera uma alteração aplicada depois que o
                    SpawnerX devolve o recibo assinado. Enquanto o servidor
                    estiver offline, você pode consultar o último estado
                    confirmado, mas não enviar operações.
                  </p>
                </div>
                <button
                  type="button"
                  className="remote-button remote-button--primary"
                  disabled={blocked}
                  onClick={() => void operation("SYNC")}
                >
                  <TbRefresh /> Sincronizar agora
                </button>
              </section>
              <section className="remote-panel">
                <header className="remote-section-heading">
                  <div>
                    <h3>Última fotografia do servidor</h3>
                    <p>
                      Hash e horário ajudam a detectar alterações locais e
                      evitar sobrescrever configurações feitas diretamente no
                      servidor.
                    </p>
                  </div>
                </header>
                <dl className="remote-definition-list">
                  <div>
                    <dt>Hash confirmado</dt>
                    <dd>
                      <code>
                        {state.snapshot?.hash ?? "Aguardando snapshot"}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Capturado em</dt>
                    <dd>{remoteTimestamp(state.snapshot?.capturedAt)}</dd>
                  </div>
                  <div>
                    <dt>Estado do canal</dt>
                    <dd>
                      {state.online
                        ? "Online"
                        : "Offline ou sem heartbeat recente"}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="remote-panel">
                <h3>Operações recentes</h3>
                <OperationFeed operations={state.operations} />
              </section>
            </>
          )}
          {(section === "config" || section === "shop") &&
            (state.capabilities && editor ? (
              <>
                <div className="remote-edit-state" data-dirty={unsaved}>
                  <span>
                    <i aria-hidden="true" />
                    {unsaved
                      ? "Alterações não salvas"
                      : editor.revisionId
                        ? "Rascunho salvo no website"
                        : "Último estado confirmado do servidor"}
                  </span>
                  <span>
                    {latest
                      ? (operationStatusLabels[latest.status] ?? latest.status)
                      : "Nenhuma aplicação pendente"}
                  </span>
                </div>
                {conflict && (
                  <div
                    className="remote-banner remote-banner--error"
                    role="alert"
                  >
                    <div>
                      <strong>As configurações mudaram no servidor</strong>
                      <p>
                        Seu formulário usa uma versão anterior. Compare as
                        alterações antes de carregar novamente o estado
                        confirmado.
                      </p>
                      <button
                        type="button"
                        className="remote-button"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Descartar o formulário atual e carregar o estado confirmado do servidor?",
                            )
                          )
                            setEditor(null);
                        }}
                      >
                        Carregar estado confirmado
                      </button>
                    </div>
                  </div>
                )}
                {section === "config" ? (
                  <RemoteConfigEditor
                    value={editor.documents.config}
                    schema={state.capabilities.schema.config}
                    defaults={state.capabilities.defaults.config}
                    disabled={blocked}
                    onChange={(value) => updateDocument("config", value)}
                  />
                ) : (
                  <RemoteShopEditor
                    value={editor.documents.shop}
                    schema={state.capabilities.schema.shop}
                    defaults={state.capabilities.defaults.shop}
                    disabled={blocked}
                    onChange={(value) => updateDocument("shop", value)}
                  />
                )}
                {validation.length > 0 && (
                  <div
                    className="remote-banner remote-banner--error"
                    role="alert"
                  >
                    <div>
                      <strong>Revise os campos antes de salvar</strong>
                      {validation.slice(0, 6).map((issue) => (
                        <p key={issue}>{issue}</p>
                      ))}
                    </div>
                  </div>
                )}
                <details
                  className="remote-panel remote-diff"
                  open={showPreview}
                  onToggle={(event) => setShowPreview(event.currentTarget.open)}
                >
                  <summary>
                    Prévia das alterações em relação ao servidor
                  </summary>
                  {state.snapshot && (
                    <ChangesTable
                      before={state.snapshot.documents}
                      after={editor.documents}
                    />
                  )}
                </details>
                <div className="remote-save-bar">
                  <div>
                    <strong>
                      {unsaved
                        ? "Sua edição está neste navegador"
                        : "Pronto para conferir"}
                    </strong>
                    <small>
                      Salvar cria uma revisão no website. Aplicar envia ao
                      plugin conectado.
                    </small>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="remote-button"
                      disabled={
                        blocked || conflict || validation.length > 0 || !unsaved
                      }
                      onClick={() => void save()}
                    >
                      {busy === "save" ? "Salvando…" : "Salvar rascunho"}
                    </button>
                    <button
                      type="button"
                      className="remote-button remote-button--primary"
                      disabled={
                        blocked ||
                        conflict ||
                        validation.length > 0 ||
                        !state.capabilities.operations.includes("APPLY")
                      }
                      onClick={() => void operation("APPLY")}
                    >
                      {busy === "APPLY"
                        ? "Enviando…"
                        : unsaved
                          ? "Salvar e aplicar"
                          : "Aplicar alterações"}
                      <TbCloudUpload aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <section className="remote-panel">
                  <div className="remote-row">
                    <button
                      type="button"
                      className="remote-button"
                      disabled={blocked}
                      onClick={() =>
                        setConfirmation({
                          kind: "DEFAULTS",
                          title: "Carregar os valores padrão?",
                          message:
                            "Os padrões públicos desta versão substituirão o formulário dos dois arquivos. Você poderá conferir a prévia antes de salvar e aplicar.",
                        })
                      }
                    >
                      <TbRestore aria-hidden="true" /> Carregar padrões da
                      versão
                    </button>
                    <button
                      type="button"
                      className="remote-button"
                      disabled={
                        blocked ||
                        !state.capabilities.operations.includes("PLUGIN_RELOAD")
                      }
                      onClick={() =>
                        setConfirmation({
                          kind: "PLUGIN_RELOAD",
                          title: "Recarregar SpawnerX?",
                          message:
                            "O plugin validará e recarregará os arquivos já gravados no servidor. Rascunhos do website não são aplicados por esta ação.",
                        })
                      }
                    >
                      <TbRefresh aria-hidden="true" /> Recarregar plugin
                    </button>
                  </div>
                  <OperationFeed operations={state.operations.slice(0, 3)} />
                </section>
              </>
            ) : (
              <ConnectionInstructions state={state} serverId={serverId} />
            ))}
          {section === "connection" && (
            <>
              <ConnectionInstructions state={state} serverId={serverId} />
              <section className="remote-panel">
                <h3>Informações da sessão</h3>
                <dl className="remote-definition-list">
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {state.session
                        ? (remoteSessionLabels[state.session.state] ??
                          state.session.state)
                        : "Nenhuma sessão"}
                    </dd>
                  </div>
                  <div>
                    <dt>Solicitante no jogo</dt>
                    <dd>
                      {state.session?.actor?.username ?? "Não registrado"}
                    </dd>
                  </div>
                  <div>
                    <dt>Solicitação criada</dt>
                    <dd>{remoteTimestamp(state.session?.requestedAt)}</dd>
                  </div>
                  <div>
                    <dt>Última confirmação operacional</dt>
                    <dd>{remoteTimestamp(state.session?.lastSeenAt)}</dd>
                  </div>
                  <div>
                    <dt>Identificador da sessão</dt>
                    <dd>
                      <code>{state.session?.id ?? "—"}</code>
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="remote-button remote-button--danger"
                  disabled={blocked}
                  onClick={() =>
                    setConfirmation({
                      kind: "DISCONNECT",
                      title: "Desconectar gerenciamento?",
                      message:
                        "Esta sessão administrativa será encerrada e novas operações serão bloqueadas. Para uma nova autorização, execute /sx connect dentro do servidor.",
                    })
                  }
                >
                  <TbPlugConnectedX aria-hidden="true" /> Desconectar sessão
                </button>
              </section>
            </>
          )}
          {section === "history" && (
            <>
              <section className="remote-panel">
                <header className="remote-section-heading">
                  <div>
                    <h3>Revisões de configuração</h3>
                    <p>
                      Compare os documentos antes de restaurar. A restauração
                      exige o servidor conectado e segue a mesma validação de
                      uma edição.
                    </p>
                  </div>
                </header>
                {state.revisions.length ? (
                  <div className="remote-revision-list">
                    {state.revisions.map((revision) => (
                      <article key={revision.id}>
                        <div>
                          <strong>Revisão {revision.id.slice(0, 8)}</strong>
                          <p>
                            {remoteTimestamp(revision.createdAt)} ·{" "}
                            {revision.status}
                          </p>
                          <small>Responsável: {revision.actorId}</small>
                        </div>
                        <div className="remote-row">
                          <button
                            className="remote-button"
                            type="button"
                            onClick={() =>
                              setComparedRevision(
                                comparedRevision === revision.id
                                  ? null
                                  : revision.id,
                              )
                            }
                          >
                            Comparar
                          </button>
                          <button
                            className="remote-button"
                            type="button"
                            disabled={blocked}
                            onClick={() =>
                              setConfirmation({
                                kind: "RESTORE",
                                revisionId: revision.id,
                                title: "Restaurar esta revisão?",
                                message:
                                  "O SpawnerX criará um backup, validará os documentos desta revisão e aplicará a restauração. Alterações locais posteriores serão protegidas pela verificação de versão.",
                              })
                            }
                          >
                            <TbRestore aria-hidden="true" /> Restaurar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="remote-empty">Nenhuma revisão registrada.</p>
                )}
                {compared && state.snapshot && (
                  <>
                    <h4>Estado atual → revisão {compared.id.slice(0, 8)}</h4>
                    <ChangesTable
                      before={state.snapshot.documents}
                      after={compared.documents}
                    />
                  </>
                )}
              </section>
              <section className="remote-panel">
                <h3>Histórico de operações</h3>
                <OperationFeed operations={state.operations} />
              </section>
              <section className="remote-panel">
                <h3>Eventos de auditoria</h3>
                {state.history.length ? (
                  <ol className="remote-audit-list">
                    {state.history.map((event, index) => (
                      <li key={`${event.createdAt}-${event.action}-${index}`}>
                        <span>{event.action.replaceAll("_", " ")}</span>
                        <time dateTime={event.createdAt}>
                          {remoteTimestamp(event.createdAt)}
                        </time>
                        <small>
                          {event.actorId
                            ? `Conta: ${event.actorId}`
                            : "Instalação autenticada"}
                        </small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="remote-empty">Nenhum evento registrado.</p>
                )}
              </section>
            </>
          )}
          {section === "plugin" && (
            <section className="remote-panel">
              <p className="remote-eyebrow">Instalação identificada</p>
              <h3 className="font-minecraft-text">
                SpawnerX {state.server.pluginVersion}
              </h3>
              <dl className="remote-definition-list">
                <div>
                  <dt>Minecraft</dt>
                  <dd>{state.server.minecraftVersion}</dd>
                </div>
                <div>
                  <dt>Software do servidor</dt>
                  <dd>
                    {state.server.implementation}{" "}
                    {state.server.implementationVersion}
                  </dd>
                </div>
                <div>
                  <dt>ID persistente</dt>
                  <dd>
                    <code>{state.server.serverId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Schema remoto</dt>
                  <dd>
                    {state.capabilities
                      ? `Versão ${state.capabilities.schemaVersion} · SpawnerX ${state.capabilities.pluginVersion}`
                      : "Aguardando conexão compatível"}
                  </dd>
                </div>
                <div>
                  <dt>Tempo em execução</dt>
                  <dd>
                    {state.server.uptimeSeconds == null
                      ? "Não informado pela instalação"
                      : `${Math.floor(state.server.uptimeSeconds / 60)} minutos`}
                  </dd>
                </div>
                <div>
                  <dt>Operações suportadas</dt>
                  <dd>
                    {state.capabilities?.operations
                      .map((kind) => operationLabels[kind] ?? kind)
                      .join(", ") || "Aguardando capacidades da instalação"}
                  </dd>
                </div>
              </dl>
              <p className="remote-muted">
                Os formulários são construídos a partir das capacidades
                publicadas por esta instalação. Dados de licença, credenciais e
                comandos de console não são expostos ao editor.
              </p>
            </section>
          )}
        </div>
      </div>
      {confirmation && (
        <ConfirmationDialog
          confirmation={confirmation}
          busy={Boolean(busy)}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirm()}
        />
      )}
    </main>
  );
}

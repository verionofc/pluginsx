"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  TbArrowLeft,
  TbBrandGithub,
  TbCheck,
  TbDeviceGamepad2,
  TbExternalLink,
  TbPlugConnected,
  TbRefresh,
  TbShieldCheck,
} from "react-icons/tb";
import { useHydrated } from "@/hooks/useHydrated";
import { authClient } from "@/lib/auth-client";
import {
  type RemoteServerState,
  remoteSessionLabels,
  remoteTimestamp,
} from "@/lib/remote-spawnerx";
import { ConnectionSteps } from "./RemoteDashboard";
import { remoteMutation, useRemoteServer } from "./useRemoteServer";

function remainingTime(expiresAt: string | undefined, now: number) {
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(expiresAt ?? "") - now) / 1000),
  );
  if (!Number.isFinite(seconds)) return "—";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RemoteConnect({
  serverId,
  initialState,
}: {
  serverId: string;
  initialState: RemoteServerState | null;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const {
    state,
    checking,
    refresh,
    now,
    error: connectionError,
    manageable,
  } = useRemoteServer(serverId, initialState);
  const secret = useRef<{ requestId: string; token: string } | null>(null);
  const [hasSecret, setHasSecret] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loginLink, setLoginLink] = useState<string | null>(null);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const requestId = fragment.get("request"),
      token = fragment.get("token");
    if (
      requestId &&
      /^[a-f0-9-]{36}$/i.test(requestId) &&
      token &&
      /^[A-Za-z0-9_-]{32,128}$/.test(token)
    ) {
      secret.current = { requestId, token };
      setHasSecret(true);
    }
    // Keep credentials out of subsequent navigation and browser history. The
    // token exists only in this component's memory until its explicit exchange.
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
  }, []);
  useEffect(() => {
    if (!session?.user.id) return;
    void refresh();
  }, [session?.user.id, refresh]);
  useEffect(() => {
    if (!manageable) return;
    secret.current = null;
    setHasSecret(false);
    const timer = window.setTimeout(
      () => router.replace(`/server/${serverId}/spawnerx`),
      1600,
    );
    return () => window.clearTimeout(timer);
  }, [manageable, serverId, router]);
  const matches = Boolean(
    secret.current && state?.session?.id === secret.current.requestId,
  );
  const expired = Boolean(
    state?.session &&
      (state.session.state === "EXPIRED" ||
        Date.parse(state.session.expiresAt) <= now),
  );
  const canAuthorize = Boolean(
    session?.user &&
      matches &&
      hasSecret &&
      !expired &&
      state?.session?.state === "PENDING" &&
      state.server.license.valid &&
      !["free", "trial"].includes(state.server.license.plan ?? ""),
  );
  async function authorize(decision: "approve" | "reject") {
    if (!canAuthorize || !secret.current || busy) return;
    setBusy(decision);
    setError("");
    try {
      await remoteMutation(serverId, "authorize", {
        ...secret.current,
        decision,
      });
      secret.current = null;
      setHasSecret(false);
      setMessage(
        decision === "approve"
          ? "Autorização registrada. Volte ao Minecraft e confirme na mensagem privada do SpawnerX."
          : "A solicitação foi recusada. O gerenciamento continua bloqueado.",
      );
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível autorizar a conexão.",
      );
    } finally {
      setBusy("");
    }
  }
  async function signIn() {
    if (busy) return;
    setBusy("login");
    setError("");
    const popup = window.open(
      "about:blank",
      "_blank",
      "popup,width=580,height=780",
    );
    if (popup) {
      popup.opener = null;
      popup.document.title = "Entrar no PluginsX";
      popup.document.body.textContent = "Preparando autenticação segura…";
    }
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: `${window.location.origin}/server/${serverId}/spawnerx/connect`,
        disableRedirect: true,
      });
      if (result.error || !result.data?.url)
        throw new Error(
          result.error?.message ?? "Não foi possível iniciar a autenticação.",
        );
      const url = new URL(result.data.url);
      if (
        url.protocol !== "https:" ||
        !["github.com", "www.github.com"].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new Error("Endereço de autenticação não reconhecido.");
      if (popup && !popup.closed) popup.location.href = url.href;
      else {
        setLoginLink(url.href);
        setMessage(
          "O navegador bloqueou a janela de login. Abra o link de autenticação em outra aba e depois retorne a esta página.",
        );
      }
    } catch (failure) {
      popup?.close();
      setError(
        failure instanceof Error ? failure.message : "Falha na autenticação.",
      );
    } finally {
      setBusy("");
    }
  }
  if (!hydrated)
    return (
      <main className="remote-shell">
        <output aria-live="polite">Preparando a conexão privada…</output>
      </main>
    );
  const stateLabel = manageable
    ? "Servidor conectado com sucesso!"
    : state?.session?.state === "CONNECTED"
      ? "Servidor desconectado"
      : state?.session
        ? (remoteSessionLabels[state.session.state] ?? state.session.state)
        : "Conectar SpawnerX";
  return (
    <main className="remote-shell remote-connect-shell">
      <Link href="/account" className="remote-back-link">
        <TbArrowLeft aria-hidden="true" /> Voltar para minha conta
      </Link>
      <section className="remote-connect-card" data-connected={manageable}>
        <div className="remote-connect-card__art" aria-hidden="true">
          <span />
          <span />
          <span />
          <TbPlugConnected size={66} />
          <i />
        </div>
        <p className="remote-eyebrow">Minecraft ↔ PluginsX</p>
        <h1 className="font-minecraft-text">{stateLabel}</h1>
        <p>
          {manageable
            ? "Agora você pode configurar o SpawnerX remotamente. Abrindo a bancada do servidor…"
            : state?.session?.state === "WEB_APPROVED"
              ? "O website já autorizou. Falta a confirmação do jogador que iniciou a conexão dentro do Minecraft."
              : "Uma conexão privada, confirmada nas duas pontas. Confira o servidor antes de liberar o gerenciamento."}
        </p>
        <ConnectionSteps state={state?.session?.state} />
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
        {!sessionPending && !session?.user ? (
          <div className="remote-login">
            <TbShieldCheck aria-hidden="true" size={27} />
            <h2>Entre na conta titular da licença</h2>
            <p>
              O link não concede permissão. A autenticação abre em outra janela
              para manter o código temporário somente na memória desta página.
            </p>
            <button
              type="button"
              className="remote-button remote-button--primary"
              disabled={Boolean(busy)}
              onClick={() => void signIn()}
            >
              <TbBrandGithub aria-hidden="true" />
              {busy === "login" ? "Abrindo login…" : "Entrar com GitHub"}
            </button>
            {loginLink && (
              <a
                href={loginLink}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="remote-button"
              >
                Abrir autenticação <TbExternalLink aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              className="remote-button"
              disabled={checking}
              onClick={() => {
                void authClient.getSession({
                  query: { disableCookieCache: true },
                });
                void refresh();
              }}
            >
              Já entrei · verificar sessão
            </button>
          </div>
        ) : state ? (
          <>
            <dl className="remote-definition-list">
              <div>
                <dt>Servidor</dt>
                <dd>{state.server.name}</dd>
              </div>
              <div>
                <dt>ID da instalação</dt>
                <dd>
                  <code>{state.server.serverId}</code>
                </dd>
              </div>
              <div>
                <dt>Minecraft / SpawnerX</dt>
                <dd>
                  {state.server.minecraftVersion} / {state.server.pluginVersion}
                </dd>
              </div>
              <div>
                <dt>Licença</dt>
                <dd>
                  {state.server.license.plan ?? "Não identificada"} ·{" "}
                  {state.server.license.valid ? "Válida" : "Indisponível"}
                </dd>
              </div>
              <div>
                <dt>Jogador solicitante</dt>
                <dd>{state.session?.actor?.username ?? "Não informado"}</dd>
              </div>
              <div>
                <dt>Solicitação</dt>
                <dd>{remoteTimestamp(state.session?.requestedAt)}</dd>
              </div>
              <div>
                <dt>Tempo para confirmar</dt>
                <dd className="remote-countdown">
                  {state.session?.state === "CONNECTED"
                    ? "Concluído"
                    : remainingTime(state.session?.expiresAt, now)}
                </dd>
              </div>
              {state.session?.code && (
                <div>
                  <dt>Código no jogo</dt>
                  <dd>
                    <code>{state.session.code}</code>
                  </dd>
                </div>
              )}
            </dl>
            {expired && (
              <p className="remote-banner remote-banner--error" role="alert">
                Esta solicitação expirou. Execute /sx connect novamente no
                servidor.
              </p>
            )}
            {state.reason && !manageable && (
              <p className="remote-muted">{state.reason}</p>
            )}
            {state.session?.state === "PENDING" && !matches && (
              <output className="remote-banner" aria-live="polite">
                Abra o link privado enviado pelo SpawnerX para autorizar esta
                solicitação. Se ele foi perdido, execute /sx connect novamente.
              </output>
            )}
            {canAuthorize && (
              <div className="remote-row remote-connect-actions">
                <button
                  type="button"
                  className="remote-button"
                  disabled={Boolean(busy)}
                  onClick={() => void authorize("reject")}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="remote-button remote-button--primary"
                  disabled={Boolean(busy)}
                  onClick={() => void authorize("approve")}
                >
                  <TbShieldCheck aria-hidden="true" />
                  {busy === "approve" ? "Autorizando…" : "Autorizar conexão"}
                </button>
              </div>
            )}
            {state.session?.state === "WEB_APPROVED" && (
              <div className="remote-game-confirm">
                <TbDeviceGamepad2 size={29} aria-hidden="true" />
                <div>
                  <strong>Volte para o Minecraft</strong>
                  <p>
                    Clique em CONFIRMAR na mensagem privada do SpawnerX. Apenas
                    o jogador solicitante, ainda com a permissão necessária,
                    pode concluir.
                  </p>
                </div>
              </div>
            )}
            {manageable && (
              <Link
                className="remote-button remote-button--primary"
                href={`/server/${serverId}/spawnerx`}
              >
                <TbCheck aria-hidden="true" /> Abrir painel do SpawnerX
              </Link>
            )}
          </>
        ) : (
          session?.user && (
            <output className="remote-banner" aria-live="polite">
              {connectionError || "Consultando as informações da solicitação…"}
            </output>
          )
        )}
        <button
          type="button"
          className="remote-button remote-button--quiet"
          disabled={checking}
          onClick={() => void refresh()}
        >
          <TbRefresh
            className={checking ? "animate-spin" : ""}
            aria-hidden="true"
          />
          {checking ? "Consultando…" : "Verificar conexão"}
        </button>
        <p className="remote-security-note">
          O código é temporário e não substitui sua licença. Nunca envie a key
          nem o link privado a outras pessoas.
        </p>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  TbArrowLeft,
  TbBrandGithub,
  TbCheck,
  TbChevronRight,
  TbLoader2,
  TbLogout2,
  TbShieldCheck,
  TbSparkles,
  TbUserCircle,
} from "react-icons/tb";

import { apiUrl, authClient } from "@/lib/auth-client";

type ServerActivation = {
  id: string; serverId: string; name: string; minecraftVersion: string;
  implementation: string; implementationVersion: string; pluginVersion: string;
  state: string; createdAt: string; lastValidatedAt: string | null; connection: string;
};
type AccountLicense = { id: string; tier: string; valid: boolean; used: number; limit: number; servers: ServerActivation[] };

function LicensesPanel() {
  const [licenses, setLicenses] = useState<AccountLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = async () => {
    try {
      const response = await fetch(`${apiUrl}/license/servers`, { credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível carregar as licenças.");
      setLicenses(await response.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar licenças."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  async function act(server: ServerActivation, action: "approve" | "reject" | "remove") {
    const prompt = action === "remove"
      ? `Remover ${server.name}? Isso desvinculará esta instalação da licença.`
      : `${action === "approve" ? "Autorizar" : "Rejeitar"} a solicitação de ${server.name}?`;
    if (!window.confirm(prompt)) return;
    setBusy(server.id); setMessage("");
    try {
      const response = await fetch(`${apiUrl}/license/servers/${server.id}/${action}`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error((await response.json()).message ?? "A operação falhou.");
      setMessage(action === "approve" ? "Servidor autorizado." : action === "remove" ? "Servidor removido e autorização revogada." : "Solicitação rejeitada.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A operação falhou."); }
    finally { setBusy(""); }
  }
  const label: Record<string, string> = { PENDING: "Aguardando aprovação", ACTIVE: "Autorizado", INACTIVE: "Inativo", REJECTED: "Rejeitado", EXPIRED: "Expirado", REVOKED: "Revogado", ERROR: "Erro" };
  return <section className="mt-8" aria-labelledby="licenses-title">
    <div className="mb-4"><p className="font-minecraft-text text-xs font-bold uppercase tracking-[0.16em] text-[#b4d991]">Licenciamento</p><h3 id="licenses-title" className="mt-1 text-xl font-bold text-white">Licenças e servidores</h3></div>
    {message && <p role="status" className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{message}</p>}
    {loading ? <p className="text-sm text-white/50">Carregando licenças…</p> : licenses.length === 0 ? <p className="text-sm text-white/50">Nenhuma licença vinculada a esta conta.</p> : <div className="grid gap-4">{licenses.map((license) => <article key={license.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-white">SpawnerX {license.tier === "plus" ? "Plus" : "Standard"}</h4><p className="mt-1 break-all font-mono text-xs text-white/45">{license.id}</p></div><button type="button" onClick={() => void navigator.clipboard.writeText(license.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10">Copiar ID</button></div>
      <p className="mt-3 text-sm text-[#c2e3a0]">{license.valid ? "Licença válida" : "Licença inválida"} · {license.used}/{license.limit} servidores utilizados</p>
      <div className="mt-3 grid gap-3">{license.servers.map((server) => <div key={server.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-white">{server.name}</strong><span className="rounded-full border border-[#a6cf74]/20 bg-[#a6cf74]/10 px-2.5 py-1 text-xs text-[#c2e3a0]">{label[server.state] ?? server.state}</span></div>
        <p className="mt-2 break-all font-mono text-[11px] text-white/40">ID {server.serverId}</p><p className="mt-1 text-xs text-white/55">Minecraft {server.minecraftVersion} · {server.implementation} {server.implementationVersion} · SpawnerX {server.pluginVersion}</p>
        <p className="mt-1 text-xs text-white/40">Registrado {new Date(server.createdAt).toLocaleString("pt-BR")} · Última validação: {server.lastValidatedAt ? new Date(server.lastValidatedAt).toLocaleString("pt-BR") : "sem dados"} · Conexão: desconhecida</p>
        {server.state === "PENDING" && <div className="mt-3 flex gap-2"><button disabled={busy === server.id} onClick={() => void act(server, "approve")} className="rounded-lg bg-[#a6cf74] px-3 py-2 text-xs font-bold text-[#17210f] disabled:opacity-50">Autorizar</button><button disabled={busy === server.id} onClick={() => void act(server, "reject")} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/75 disabled:opacity-50">Rejeitar</button></div>}
        {server.state !== "REVOKED" && <button disabled={busy === server.id} onClick={() => void act(server, "remove")} className="mt-3 rounded-lg border border-red-200/15 px-3 py-2 text-xs text-red-100/80 disabled:opacity-50">Remover servidor</button>}
      </div>)}</div>
    </article>)}</div>}
  </section>;
}

export function AccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [premiumWarning, setPremiumWarning] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("notice") !== "premium-key") return;
    setPremiumWarning(true);
    window.history.replaceState({}, "", "/account");
    const timeout = window.setTimeout(() => setPremiumWarning(false), 8000);
    return () => window.clearTimeout(timeout);
  }, []);

  async function signInWithGithub() {
    if (!apiUrl) {
      setError("A URL da API não está configurada para este site.");
      return;
    }

    setIsSigningIn(true);
    setError("");

    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: `${window.location.origin}/account`,
      });

      if (result.error) {
        setError(
          result.error.message ||
            result.error.statusText ||
            "Não foi possível iniciar o login com GitHub.",
        );
        setIsSigningIn(false);
      }
    } catch {
      setError("Não foi possível conectar ao GitHub. Tente novamente.");
      setIsSigningIn(false);
    }
  }

  async function signOut() {
    setIsSigningOut(true);
    setError("");

    try {
      const result = await authClient.signOut();
      if (result.error)
        setError("Não foi possível sair da conta. Tente novamente.");
    } catch {
      setError("Não foi possível sair da conta. Tente novamente.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-3 py-20 sm:px-6 sm:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-[18%] size-[min(80vw,40rem)] -translate-x-1/2 rounded-full bg-[#7ea94b]/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 size-80 rounded-full bg-emerald-950/20 blur-[100px]" />
      </div>

      {premiumWarning && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed left-4 right-4 top-20 z-[60] mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-xl border border-amber-200/25 bg-[#241b0b]/95 px-4 py-3 text-sm text-amber-100 shadow-xl backdrop-blur"
        >
          <span><strong className="font-minecraft-text mr-2">Login necessário</strong>Entre na conta para gerar sua key Premium.</span>
          <button type="button" onClick={() => setPremiumWarning(false)} className="shrink-0 rounded-md px-2 py-1 font-semibold text-amber-200 hover:bg-white/10">Entendi</button>
        </div>
      )}

      <section
        className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-[#a6cf74]/20 bg-[#10130f]/90 shadow-[0_28px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:rounded-3xl"
        aria-labelledby="account-title"
      >
        <div
          className="absolute inset-x-0 top-0 z-10 h-1 bg-[repeating-linear-gradient(90deg,#a6cf74_0_18px,transparent_18px_24px)] opacity-70"
          aria-hidden="true"
        />
        <div className="grid min-h-[min(690px,calc(100dvh-7rem))] md:grid-cols-[0.9fr_1.1fr]">
          <aside className="relative flex flex-col justify-between overflow-hidden border-b border-white/10 bg-[linear-gradient(145deg,rgba(166,207,116,0.13),rgba(12,16,12,0.2)_55%,rgba(0,0,0,0.2))] p-6 sm:p-9 md:border-b-0 md:border-r">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full border border-[#b2d78c]/10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-12 -left-4 size-48 rounded-full border border-[#b2d78c]/10"
            />

            <div className="relative">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-white/65 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b2d78c]"
              >
                <TbArrowLeft className="size-4" aria-hidden="true" />
                Voltar ao PluginsX
              </Link>
            </div>

            <div className="relative py-8 md:py-16">
              <div className="mb-6 grid size-14 place-items-center rounded-2xl border border-[#b4d991]/25 bg-[#a6cf74]/10 text-[#c5e4a5] shadow-[0_0_45px_rgba(166,207,116,0.1)]">
                <TbSparkles className="size-7" aria-hidden="true" />
              </div>
              <p className="font-minecraft-text mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#b4d991]">
                PluginsX · Conta
              </p>
              <h1
                id="account-title"
                className="font-minecraft-text max-w-sm text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl"
              >
                Seu mundo, suas ferramentas.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/55 sm:text-base">
                Entre para manter sua identidade por perto e acompanhar sua
                conta no ecossistema PluginsX.
              </p>
            </div>

            <div className="relative flex items-center gap-2 text-xs text-white/40">
              <TbShieldCheck
                className="size-4 text-[#a6cf74]"
                aria-hidden="true"
              />
              Acesso protegido pela sua conta GitHub
            </div>
          </aside>

          <div className="flex flex-col justify-center p-5 sm:p-9 md:p-12">
            {isPending ? (
              <output
                className="flex min-h-80 flex-col items-center justify-center text-center"
                aria-live="polite"
              >
                <TbLoader2
                  className="size-8 animate-spin text-[#b4d991]"
                  aria-hidden="true"
                />
                <p className="mt-4 text-sm text-white/55">
                  Verificando sua sessão…
                </p>
              </output>
            ) : session ? (
              <div className="mx-auto w-full max-w-2xl">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-minecraft-text mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#b4d991]">
                      Painel da conta
                    </p>
                    <h2 className="font-minecraft-text text-2xl font-bold text-white sm:text-3xl">
                      Que bom ter você aqui.
                    </h2>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[#a6cf74]/20 bg-[#a6cf74]/10 text-[#c2e3a0]">
                    <TbCheck className="size-5" aria-hidden="true" />
                  </span>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-4">
                    {session.user.image ? (
                      <span
                        aria-hidden="true"
                        className="size-14 shrink-0 rounded-full border border-white/15 object-cover"
                        style={{
                          backgroundImage: `url("${session.user.image}")`,
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                        }}
                      />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-[#b4d991]">
                        <TbUserCircle className="size-8" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-white">
                        {session.user.name}
                      </p>
                      <p className="truncate text-sm text-white/50">
                        {session.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-sm">
                    <span className="font-minecraft-text inline-flex items-center gap-2 text-xs text-white/65">
                      <TbBrandGithub className="size-4" aria-hidden="true" />
                      Conectado pelo GitHub
                    </span>
                    <span
                      role="img"
                      aria-label="Sessão ativa"
                      className="size-2 rounded-full bg-[#9fd26b] shadow-[0_0_12px_rgba(159,210,107,0.65)]"
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/"
                    className="font-minecraft-text group flex min-h-12 items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-semibold text-white/80 transition hover:border-[#a6cf74]/25 hover:bg-white/[0.07]"
                  >
                    Explorar plugins
                    <TbChevronRight
                      className="size-4 text-[#b4d991] transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    disabled={isSigningOut}
                    className="font-minecraft-text inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-200/15 bg-red-950/25 px-4 text-xs font-semibold text-red-100/80 transition hover:border-red-200/30 hover:bg-red-950/45 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSigningOut ? (
                      <TbLoader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <TbLogout2 className="size-4" aria-hidden="true" />
                    )}
                    Sair da conta
                  </button>
                </div>
                <LicensesPanel />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-md">
                <p className="font-minecraft-text mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#b4d991]">
                  Acesso rápido
                </p>
                <h2 className="font-minecraft-text text-2xl font-bold text-white sm:text-3xl">
                  Entre na sua conta
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  Use sua conta GitHub para entrar com segurança. Você será
                  levado ao GitHub e voltará para cá ao terminar.
                </p>

                {!apiUrl && (
                  <p className="mt-5 rounded-xl border border-amber-200/20 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/85">
                    A URL da API não está configurada. Defina{" "}
                    <code className="rounded bg-black/30 px-1.5 py-0.5">
                      NEXT_PUBLIC_API_URL
                    </code>{" "}
                    para habilitar o login.
                  </p>
                )}

                <button
                  type="button"
                  onClick={signInWithGithub}
                  disabled={isSigningIn || !apiUrl}
                  className="font-minecraft-text mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#a6cf74] px-5 text-sm font-bold text-[#17210f] shadow-[0_10px_32px_rgba(119,159,76,0.18)] transition hover:bg-[#c0e29d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c0e29d] disabled:cursor-wait disabled:opacity-65"
                >
                  {isSigningIn ? (
                    <TbLoader2
                      className="size-5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <TbBrandGithub className="size-5" aria-hidden="true" />
                  )}
                  {isSigningIn
                    ? "Conectando ao GitHub…"
                    : "Continuar com GitHub"}
                </button>

                <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-4">
                  <TbShieldCheck
                    className="mt-0.5 size-5 shrink-0 text-[#b4d991]"
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-5 text-white/45">
                    O PluginsX não recebe sua senha. A autenticação acontece no
                    GitHub e a sessão é protegida pela API.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mx-auto mt-5 w-full max-w-md rounded-xl border border-red-200/15 bg-red-950/40 px-4 py-3 text-sm text-red-100"
              >
                {error}
              </p>
            )}

            <p className="mt-8 text-center text-[11px] text-white/30">
              Ao continuar, você será redirecionado ao provedor para autorizar o
              acesso.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { RemoteServerState } from "@/lib/remote-spawnerx";
import { RemoteConnect } from "./RemoteConnect";
import { RemoteDashboard } from "./RemoteDashboard";

export async function RemoteServerBoundary({
  serverId,
  connect = false,
}: {
  serverId: string;
  connect?: boolean;
}) {
  if (!/^[a-f0-9-]{36}$/i.test(serverId)) notFound();
  const requestHeaders = await headers();
  const configuredApi = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(
    /\/$/,
    "",
  );
  const forwardedHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const requestOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : "";
  const apiCandidates = [
    configuredApi,
    requestOrigin,
    process.env.NODE_ENV === "development" ? "http://localhost:3333" : "",
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  if (!apiCandidates.length)
    return (
      <main className="remote-shell remote-unavailable">
        <h1>Conexão indisponível</h1>
        <p>
          A origem da API precisa estar configurada para validar o acesso ao
          servidor.
        </p>
      </main>
    );
  const cookie = requestHeaders.get("cookie") ?? "";
  async function apiGet(path: string, timeout: number) {
    let lastResponse: Response | null = null;
    for (const api of apiCandidates) {
      try {
        const response = await fetch(`${api}${path}`, {
          headers: { cookie },
          cache: "no-store",
          signal: AbortSignal.timeout(timeout),
        });
        lastResponse = response;
        // A same-origin rewrite is a reliable fallback when the public API
        // hostname is not reachable from the Next server runtime.
        if (response.ok || [401, 403, 404].includes(response.status))
          return response;
      } catch {
        // Try the next trusted origin. No private data is sent elsewhere.
      }
    }
    return lastResponse;
  }
  let session: { user?: { id: string } } | null;
  try {
    const response = await apiGet("/auth/get-session", 5000);
    if (!response?.ok) throw new Error("A sessão não pôde ser verificada.");
    session = await response.json();
  } catch {
    return (
      <main className="remote-shell remote-unavailable">
        <h1>Não foi possível verificar a sessão</h1>
        <p>
          A autenticação está temporariamente indisponível. Atualize a página
          para tentar novamente.
        </p>
      </main>
    );
  }
  if (!session?.user) {
    // The connection screen must keep a fragment token in memory while login
    // opens separately. No private server data is sent to anonymous visitors.
    if (connect)
      return (
        <RemoteConnect key={serverId} serverId={serverId} initialState={null} />
      );
    redirect(
      `/account?returnTo=${encodeURIComponent(`/server/${serverId}/spawnerx`)}`,
    );
  }
  let state: RemoteServerState;
  try {
    const response = await apiGet(`/remote/spawnerx/servers/${serverId}`, 6000);
    if (!response) throw new Error("A API não respondeu à consulta.");
    if (response.status === 403 || response.status === 404) notFound();
    if (response.status === 401)
      redirect(
        `/account?returnTo=${encodeURIComponent(`/server/${serverId}/spawnerx${connect ? "/connect" : ""}`)}`,
      );
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.message ?? "A API não respondeu à consulta.");
    }
    state = await response.json();
  } catch (failure) {
    // Next's navigation exceptions must propagate to the framework.
    if (failure && typeof failure === "object" && "digest" in failure)
      throw failure;
    if (connect)
      return (
        <RemoteConnect key={serverId} serverId={serverId} initialState={null} />
      );
    return (
      <RemoteDashboard
        key={serverId}
        serverId={serverId}
        initialState={null}
        ownerId={session.user.id}
      />
    );
  }
  return connect ? (
    <RemoteConnect key={serverId} serverId={serverId} initialState={state} />
  ) : (
    <RemoteDashboard
      key={serverId}
      serverId={serverId}
      initialState={state}
      ownerId={session.user.id}
    />
  );
}

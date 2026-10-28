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
  const api = (
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
  ).replace(/\/$/, "");
  if (!api)
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
  let session: { user?: { id: string } } | null;
  try {
    const response = await fetch(`${api}/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("A sessão não pôde ser verificada.");
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
    const response = await fetch(`${api}/remote/spawnerx/servers/${serverId}`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 403 || response.status === 404) notFound();
    if (response.status === 401)
      redirect(
        `/account?returnTo=${encodeURIComponent(`/server/${serverId}/spawnerx${connect ? "/connect" : ""}`)}`,
      );
    if (!response.ok) throw new Error("A API não respondeu à consulta.");
    state = await response.json();
  } catch (failure) {
    // Next's navigation exceptions must propagate to the framework.
    if (failure && typeof failure === "object" && "digest" in failure)
      throw failure;
    return (
      <main className="remote-shell remote-unavailable">
        <h1>Servidor indisponível para consulta</h1>
        <p>
          Não foi possível confirmar o estado desta instalação. Nenhuma ação
          administrativa foi liberada.
        </p>
      </main>
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoteServerState } from "@/lib/remote-spawnerx";

export function useRemoteServer(
  serverId: string,
  initialState: RemoteServerState | null,
) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    if (request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    try {
      const response = await fetch(
        `/remote/spawnerx/servers/${encodeURIComponent(serverId)}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        },
      );
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        if (!active.current || controller.signal.aborted) return null;
        setState(null);
        setUnauthorized(true);
        setError(
          response.status === 401
            ? "Entre na sua conta para continuar."
            : "Este servidor não está disponível para esta conta.",
        );
        return null;
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message ?? "Não foi possível consultar o servidor.",
        );
      if (!active.current || controller.signal.aborted) return null;
      setState(data as RemoteServerState);
      setError("");
      setUnauthorized(false);
      setNow(Date.now());
      return data as RemoteServerState;
    } catch (failure) {
      if (!controller.signal.aborted && active.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "A comunicação está indisponível. As ações foram bloqueadas até nova confirmação.",
        );
      return null;
    } finally {
      if (request.current === controller) request.current = null;
      if (active.current && !controller.signal.aborted) setChecking(false);
    }
  }, [serverId]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const interval = window.setInterval(visible, 3000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active.current = false;
      request.current?.abort();
      request.current = null;
      window.clearInterval(interval);
      window.clearInterval(clock);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const leaseEnd = Date.parse(state?.session?.leaseExpiresAt ?? "");
  const manageable = Boolean(
    state?.manageable && !error && Number.isFinite(leaseEnd) && leaseEnd > now,
  );
  return { state, error, checking, refresh, manageable, unauthorized, now };
}

export async function remoteMutation(
  serverId: string,
  action: string,
  body: unknown,
) {
  const response = await fetch(
    `/remote/spawnerx/servers/${encodeURIComponent(serverId)}/${action}`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.message ??
        "A ação não foi aceita. Confira a conexão e tente novamente.",
    );
  return data;
}

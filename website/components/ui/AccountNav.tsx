"use client";

import Link from "next/link";
import { useState } from "react";
import { TbChartBar, TbLoader2, TbLogout2, TbUserCircle } from "react-icons/tb";

import { useHydrated } from "@/hooks/useHydrated";
import { authClient } from "@/lib/auth-client";

export function AccountNav() {
  const { data: session, isPending } = authClient.useSession();
  const hasHydrated = useHydrated();
  const isSessionReady = hasHydrated && !isPending;
  const isOwner = Boolean(
    session &&
      (session.user as typeof session.user & { role?: string }).role ===
        "owner",
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setIsSigningOut(true);
    setError("");

    try {
      const result = await authClient.signOut();
      if (result.error) setError("Não foi possível sair. Tente novamente.");
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 sm:right-5 sm:top-5">
      {isSessionReady && session ? (
        <>
          {isOwner && (
            <Link
              href="/panel"
              aria-label="Abrir painel de vendas"
              title="Painel de vendas"
              className="font-minecraft-text inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#a6cf74]/30 bg-[#111a16]/90 px-3 text-[10px] font-bold text-[#d2efb2] shadow-lg backdrop-blur-xl transition hover:border-[#a6cf74]/60 hover:bg-[#1b2c22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9e9a8]"
            >
              <TbChartBar size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Painel</span>
            </Link>
          )}
          <Link
            href="/account"
            aria-label={`Abrir conta de ${session.user.name}`}
            title={session.user.name}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/75 px-3 text-sm font-semibold text-white shadow-lg backdrop-blur-xl transition hover:border-[#a6cf74]/40 hover:bg-black/90"
          >
            {session.user.image ? (
              <span
                aria-hidden="true"
                className="size-7 shrink-0 rounded-full border border-white/15 bg-cover bg-center"
                style={{ backgroundImage: `url("${session.user.image}")` }}
              />
            ) : (
              <TbUserCircle
                className="size-5 shrink-0 text-[#b9df91]"
                aria-hidden="true"
              />
            )}
            <span className="font-minecraft-text hidden max-w-40 truncate text-xs sm:inline">
              {session.user.name}
            </span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
            aria-label="Sair da conta"
            title="Sair da conta"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/75 text-white/80 shadow-lg backdrop-blur-xl transition hover:border-red-300/30 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningOut ? (
              <TbLoader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <TbLogout2 className="size-5" aria-hidden="true" />
            )}
          </button>
        </>
      ) : (
        <Link
          href="/account"
          aria-busy={!isSessionReady}
          className="font-minecraft-text inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#a6cf74]/35 bg-[#a6cf74] px-4 text-xs font-bold text-[#14200f] shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition hover:bg-[#c0e29d]"
        >
          {!isSessionReady ? (
            <TbLoader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <TbUserCircle className="size-4" aria-hidden="true" />
          )}
          <span>Entrar</span>
        </Link>
      )}
      {error && (
        <output
          role="alert"
          aria-live="assertive"
          className="absolute right-0 top-12 block w-56 rounded-lg bg-red-950/95 px-3 py-2 text-xs text-red-100 shadow-lg"
        >
          {error}
        </output>
      )}
    </div>
  );
}

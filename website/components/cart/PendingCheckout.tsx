import { TbExternalLink, TbRefresh } from "react-icons/tb";

export type PendingPurchase = {
  plan: string;
  status: string;
  createdAt: string;
  externalReference?: string;
  checkoutUrl?: string;
  subscriptionCancellationStatus?: "pending" | "cancelled" | "failed";
  upgradeCreditReversed?: boolean;
  entitlementCheckoutReserved?: boolean;
  message?: string;
};

export function PendingCheckout({
  purchase,
  refreshing,
  onRefresh,
}: {
  purchase: PendingPurchase | null | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (!purchase) return null;
  const failedAttempt =
    purchase.entitlementCheckoutReserved === true &&
    ["rejected", "cancelled"].includes(purchase.status);
  if (
    purchase.status !== "pending" &&
    !failedAttempt &&
    !purchase.upgradeCreditReversed
  )
    return null;
  const creditReversed = purchase.upgradeCreditReversed === true;
  const awaitingCancellation =
    purchase.subscriptionCancellationStatus === "failed";
  let checkoutUrl: string | null = null;
  try {
    const url = new URL(purchase.checkoutUrl ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) {
      checkoutUrl = url.href;
    }
  } catch {
    // An ambiguous provider response can leave a reservation without a URL.
  }

  return (
    <section
      aria-label="Compra pendente"
      className="mb-5 grid gap-3 border-2 border-outline/45 bg-surface p-4 shadow-[0_4px_0_var(--site-shadow)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <h2 className="font-minecraft-text text-sm font-bold text-accent-soft">
          {creditReversed
            ? "Seu upgrade precisa de revisão"
            : awaitingCancellation
              ? "Finalizando seu upgrade"
              : "Sua compra continua aqui"}
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted" aria-live="polite">
          {creditReversed
            ? "O pagamento usado como crédito foi estornado. O upgrade precisa de revisão; entre em contato com o suporte."
            : (purchase.message ??
              (awaitingCancellation
                ? "O pagamento foi recebido. Estamos encerrando a renovação mensal antes de liberar o vitalício. Acompanhe a confirmação por aqui."
                : failedAttempt && checkoutUrl
                  ? "A última tentativa não foi aprovada. O checkout continua disponível para tentar novamente com as mesmas condições do pedido."
                  : checkoutUrl
                    ? "Retome o checkout já criado ou consulte a confirmação se você já pagou. Seu pedido mantém as condições aceitas."
                    : "Estamos confirmando a criação do checkout com o provedor. Atualize o estado da compra antes de iniciar outro pedido."))}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!creditReversed && !awaitingCancellation && checkoutUrl && (
          <a
            href={checkoutUrl}
            className="inline-flex min-h-10 items-center gap-2 border border-outline-strong px-3 text-xs font-bold text-accent-soft hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
          >
            Retomar pagamento <TbExternalLink aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          className="inline-flex min-h-10 items-center gap-2 border border-outline px-3 text-xs text-muted hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong disabled:opacity-50"
        >
          <TbRefresh
            aria-hidden="true"
            className={refreshing ? "animate-spin" : ""}
          />
          {refreshing ? "Consultando…" : "Atualizar compra"}
        </button>
      </div>
    </section>
  );
}

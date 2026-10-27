export type OfferDetails = {
  id: string;
  amount: number;
  formattedPrice: string;
  name?: string;
  description?: string;
  serverLimit?: number;
  durationHours?: number;
  features?: string[];
  duration?: number;
  durationUnit?: string;
  promotion?: boolean;
  basePriceCents?: number;
  enabled?: boolean;
  visible?: boolean;
  featured?: boolean;
};
export function PlanPromotion({ offer }: { offer: OfferDetails | undefined }) {
  if (
    !offer?.promotion ||
    !offer.basePriceCents ||
    offer.basePriceCents <= Math.round(offer.amount * 100)
  )
    return null;
  const percent = Math.round(
    (1 - Math.round(offer.amount * 100) / offer.basePriceCents) * 100,
  );
  return (
    <span className="block text-[10px] text-muted">
      <del>
        {new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(offer.basePriceCents / 100)}
      </del>
      <span className="ml-2 text-accent-soft">−{percent}%</span>
    </span>
  );
}

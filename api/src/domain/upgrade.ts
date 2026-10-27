import { addOneCalendarMonth } from "../http/plugins/billing-config.js";
export function firstMonthCredit(
  input: {
    targetPriceCents: number;
    paidCents: number;
    paidAt: Date;
    status: string;
    subscriptionMatches: boolean;
    alreadyClaimed: boolean;
  },
  now = new Date(),
) {
  const endsAt = addOneCalendarMonth(input.paidAt);
  const eligible =
    input.status === "approved" &&
    input.subscriptionMatches &&
    !input.alreadyClaimed &&
    input.paidAt <= now &&
    now < endsAt;
  return {
    creditCents: eligible
      ? Math.min(input.targetPriceCents, Math.max(0, input.paidCents))
      : 0,
    endsAt,
    eligible,
  };
}

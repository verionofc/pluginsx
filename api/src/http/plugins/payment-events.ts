import { PaymentEvent } from "../../database/models/PaymentEvent.js";

/** Only completed notifications are acknowledged as duplicates. Crashed claims can be retried. */
export async function claimPaymentEvent(eventId: string, type: string, resourceId: string, now = new Date()): Promise<"claimed" | "processed" | "busy"> {
  try {
    await PaymentEvent.create({ eventId, type, resourceId, status: "processing", receivedAt: now });
    return "claimed";
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
  }
  const previous = await PaymentEvent.findOne({ eventId }).lean();
  if (previous?.status === "processed") return "processed";
  const reclaimed = await PaymentEvent.findOneAndUpdate(
    { eventId, status: "processing", receivedAt: { $lte: new Date(now.getTime() - 5 * 60_000) } },
    { $set: { receivedAt: now } },
    { new: true },
  );
  return reclaimed ? "claimed" : "busy";
}

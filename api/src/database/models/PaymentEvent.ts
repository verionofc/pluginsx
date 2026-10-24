import { Schema, model } from "mongoose";

export interface PaymentEventRecord {
  eventId: string;
  type: string;
  resourceId: string;
  status: "processing" | "processed";
  receivedAt: Date;
}
const schema = new Schema<PaymentEventRecord>({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  resourceId: { type: String, required: true },
  status: { type: String, enum: ["processing", "processed"], required: true },
  receivedAt: { type: Date, default: Date.now },
});
export const PaymentEvent = model<PaymentEventRecord>("payment_event", schema);

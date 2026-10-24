import { PlanAccess } from "../../database/models/PlanAccess.js";
import { env } from "../../env.js";

export function hasTrustedWebOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && [env.URL, env.DEV_URL].some((url) => new URL(url).origin === origin));
}

export async function hasPremiumAccess(userId: string): Promise<boolean> {
  const access = await PlanAccess.findOne({ userId, status: "active", $or: [
    { plan: "lifetime" },
    { plan: "monthly", expiresAt: { $gt: new Date() } },
  ] }).select({ _id: 1 }).lean();
  return Boolean(access);
}

export async function getPaidPlan(userId: string): Promise<"monthly" | "lifetime" | null> {
  const access = await PlanAccess.findOne({ userId, status: "active", $or: [
    { plan: "lifetime" },
    { plan: "monthly", expiresAt: { $gt: new Date() } },
  ] }).select({ plan: 1 }).lean();
  return access?.plan === "monthly" || access?.plan === "lifetime" ? access.plan : null;
}

import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import { z } from "zod";
import { Chargeback, MercadoPagoConfig, Payment, PreApproval, Preference, WebhookSignatureValidator } from "mercadopago";

import { env } from "../../env.js";
import { License } from "../../database/models/License.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { PaymentEvent } from "../../database/models/PaymentEvent.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import { generateTemporaryPremiumLicense } from "../plugins/license.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { hasPremiumAccess, hasTrustedWebOrigin } from "../plugins/plan-access.js";
import {
  MAX_SERVER_SLOTS_PER_PURCHASE,
  PLAN_CATALOG,
  PLANS_CONFIG,
  SERVER_SLOT_PRICE,
  TRIAL_DURATION_HOURS,
  TRIAL_DURATION_MS,
  addRecurringInterval,
  formatPlanAmount,
  getPlanConfig,
  safeReturnPath,
} from "../plugins/billing-config.js";

const checkoutBody = z.object({
  plan: z.enum(["monthly", "lifetime", "aether", "server_slots"]),
  serverSlots: z.number().int().min(0).max(MAX_SERVER_SLOTS_PER_PURCHASE).default(0),
  returnTo: z.string().optional(),
}).superRefine((value, context) => {
  if (value.plan === "monthly" && value.serverSlots > 0) {
    context.addIssue({ code: "custom", path: ["serverSlots"], message: "Slots extras não podem ser incluídos em uma assinatura mensal." });
  }
  if (value.plan === "server_slots" && value.serverSlots < 1) {
    context.addIssue({ code: "custom", path: ["serverSlots"], message: "Selecione pelo menos uma vaga de servidor." });
  }
});

const getClient = () => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new Error("Mercado Pago is not configured");
  return new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
};
const appUrl = () => {
  if (!env.NEXT_PUBLIC_APP_URL) throw new Error("Public website URL is not configured");
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
};
async function rateLimit(userId: string, action: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const result = await BillingRateLimit.collection.findOneAndUpdate(
    { key: `${action}:${userId}` },
    [{ $set: {
      count: { $cond: [{ $gt: ["$expiresAt", now] }, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
      expiresAt: { $cond: [{ $gt: ["$expiresAt", now] }, "$expiresAt", expiresAt] },
    } }],
    { upsert: true, returnDocument: "after", includeResultMetadata: false },
  );
  return Number(result?.count ?? 0) <= limit;
}
const isDuplicateKeyError = (error: unknown) =>
  Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);

async function restoreLegacyTrialUse(userId: string) {
  const access = await PlanAccess.findOne({ userId }).select({ trialUsedAt: 1 }).lean();
  if (access?.trialUsedAt) return;

  const legacyUse = await BillingRateLimit.findOne({
    key: `temporary-trial:${userId}`,
    count: { $gt: 0 },
  }).lean();
  if (!legacyUse) return;

  const expiresAt = legacyUse.expiresAt;
  const usedAt = new Date(expiresAt.getTime() - TRIAL_DURATION_MS);
  const trialStatus = expiresAt > new Date() ? "trial" : "expired";

  try {
    await PlanAccess.findOneAndUpdate(
      { userId, trialUsedAt: null },
      {
        $set: { trialUsedAt: usedAt },
        $setOnInsert: {
          userId,
          plan: "free",
          status: trialStatus,
          startsAt: usedAt,
          expiresAt,
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
}

async function claimTrialUse(userId: string, usedAt: Date, expiresAt: Date, code: string) {
  return PlanAccess.findOneAndUpdate(
    { userId, trialUsedAt: null },
    {
      $set: {
        trialUsedAt: usedAt,
        trialLicenseCode: code,
        trialLicenseExpiresAt: expiresAt,
      },
      $setOnInsert: {
        userId,
        plan: "free",
        status: "trial",
        startsAt: usedAt,
        expiresAt,
      },
    },
    { upsert: true, new: true },
  );
}

async function getActiveTrialLicense(userId: string, now = new Date()) {
  const access = await PlanAccess.findOne({ userId })
    .select({ trialLicenseCode: 1, trialLicenseExpiresAt: 1 })
    .lean();
  if (!access?.trialLicenseCode || !access.trialLicenseExpiresAt) return null;
  if (access.trialLicenseExpiresAt > now) {
    return { code: access.trialLicenseCode, expiresAt: access.trialLicenseExpiresAt };
  }

  await PlanAccess.updateOne(
    { userId, trialLicenseExpiresAt: { $lte: now } },
    { $unset: { trialLicenseCode: 1 } },
  );
  return null;
}

const getCurrentAccess = async (userId: string) => {
  const access = await PlanAccess.findOne({ userId }).lean();
  if (!access) return null;
  if ((access.plan === "lifetime" || access.plan === "aether") && access.status === "active") return access;
  if ((access.plan === "monthly" || access.plan === "free") && access.status === "active" && access.expiresAt && access.expiresAt > new Date()) return access;
  if (access.plan === "free" && access.status === "trial" && access.expiresAt && access.expiresAt > new Date()) return access;
  const expired = access.expiresAt && access.expiresAt <= new Date();
  return { ...access, status: expired && ["active", "trial"].includes(access.status) ? "expired" : access.status };
};

export const billingRoutes = new Elysia({ prefix: "/billing" })
  .use(authSessionPlugin)
  .get("/catalog", () => ({
    currency: PLANS_CONFIG.currency,
    trialEnabled: env.TEMP_LICENSE_TRIAL_ENABLED,
    plans: env.TEMP_LICENSE_TRIAL_ENABLED ? PLAN_CATALOG : PLAN_CATALOG.filter((plan) => plan.id !== "free"),
    serverSlot: {
      amount: SERVER_SLOT_PRICE,
      formattedPrice: formatPlanAmount(SERVER_SLOT_PRICE),
      name: PLANS_CONFIG.serverSlot.name,
      maxPerPurchase: MAX_SERVER_SLOTS_PER_PURCHASE,
    },
  }))
  .get("/state", async ({ user }) => {
    await restoreLegacyTrialUse(user.id);
    const access = await getCurrentAccess(user.id);
    const temporaryLicense = await getActiveTrialLicense(user.id);
    const lastPurchase = await PlanPurchase.findOne({ userId: user.id }).sort({ createdAt: -1 }).select({ plan: 1, status: 1, createdAt: 1 }).lean();
    const [slotPurchases] = await PlanPurchase.aggregate<{ total: number }>([
      { $match: { userId: user.id, status: "approved" } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$serverSlots", 0] } } } },
    ]);
    return {
      access: access ? {
        plan: access.plan,
        status: access.status,
        trialUsedAt: access.trialUsedAt,
        trialExpiresAt: access.trialLicenseExpiresAt,
        startsAt: access.startsAt,
        expiresAt: access.expiresAt,
        cancelAtPeriodEnd: access.cancelAtPeriodEnd,
        canCancelSubscription: access.plan === "monthly" && access.status === "active" && Boolean(access.mercadoPagoSubscriptionId) && !access.cancelAtPeriodEnd,
      } : null,
      temporaryLicense,
      lastPurchase,
      additionalServerSlots: Number(slotPurchases?.total ?? 0),
    };
  }, { auth: true })
  .post("/trial", async ({ user, status, request }) => {
    if (!env.TEMP_LICENSE_TRIAL_ENABLED) return status(404, { code: "TRIAL_DISABLED", message: "O teste temporário está desativado." });
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    await restoreLegacyTrialUse(user.id);
    const existingAccess = await PlanAccess.findOne({ userId: user.id })
      .select({ trialUsedAt: 1, trialLicenseExpiresAt: 1 })
      .lean();
    if (existingAccess?.trialUsedAt) {
      const activeTrialLicense = await getActiveTrialLicense(user.id);
      if (activeTrialLicense) {
        return { plan: "trial", status: "active", tier: "plus", ...activeTrialLicense };
      }
      return status(409, {
        code: "TRIAL_ALREADY_USED",
        message: existingAccess.trialLicenseExpiresAt
          ? "O período de visualização da key temporária terminou. Ela não pode ser recuperada nem gerada novamente."
          : "Esta conta já usou o Trial. A key não está disponível para recuperação e não pode ser gerada novamente.",
      });
    }
    if (await hasPremiumAccess(user.id)) return status(409, { code: "PREMIUM_ALREADY_ACTIVE", message: "Sua conta já tem acesso Premium/Plus." });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);
    if (!(await rateLimit(user.id, "temporary-trial-create", 3, 60_000))) return status(429, { code: "TRIAL_RATE_LIMITED", message: "Muitas solicitações de teste. Aguarde um minuto." });
    const code = await generateTemporaryPremiumLicense(expiresAt);
    try {
      const claimed = await claimTrialUse(user.id, now, expiresAt, code);
      if (!claimed) {
        await License.deleteOne({ _id: code, sourcePlan: "trial" });
        const activeTrialLicense = await getActiveTrialLicense(user.id);
        if (activeTrialLicense) {
          return { plan: "trial", status: "active", tier: "plus", ...activeTrialLicense };
        }
        return status(409, { code: "TRIAL_ALREADY_USED", message: `Esta conta já usou sua licença temporária. Cada conta recebe uma única key válida por ${TRIAL_DURATION_HOURS} horas.` });
      }
    } catch (error) {
      await License.deleteOne({ _id: code, sourcePlan: "trial" });
      if (isDuplicateKeyError(error)) {
        const activeTrialLicense = await getActiveTrialLicense(user.id);
        if (activeTrialLicense) {
          return { plan: "trial", status: "active", tier: "plus", ...activeTrialLicense };
        }
        return status(409, { code: "TRIAL_ALREADY_USED", message: `Esta conta já usou sua licença temporária. Cada conta recebe uma única key válida por ${TRIAL_DURATION_HOURS} horas.` });
      }
      throw error;
    }
    return { plan: "trial", status: "active", tier: "plus", code, expiresAt };
  }, { auth: true })
  .post("/checkout", async ({ user, body, status, request }) => {
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    if (!(await rateLimit(user.id, "checkout", 5, 60_000))) return status(429, { message: "Muitas tentativas de checkout. Aguarde um minuto." });
    const { plan, serverSlots, returnTo } = checkoutBody.parse(body);
    const safeReturnTo = safeReturnPath(returnTo);
    const current = await PlanAccess.findOne({ userId: user.id }).lean();
    if (plan === "server_slots") {
      if (!(await hasPremiumAccess(user.id))) {
        const paidPlans = [PLANS_CONFIG.plans.monthly.name, PLANS_CONFIG.plans.lifetime.name, PLANS_CONFIG.plans.aether.name];
        return status(409, { message: `Ative um plano ${paidPlans.join(", ")} antes de comprar vagas extras.` });
      }
    } else {
      if ((plan === "lifetime" || plan === "aether") && (current?.plan === "lifetime" || current?.plan === "aether") && current.status === "active") return status(409, { message: "Um plano vitalício já está ativo." });
      if (current?.plan === "monthly" && ["active", "pending", "past_due"].includes(current.status)) return status(409, { message: "Já existe uma assinatura mensal. Gerencie-a antes de contratar outro plano." });
    }
    const externalReference = randomUUID();
    const planConfig = plan === "server_slots" ? null : getPlanConfig(plan);
    const planPrice = planConfig?.amount ?? 0;
    const price = Math.round((planPrice + serverSlots * SERVER_SLOT_PRICE) * 100) / 100;
    const purchase = await PlanPurchase.create({ userId: user.id, plan, serverSlots, amount: price, currency: PLANS_CONFIG.currency, externalReference, status: "pending" });
    const client = getClient();
    const base = appUrl();
    const returnPage = safeReturnTo === "/cart" ? "/cart" : "/plans";
    const returnUrl = (result: "success" | "pending" | "failure" | "subscription") =>
      `${base}${returnPage}?return=${result}&purchase=${externalReference}&returnTo=${encodeURIComponent(safeReturnTo)}`;
    try {
      if (plan === "lifetime" || plan === "aether" || plan === "server_slots") {
        const planItem = planConfig
          ? {
              id: `pluginsx-${plan}`,
              title: `PluginsX | ${planConfig.name}`,
              description: `Acesso vitalício Premium/Plus do PluginsX com até ${planConfig.serverLimit} servidores.`,
              quantity: 1,
              currency_id: PLANS_CONFIG.currency as "BRL",
              unit_price: planConfig.amount,
            }
          : null;
        const items = [
          ...(planItem ? [planItem] : []),
          ...(serverSlots > 0 ? [{ id: "pluginsx-server-slot", title: `PluginsX | ${PLANS_CONFIG.serverSlot.name}`, description: "Uma vaga adicional permanente para uma licença Plus ativa.", quantity: serverSlots, currency_id: PLANS_CONFIG.currency as "BRL", unit_price: SERVER_SLOT_PRICE }] : []),
        ];
        const preference = await new Preference(client).create({
          requestOptions: { idempotencyKey: externalReference },
          body: {
            external_reference: externalReference,
            items,
            back_urls: { success: returnUrl("success"), pending: returnUrl("pending"), failure: returnUrl("failure") },
            notification_url: `${env.URL.replace(/\/$/, "")}/billing/webhook`,
            auto_return: "approved",
          },
        });
        if (!preference.id || !preference.init_point) throw new Error("Checkout preference missing redirect URL");
        await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { preferenceId: preference.id } });
        return { checkoutUrl: preference.init_point, purchaseReference: externalReference };
      }
      const subscription = await new PreApproval(client).create({
        requestOptions: { idempotencyKey: externalReference },
        body: {
          reason: "PluginsX | Creeper - Premium/Plus",
          external_reference: externalReference,
          payer_email: user.email,
          back_url: returnUrl("subscription"),
          auto_recurring: {
            frequency: PLANS_CONFIG.plans.monthly.recurrence.frequency,
            frequency_type: PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
            transaction_amount: price,
            currency_id: PLANS_CONFIG.currency as "BRL",
          },
        },
      });
      if (!subscription.id || !subscription.init_point) throw new Error("Subscription checkout missing redirect URL");
      await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { mercadoPagoSubscriptionId: subscription.id } });
      return { checkoutUrl: subscription.init_point, purchaseReference: externalReference };
    } catch (error) {
      const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
      console.error("[billing] Mercado Pago checkout creation failed", {
        plan,
        name: details.name,
        message: details.message ?? String(error),
        status: details.status,
        error: details.error,
        causes: details.causes,
      });
      await PlanPurchase.updateOne({ _id: purchase._id, status: "pending" }, { $set: { status: "cancelled" } });
      return status(503, { message: "Não foi possível iniciar o checkout agora. Tente novamente." });
    }
  }, { auth: true, body: checkoutBody })
  .post("/cancel", async ({ user, status, request }) => {
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    if (!(await rateLimit(user.id, "cancel", 5, 60_000))) return status(429, { message: "Muitas tentativas de cancelamento. Aguarde um minuto." });
    const access = await PlanAccess.findOne({ userId: user.id, plan: "monthly", mercadoPagoSubscriptionId: { $exists: true } });
    if (!access?.mercadoPagoSubscriptionId) return status(404, { message: "Nenhuma assinatura mensal foi encontrada." });
    const purchase = await PlanPurchase.findOne({ userId: user.id, mercadoPagoSubscriptionId: access.mercadoPagoSubscriptionId });
    if (!purchase) return status(404, { message: "Nenhuma assinatura mensal foi encontrada." });
    try {
      const subscription = await new PreApproval(getClient()).update({ id: access.mercadoPagoSubscriptionId, body: { status: "cancelled" } });
      const periodEnd = access.expiresAt && access.expiresAt > new Date() ? access.expiresAt : undefined;
      access.status = periodEnd ? "active" : "canceled";
      access.cancelAtPeriodEnd = Boolean(periodEnd);
      await access.save();
      return { status: subscription.status ?? "cancelled", expiresAt: periodEnd };
    } catch {
      return status(503, { message: "Não foi possível cancelar a renovação agora." });
    }
  }, { auth: true })
  .get("/purchase/:reference", async ({ user, params, status }) => {
    const purchase = await PlanPurchase.findOne({ externalReference: params.reference, userId: user.id }).select({ plan: 1, serverSlots: 1, status: 1, createdAt: 1 }).lean();
    if (!purchase) return status(404, { message: "Compra não encontrada." });
    return purchase;
  }, { auth: true, params: z.object({ reference: z.string().uuid() }) })
  .post("/webhook", async ({ request, query, status }) => {
    const signature = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    const dataId = query["data.id"] ?? query.id;
    if (!env.MERCADOPAGO_WEBHOOK_SECRET || !signature || !requestId || !dataId) return status(401, { message: "Invalid notification" });
    try {
      WebhookSignatureValidator.validate({ xSignature: signature, xRequestId: requestId, dataId, secret: env.MERCADOPAGO_WEBHOOK_SECRET, toleranceSeconds: 300 });
    } catch { return status(401, { message: "Invalid notification" }); }
    const body = await request.json().catch(() => null) as { type?: unknown; action?: unknown; data?: { id?: unknown } } | null;
    const resourceId = String(body?.data?.id ?? dataId);
    const type = String(body?.type ?? body?.action ?? "");
    const eventId = `${String((body as { id?: unknown } | null)?.id ?? requestId)}:${type}:${resourceId}`;
    try {
      await PaymentEvent.create({ eventId, type, resourceId, status: "processing" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) return { received: true, duplicate: true };
      return status(503, { message: "Notification could not be recorded" });
    }
    let chargeEventId: string | undefined;
    let ownsChargeClaim = false;
    try {
      const client = getClient();
      let paymentResourceId = resourceId;
      let authorizedSubscriptionId: string | undefined;
      if (type === "subscription_authorized_payment") {
        if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new Error("Mercado Pago is not configured");
        const invoiceResponse = await fetch(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(resourceId)}`, {
          headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
        });
        if (!invoiceResponse.ok) throw new Error("Authorized payment could not be verified");
        const invoice = await invoiceResponse.json() as {
          preapproval_id?: string;
          transaction_amount?: number | string;
          currency_id?: string;
          payment?: { id?: number | string };
        };
        const invoicePurchase = invoice.preapproval_id
          ? await PlanPurchase.findOne({ mercadoPagoSubscriptionId: invoice.preapproval_id, plan: "monthly" })
          : null;
        if (!invoicePurchase || Number(invoice.transaction_amount) !== invoicePurchase.amount || invoice.currency_id !== PLANS_CONFIG.currency) throw new Error("Invoice does not match an internal subscription");
        authorizedSubscriptionId = invoice.preapproval_id;
        if (!invoice.payment?.id) {
          await PaymentEvent.updateOne({ eventId }, { $set: { status: "processed" } });
          return { received: true, pending: true };
        }
        paymentResourceId = String(invoice.payment.id);
      }
      if (type.startsWith("payment") || type === "subscription_authorized_payment") {
        const payment = await new Payment(client).get({ id: paymentResourceId });
        const external = payment.external_reference;
        const linkedSubscriptionId = (payment as typeof payment & { preapproval_id?: string }).preapproval_id;
        const purchaseAlternatives = [
          ...(external ? [{ externalReference: external }] : []),
          ...((linkedSubscriptionId ?? authorizedSubscriptionId) ? [{ mercadoPagoSubscriptionId: linkedSubscriptionId ?? authorizedSubscriptionId }] : []),
        ];
        if (purchaseAlternatives.length === 0) throw new Error("Missing purchase reference");
        const purchase = await PlanPurchase.findOne({ $or: purchaseAlternatives });
        if (!purchase || Number(payment.transaction_amount) !== purchase.amount || payment.currency_id !== PLANS_CONFIG.currency) throw new Error("Payment does not match an internal purchase");
        const paymentStatus = payment.status;
        const nextStatus = payment.status_detail === "partially_refunded" ? "refunded" : paymentStatus === "approved" ? "approved" : paymentStatus === "refunded" ? "refunded" : paymentStatus === "charged_back" ? "charged_back" : paymentStatus === "cancelled" ? "cancelled" : paymentStatus === "rejected" ? "rejected" : "pending";
        let shouldApplyMonthlyCharge = nextStatus === "approved" && purchase.plan === "monthly";
        if (shouldApplyMonthlyCharge) {
          chargeEventId = `payment-approved:${String(payment.id)}`;
          try {
            await PaymentEvent.create({ eventId: chargeEventId, type: "payment.approved", resourceId: paymentResourceId, status: "processing" });
            ownsChargeClaim = true;
          } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
            const priorCharge = await PaymentEvent.findOne({ eventId: chargeEventId }).lean();
            if (priorCharge?.status === "processed") shouldApplyMonthlyCharge = false;
            else if (priorCharge?.receivedAt && priorCharge.receivedAt < new Date(Date.now() - 5 * 60_000)) {
              const reclaimed = await PaymentEvent.findOneAndUpdate(
                { eventId: chargeEventId, status: "processing", receivedAt: { $lt: new Date(Date.now() - 5 * 60_000) } },
                { $set: { receivedAt: new Date() } },
                { new: true },
              );
              if (reclaimed) ownsChargeClaim = true;
              else throw new Error("Payment charge is already being applied");
            } else throw new Error("Payment charge is already being applied");
          }
        }
        await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { status: nextStatus, mercadoPagoPaymentId: String(payment.id) } });
        const transactionUpdate: Record<string, unknown> = {
          userId: purchase.userId,
          purchaseReference: purchase.externalReference,
          providerPaymentId: String(payment.id),
          plan: purchase.plan,
          serverSlots: purchase.serverSlots ?? 0,
          amount: Number(payment.transaction_amount),
          currency: payment.currency_id,
          status: nextStatus,
        };
        if (payment.date_approved || nextStatus === "approved") {
          transactionUpdate.paidAt = new Date(payment.date_approved ?? payment.date_created ?? Date.now());
        }
        await BillingTransaction.updateOne(
          { providerPaymentId: String(payment.id) },
          { $set: transactionUpdate },
          { upsert: true },
        );
        if (purchase.plan === "lifetime" || purchase.plan === "aether") {
          if (nextStatus === "approved") {
            const currentAccess = await PlanAccess.findOne({ userId: purchase.userId }).lean();
            const hasActivePermanentPlan = (currentAccess?.plan === "lifetime" || currentAccess?.plan === "aether") && currentAccess.status === "active";
            if (!hasActivePermanentPlan) {
              await PlanAccess.updateOne({ userId: purchase.userId }, {
                $set: { userId: purchase.userId, plan: purchase.plan, status: "active", startsAt: new Date(), expiresAt: null },
                $unset: { grantSource: "", serverLimitOverride: "", serverLimitUnlimited: "" },
              }, { upsert: true });
            }
          }
          if (["refunded", "charged_back"].includes(nextStatus)) {
            await PlanAccess.updateOne({ userId: purchase.userId, plan: purchase.plan, grantSource: { $ne: "owner" } }, { $set: { status: "revoked" } });
          }
        } else if (purchase.plan === "monthly" && purchase.mercadoPagoSubscriptionId) {
          if (shouldApplyMonthlyCharge) {
            const existingAccess = await PlanAccess.findOne({ userId: purchase.userId });
            const access = existingAccess?.plan === "monthly" ? existingAccess : null;
            const start = new Date(payment.date_approved ?? payment.date_created ?? purchase.createdAt);
            const paidThrough = addRecurringInterval(
              start,
              PLANS_CONFIG.plans.monthly.recurrence.frequency,
              PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
            );
            const expiresAt = access?.expiresAt && access.expiresAt > paidThrough ? access.expiresAt : paidThrough;
            const hasActivePermanentPlan = (existingAccess?.plan === "lifetime" || existingAccess?.plan === "aether") && existingAccess.status === "active";
            if (!hasActivePermanentPlan) {
              await PlanAccess.updateOne({ userId: purchase.userId }, { $set: { userId: purchase.userId, plan: "monthly", status: "active", startsAt: access?.startsAt ?? start, expiresAt, mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId, cancelAtPeriodEnd: false }, $unset: { grantSource: "" } }, { upsert: true });
            }
          } else if (nextStatus === "rejected") {
            await PlanAccess.updateOne({ userId: purchase.userId, plan: "monthly", mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId, expiresAt: { $lte: new Date() } }, { $set: { status: "past_due" } });
          } else if (["refunded", "charged_back"].includes(nextStatus)) {
            await PlanAccess.updateOne({ userId: purchase.userId, plan: "monthly", mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId }, { $set: { status: "revoked" } });
          }
        }
        if (chargeEventId && shouldApplyMonthlyCharge) await PaymentEvent.updateOne({ eventId: chargeEventId }, { $set: { status: "processed" } });
      } else if (type === "subscription_preapproval") {
        const subscription = await new PreApproval(client).get({ id: resourceId });
        const purchase = subscription.external_reference ? await PlanPurchase.findOne({ externalReference: subscription.external_reference, mercadoPagoSubscriptionId: resourceId }) : null;
        if (!purchase || purchase.plan !== "monthly" || Number(subscription.auto_recurring?.transaction_amount) !== purchase.amount || subscription.auto_recurring?.currency_id !== PLANS_CONFIG.currency) throw new Error("Subscription does not match an internal purchase");
        if (subscription.status === "authorized") {
          const currentAccess = await PlanAccess.findOne({ userId: purchase.userId }).lean();
          const hasActivePermanentPlan = (currentAccess?.plan === "lifetime" || currentAccess?.plan === "aether") && currentAccess.status === "active";
          if (!hasActivePermanentPlan) {
            await PlanAccess.updateOne({ userId: purchase.userId }, { $set: { userId: purchase.userId, plan: "monthly", status: "pending", mercadoPagoSubscriptionId: resourceId, cancelAtPeriodEnd: false }, $unset: { grantSource: "" } }, { upsert: true });
          }
        } else if (["cancelled", "paused"].includes(subscription.status ?? "")) {
          const access = await PlanAccess.findOne({ userId: purchase.userId, mercadoPagoSubscriptionId: resourceId, grantSource: { $ne: "owner" } });
          if (access) {
            access.cancelAtPeriodEnd = true;
            if (!access.expiresAt || access.expiresAt <= new Date()) access.status = "canceled";
            else access.status = "active";
            await access.save();
          }
          await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { status: "cancelled" } });
        } else if (["pending", "authorized"].includes(subscription.status ?? "")) {
          const currentAccess = await PlanAccess.findOne({ userId: purchase.userId }).lean();
          const monthlyAccess = currentAccess?.plan === "monthly" ? currentAccess : null;
          const activePermanentPlan = (currentAccess?.plan === "lifetime" || currentAccess?.plan === "aether") && currentAccess.status === "active";
          if ((!monthlyAccess || monthlyAccess.status !== "active" || !monthlyAccess.expiresAt || monthlyAccess.expiresAt <= new Date()) && !activePermanentPlan) {
            await PlanAccess.updateOne({ userId: purchase.userId }, { $set: { userId: purchase.userId, plan: "monthly", status: "pending", mercadoPagoSubscriptionId: resourceId }, $unset: { grantSource: "" } }, { upsert: true });
          }
        }
      } else if (type === "topic_chargebacks_wh") {
        const chargeback = await new Chargeback(client).get({ id: resourceId });
        if (!chargeback.payment_id) throw new Error("Chargeback does not identify a payment");
        const payment = await new Payment(client).get({ id: String(chargeback.payment_id) });
        const subscriptionId = (payment as typeof payment & { preapproval_id?: string }).preapproval_id;
        const alternatives = [
          ...(payment.external_reference ? [{ externalReference: payment.external_reference }] : []),
          ...(subscriptionId ? [{ mercadoPagoSubscriptionId: subscriptionId }] : []),
        ];
        const purchase = alternatives.length ? await PlanPurchase.findOne({ $or: alternatives }) : null;
        if (!purchase || Number(payment.transaction_amount) !== purchase.amount || payment.currency_id !== PLANS_CONFIG.currency) throw new Error("Chargeback does not match an internal purchase");
        await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { status: "charged_back", mercadoPagoPaymentId: String(payment.id) } });
        await BillingTransaction.updateOne(
          { providerPaymentId: String(payment.id) },
          { $set: { status: "charged_back" } },
        );
        if (purchase.plan === "monthly" || purchase.plan === "lifetime" || purchase.plan === "aether") {
          await PlanAccess.updateOne({ userId: purchase.userId, plan: purchase.plan, grantSource: { $ne: "owner" } }, { $set: { status: "revoked" } });
        }
      }
      await PaymentEvent.updateOne({ eventId }, { $set: { status: "processed" } });
      return { received: true };
    } catch {
      if (chargeEventId && ownsChargeClaim) await PaymentEvent.deleteOne({ eventId: chargeEventId, status: "processing" });
      await PaymentEvent.deleteOne({ eventId, status: "processing" });
      return status(503, { message: "Notification processing will be retried" });
    }
  }, { query: z.record(z.string(), z.string()).optional() });

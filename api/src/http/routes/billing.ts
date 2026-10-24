import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import { z } from "zod";
import { Chargeback, MercadoPagoConfig, Payment, PreApproval, Preference, WebhookSignatureValidator } from "mercadopago";

import { env } from "../../env.js";
import { License } from "../../database/models/License.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { PaymentEvent } from "../../database/models/PaymentEvent.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import { generateTemporaryPremiumLicense } from "../plugins/license.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { hasPremiumAccess, hasTrustedWebOrigin } from "../plugins/plan-access.js";
import { PLAN_CATALOG, PLAN_PRICES, addOneCalendarMonth, safeReturnPath } from "../plugins/billing-config.js";

const getClient = () => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new Error("Mercado Pago is not configured");
  return new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
};
const TRIAL_DURATION_MS = 12 * 60 * 60 * 1000;
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
  if (access.plan === "lifetime" && access.status === "active") return access;
  if ((access.plan === "monthly" || access.plan === "free") && access.status === "active" && access.expiresAt && access.expiresAt > new Date()) return access;
  if (access.plan === "free" && access.status === "trial" && access.expiresAt && access.expiresAt > new Date()) return access;
  const expired = access.expiresAt && access.expiresAt <= new Date();
  return { ...access, status: expired && ["active", "trial"].includes(access.status) ? "expired" : access.status };
};

export const billingRoutes = new Elysia({ prefix: "/billing" })
  .use(authSessionPlugin)
  .get("/catalog", () => ({
    currency: "BRL",
    trialEnabled: env.TEMP_LICENSE_TRIAL_ENABLED,
    plans: env.TEMP_LICENSE_TRIAL_ENABLED ? PLAN_CATALOG : PLAN_CATALOG.filter((plan) => plan.id !== "free"),
  }))
  .get("/state", async ({ user }) => {
    await restoreLegacyTrialUse(user.id);
    const access = await getCurrentAccess(user.id);
    const temporaryLicense = await getActiveTrialLicense(user.id);
    const lastPurchase = await PlanPurchase.findOne({ userId: user.id }).sort({ createdAt: -1 }).select({ plan: 1, status: 1, createdAt: 1 }).lean();
    return {
      access: access ? {
        plan: access.plan,
        status: access.status,
        trialUsedAt: access.trialUsedAt,
        trialExpiresAt: access.trialLicenseExpiresAt,
        startsAt: access.startsAt,
        expiresAt: access.expiresAt,
        cancelAtPeriodEnd: access.cancelAtPeriodEnd,
      } : null,
      temporaryLicense,
      lastPurchase,
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
        return status(409, { code: "TRIAL_ALREADY_USED", message: "Esta conta já usou sua licença temporária. Cada conta recebe uma única key válida por 12 horas." });
      }
    } catch (error) {
      await License.deleteOne({ _id: code, sourcePlan: "trial" });
      if (isDuplicateKeyError(error)) {
        const activeTrialLicense = await getActiveTrialLicense(user.id);
        if (activeTrialLicense) {
          return { plan: "trial", status: "active", tier: "plus", ...activeTrialLicense };
        }
        return status(409, { code: "TRIAL_ALREADY_USED", message: "Esta conta já usou sua licença temporária. Cada conta recebe uma única key válida por 12 horas." });
      }
      throw error;
    }
    return { plan: "trial", status: "active", tier: "plus", code, expiresAt };
  }, { auth: true })
  .post("/checkout", async ({ user, body, status, request }) => {
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    if (!(await rateLimit(user.id, "checkout", 5, 60_000))) return status(429, { message: "Muitas tentativas de checkout. Aguarde um minuto." });
    const { plan, returnTo } = z.object({ plan: z.enum(["monthly", "lifetime"]), returnTo: z.string().optional() }).parse(body);
    const safeReturnTo = safeReturnPath(returnTo);
    const current = await PlanAccess.findOne({ userId: user.id }).lean();
    if (current?.plan === "lifetime" && current.status === "active") return status(409, { message: "O plano Lifetime já está ativo." });
    if (current?.plan === "monthly" && ["active", "pending", "past_due"].includes(current.status)) return status(409, { message: "Já existe uma assinatura mensal. Gerencie-a antes de contratar outro plano." });
    const externalReference = randomUUID();
    const price = PLAN_PRICES[plan];
    const purchase = await PlanPurchase.create({ userId: user.id, plan, amount: price, currency: "BRL", externalReference, status: "pending" });
    const client = getClient();
    const base = appUrl();
    try {
      if (plan === "lifetime") {
        const preference = await new Preference(client).create({
          requestOptions: { idempotencyKey: externalReference },
          body: {
            external_reference: externalReference,
            items: [{ id: "pluginsx-ender-dragon-lifetime", title: "PluginsX | Ender Dragon", description: "Acesso vitalício Premium/Plus do PluginsX. Pagamento único, sem renovação.", quantity: 1, currency_id: "BRL", unit_price: price }],
            back_urls: { success: `${base}/plans?return=success&returnTo=${encodeURIComponent(safeReturnTo)}`, pending: `${base}/plans?return=pending&returnTo=${encodeURIComponent(safeReturnTo)}`, failure: `${base}/plans?return=failure&returnTo=${encodeURIComponent(safeReturnTo)}` },
            notification_url: `${env.URL.replace(/\/$/, "")}/billing/webhook`,
            auto_return: "approved",
          },
        });
        if (!preference.id || !preference.init_point) throw new Error("Checkout preference missing redirect URL");
        await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { preferenceId: preference.id } });
        return { checkoutUrl: preference.init_point };
      }
      const subscription = await new PreApproval(client).create({
        requestOptions: { idempotencyKey: externalReference },
        body: {
          reason: "PluginsX | Creeper - Premium/Plus",
          external_reference: externalReference,
          payer_email: user.email,
          back_url: `${base}/plans?return=subscription&returnTo=${encodeURIComponent(safeReturnTo)}`,
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: price, currency_id: "BRL" },
        },
      });
      if (!subscription.id || !subscription.init_point) throw new Error("Subscription checkout missing redirect URL");
      await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { mercadoPagoSubscriptionId: subscription.id } });
      return { checkoutUrl: subscription.init_point };
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
  }, { auth: true, body: z.object({ plan: z.enum(["monthly", "lifetime"]), returnTo: z.string().optional() }) })
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
    const purchase = await PlanPurchase.findOne({ externalReference: params.reference, userId: user.id }).select({ plan: 1, status: 1, createdAt: 1 }).lean();
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
        if (!invoicePurchase || Number(invoice.transaction_amount) !== invoicePurchase.amount || invoice.currency_id !== "BRL") throw new Error("Invoice does not match an internal subscription");
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
        if (!purchase || Number(payment.transaction_amount) !== purchase.amount || payment.currency_id !== "BRL") throw new Error("Payment does not match an internal purchase");
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
        if (purchase.plan === "lifetime") {
          if (nextStatus === "approved") {
            const currentAccess = await PlanAccess.findOne({ userId: purchase.userId }).lean();
            if (currentAccess?.plan !== "lifetime" || currentAccess.status !== "active") {
              await PlanAccess.updateOne({ userId: purchase.userId }, { $set: { userId: purchase.userId, plan: "lifetime", status: "active", startsAt: new Date(), expiresAt: null } }, { upsert: true });
            }
          }
          if (["refunded", "charged_back"].includes(nextStatus)) await PlanAccess.updateOne({ userId: purchase.userId, plan: "lifetime" }, { $set: { status: "revoked" } });
        } else if (purchase.plan === "monthly" && purchase.mercadoPagoSubscriptionId) {
          if (shouldApplyMonthlyCharge) {
            const now = new Date();
            const existingAccess = await PlanAccess.findOne({ userId: purchase.userId });
            const access = existingAccess?.plan === "monthly" ? existingAccess : null;
            const start = new Date(payment.date_approved ?? payment.date_created ?? purchase.createdAt);
            const paidThrough = addOneCalendarMonth(start);
            const expiresAt = access?.expiresAt && access.expiresAt > paidThrough ? access.expiresAt : paidThrough;
            if (existingAccess?.plan !== "lifetime" || existingAccess.status !== "active") {
              await PlanAccess.updateOne({ userId: purchase.userId }, { $set: { userId: purchase.userId, plan: "monthly", status: "active", startsAt: access?.startsAt ?? start, expiresAt, mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId, cancelAtPeriodEnd: false } }, { upsert: true });
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
        if (!purchase || purchase.plan !== "monthly" || Number(subscription.auto_recurring?.transaction_amount) !== purchase.amount || subscription.auto_recurring?.currency_id !== "BRL") throw new Error("Subscription does not match an internal purchase");
        if (subscription.status === "authorized") {
          const currentAccess = await PlanAccess.findOne({ userId: purchase.userId }).lean();
          if (currentAccess?.plan !== "lifetime" || currentAccess.status !== "active") {
            await PlanAccess.updateOne({ userId: purchase.userId, plan: { $ne: "lifetime" } }, { $set: { userId: purchase.userId, plan: "monthly", status: "pending", mercadoPagoSubscriptionId: resourceId, cancelAtPeriodEnd: false } }, { upsert: true });
          }
        } else if (["cancelled", "paused"].includes(subscription.status ?? "")) {
          const access = await PlanAccess.findOne({ userId: purchase.userId, mercadoPagoSubscriptionId: resourceId });
          if (access) {
            access.cancelAtPeriodEnd = true;
            if (!access.expiresAt || access.expiresAt <= new Date()) access.status = "canceled";
            else access.status = "active";
            await access.save();
          }
          await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { status: "cancelled" } });
        } else if (["pending", "authorized"].includes(subscription.status ?? "")) {
          const access = await PlanAccess.findOne({ userId: purchase.userId, plan: "monthly" });
          if ((!access || access.status !== "active" || !access.expiresAt || access.expiresAt <= new Date()) && (access?.plan !== "lifetime" || access.status !== "active")) {
            await PlanAccess.updateOne({ userId: purchase.userId, plan: { $ne: "lifetime" } }, { $set: { userId: purchase.userId, plan: "monthly", status: "pending", mercadoPagoSubscriptionId: resourceId } }, { upsert: true });
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
        if (!purchase || Number(payment.transaction_amount) !== purchase.amount || payment.currency_id !== "BRL") throw new Error("Chargeback does not match an internal purchase");
        await PlanPurchase.updateOne({ _id: purchase._id }, { $set: { status: "charged_back", mercadoPagoPaymentId: String(payment.id) } });
        await PlanAccess.updateOne({ userId: purchase.userId, plan: { $in: ["monthly", "lifetime"] } }, { $set: { status: "revoked" } });
      }
      await PaymentEvent.updateOne({ eventId }, { $set: { status: "processed" } });
      return { received: true };
    } catch {
      if (chargeEventId && ownsChargeClaim) await PaymentEvent.deleteOne({ eventId: chargeEventId, status: "processing" });
      await PaymentEvent.deleteOne({ eventId, status: "processing" });
      return status(503, { message: "Notification processing will be retried" });
    }
  }, { query: z.record(z.string(), z.string()).optional() });

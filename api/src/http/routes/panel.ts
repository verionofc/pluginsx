import mongoose from "mongoose";
import { Elysia } from "elysia";
import { z } from "zod";
import { MercadoPagoConfig, PreApproval } from "mercadopago";

import { OWNER_ROLE } from "../../config/roles.js";
import { AdminAuditLog } from "../../database/models/AdminAuditLog.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { Coupon } from "../../database/models/Coupon.js";
import { PaymentEvent } from "../../database/models/PaymentEvent.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { getDb } from "../../database/connect.js";
import { env } from "../../env.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { getServerLimitForPlan, PLANS_CONFIG } from "../plugins/billing-config.js";
import { hasTrustedWebOrigin } from "../plugins/plan-access.js";

const accountProjection = {
  _id: 1,
  id: 1,
  name: 1,
  email: 1,
  emailVerified: 1,
  createdAt: 1,
  role: 1,
} as const;

const userCollection = () => getDb().collection("user");

function accountId(document: Record<string, unknown>): string {
  const id = document._id ?? document.id;
  return id && typeof id === "object" && "toHexString" in id && typeof id.toHexString === "function"
    ? id.toHexString()
    : String(id ?? "");
}

function publicAccount(document: Record<string, unknown>) {
  return {
    id: accountId(document),
    name: typeof document.name === "string" ? document.name : "",
    email: typeof document.email === "string" ? document.email : "",
    emailVerified: Boolean(document.emailVerified),
    createdAt: document.createdAt instanceof Date ? document.createdAt : null,
    role: typeof document.role === "string" ? document.role : "user",
  };
}

async function findAccount(identifier: string) {
  const value = identifier.trim();
  const projection = { projection: accountProjection };
  const collection = userCollection();

  if (mongoose.isValidObjectId(value)) {
    const objectId = new mongoose.Types.ObjectId(value);
    const byObjectId = await collection.findOne({ _id: objectId }, projection);
    if (byObjectId) return byObjectId as Record<string, unknown>;
  }

  const normalizedEmail = value.toLowerCase();
  if (normalizedEmail.includes("@")) {
    const byEmail = await collection.findOne({ email: normalizedEmail }, projection);
    if (byEmail) return byEmail as Record<string, unknown>;
  }

  return null;
}

function accountIdsFilter(ids: string[]) {
  const objectIds = ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  return { _id: { $in: objectIds } };
}

async function loadAccounts(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, ReturnType<typeof publicAccount>>();
  const documents = await userCollection()
    .find(accountIdsFilter(uniqueIds), { projection: accountProjection })
    .toArray();
  return new Map(documents.map((document) => {
    const account = publicAccount(document as Record<string, unknown>);
    return [account.id, account];
  }));
}

function planLabel(plan: string, serverSlots = 0) {
  if (plan === "server_slots") {
    return `${serverSlots} ${serverSlots === 1 ? "vaga extra" : "vagas extras"}`;
  }
  if (plan === "free") return PLANS_CONFIG.plans.trial.name;
  if (plan === "monthly" || plan === "lifetime" || plan === "aether") {
    return PLANS_CONFIG.plans[plan].name;
  }
  return plan;
}

function accessSnapshot(access: Record<string, unknown> | null) {
  if (!access) return {
    plan: null,
    status: null,
    expiresAt: null,
    serverLimitOverride: null,
    serverLimitUnlimited: false,
    grantSource: null,
  };
  return {
    plan: typeof access.plan === "string" ? access.plan : null,
    status: typeof access.status === "string" ? access.status : null,
    expiresAt: access.expiresAt instanceof Date ? access.expiresAt : null,
    serverLimitOverride: typeof access.serverLimitOverride === "number" ? access.serverLimitOverride : null,
    serverLimitUnlimited: access.serverLimitUnlimited === true,
    grantSource: typeof access.grantSource === "string" ? access.grantSource : null,
  };
}

const lookupSchema = z.object({ identifier: z.string().trim().min(1).max(254) });
const updateAccessSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  plan: z.enum(["none", "monthly", "lifetime", "aether"]),
  expiresAt: z.string().datetime().nullable(),
  serverLimit: z.number().int().min(1).max(1_000_000).nullable(),
  unlimited: z.boolean(),
}).superRefine((value, context) => {
  if (value.plan === "monthly" && (!value.expiresAt || Date.parse(value.expiresAt) <= Date.now())) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Defina uma data futura para o Creeper." });
  }
  if (value.plan === "none" && (value.unlimited || value.serverLimit !== null)) {
    context.addIssue({ code: "custom", path: ["serverLimit"], message: "Remova o limite de servidor quando o acesso estiver revogado." });
  }
  if (value.plan !== "none" && !value.unlimited && value.serverLimit === null) {
    context.addIssue({ code: "custom", path: ["serverLimit"], message: "Informe o limite ou marque servidores ilimitados." });
  }
});

const couponBodySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).min(3).max(32),
  products: z.array(z.enum(["monthly", "lifetime", "aether", "server_slots"])).min(1),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().min(0.01).max(1_000_000),
  usageMode: z.enum(["single", "multi", "per_account"]),
  maxUses: z.number().int().positive().nullable(),
  maxPerAccount: z.number().int().positive().nullable(),
  startsAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
}).superRefine((value, context) => {
  if (value.discountType === "percentage" && value.discountValue >= 100) {
    context.addIssue({ code: "custom", path: ["discountValue"], message: "O desconto percentual precisa ser menor que 100%." });
  }
  if (value.usageMode === "per_account" && value.maxPerAccount === null) {
    context.addIssue({ code: "custom", path: ["maxPerAccount"], message: "Defina quantas vezes cada conta pode usar o cupom." });
  }
  if (value.usageMode !== "per_account" && value.maxPerAccount !== null) {
    context.addIssue({ code: "custom", path: ["maxPerAccount"], message: "O limite por conta só vale no modo de uso por conta." });
  }
  if (value.usageMode === "per_account" && !value.expiresAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Cupons por conta precisam de uma data de encerramento." });
  }
  if (value.usageMode === "single" && value.maxUses !== null && value.maxUses !== 1) {
    context.addIssue({ code: "custom", path: ["maxUses"], message: "Um cupom de uso único tem limite global de um resgate." });
  }
  if (value.startsAt && value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "O encerramento precisa ocorrer depois do início." });
  }
});

function couponSummary(coupon: {
  _id: unknown;
  code: string;
  products: string[];
  discountType: string;
  discountValue: number;
  usageMode: string;
  maxUses: number | null;
  maxPerAccount: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive: boolean;
  usageCount: number;
  reservedCount: number;
  createdAt: Date;
}) {
  return {
    id: String(coupon._id),
    code: coupon.code,
    products: coupon.products,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    usageMode: coupon.usageMode,
    maxUses: coupon.maxUses,
    maxPerAccount: coupon.maxPerAccount,
    startsAt: coupon.startsAt ?? null,
    expiresAt: coupon.expiresAt ?? null,
    isActive: coupon.isActive,
    usageCount: coupon.usageCount,
    reservedCount: coupon.reservedCount,
    createdAt: coupon.createdAt,
  };
}

const getMercadoPagoClient = () => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new Error("Mercado Pago is not configured");
  return new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
};

export const panelRoutes = new Elysia({ prefix: "/panel" })
  .use(authSessionPlugin)
  .get("/coupons", async () => {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    return { items: coupons.map(couponSummary) };
  }, { owner: true, detail: { summary: "List purchase coupons", tags: ["Panel"] } })
  .post("/coupons", async ({ user, body, status, request }) => {
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    try {
      const coupon = await Coupon.create({
        ...body,
        maxUses: body.usageMode === "single" ? 1 : body.maxUses,
        maxPerAccount: body.usageMode === "per_account" ? body.maxPerAccount : null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        monthlyRecurring: true,
        isActive: true,
        createdBy: user.id,
      });
      return couponSummary(coupon.toObject());
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        return status(409, { code: "COUPON_CODE_EXISTS", message: "Já existe um cupom com esse código." });
      }
      throw error;
    }
  }, { owner: true, body: couponBodySchema, detail: { summary: "Create a purchase coupon", tags: ["Panel"] } })
  .post("/coupons/:id/active", async ({ params, body, status, request }) => {
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    if (!mongoose.isValidObjectId(params.id)) return status(404, { message: "Cupom não encontrado." });
    const coupon = await Coupon.findByIdAndUpdate(params.id, { $set: { isActive: body.active } }, { new: true }).lean();
    if (!coupon) return status(404, { message: "Cupom não encontrado." });
    return couponSummary(coupon);
  }, {
    owner: true,
    params: z.object({ id: z.string().min(1).max(64) }),
    body: z.object({ active: z.boolean() }),
    detail: { summary: "Activate or deactivate a purchase coupon", tags: ["Panel"] },
  })
  .get("/dashboard", async () => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const [approvedSummary] = await BillingTransaction.aggregate<{ amount: number; count: number }>([
      { $match: { status: "approved" } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const accountsWithSales = await BillingTransaction.distinct("userId", { status: "approved" });
    const [monthSummary] = await BillingTransaction.aggregate<{ amount: number; count: number }>([
      { $match: { status: "approved", paidAt: { $gte: monthStart } } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const monthlyRows = await BillingTransaction.aggregate<{ month: string; amount: number; count: number }>([
      { $match: { status: "approved", paidAt: { $gte: chartStart } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$paidAt", timezone: "UTC" } },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      } },
      { $project: { _id: 0, month: "$_id", amount: 1, count: 1 } },
      { $sort: { month: 1 } },
    ]);
    const planRows = await BillingTransaction.aggregate<{ plan: string; amount: number; count: number; serverSlots: number }>([
      { $match: { status: "approved" } },
      { $group: { _id: "$plan", amount: { $sum: "$amount" }, count: { $sum: 1 }, serverSlots: { $sum: "$serverSlots" } } },
      { $project: { _id: 0, plan: "$_id", amount: 1, count: 1, serverSlots: 1 } },
      { $sort: { amount: -1 } },
    ]);
    const activeMonthly = await PlanAccess.find({
      plan: "monthly",
      status: "active",
      expiresAt: { $gt: now },
      cancelAtPeriodEnd: { $ne: true },
      mercadoPagoSubscriptionId: { $exists: true, $ne: "" },
    }).select({ userId: 1, mercadoPagoSubscriptionId: 1 }).lean();
    const subscriptionIds = activeMonthly.map((access) => access.mercadoPagoSubscriptionId).filter((id): id is string => Boolean(id));
    const activeSubscriptions = subscriptionIds.length
      ? await PlanPurchase.find({ mercadoPagoSubscriptionId: { $in: subscriptionIds }, plan: "monthly" }).select({ mercadoPagoSubscriptionId: 1, amount: 1 }).lean()
      : [];
    const monthlyAmountBySubscription = new Map(activeSubscriptions.map((purchase) => [purchase.mercadoPagoSubscriptionId, purchase.amount]));
    const monthLabels: string[] = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      monthLabels.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    const monthlyMap = new Map(monthlyRows.map((row) => [row.month, row]));

    return {
      currency: PLANS_CONFIG.currency,
      locale: PLANS_CONFIG.locale,
      generatedAt: now,
      totals: {
        grossRevenue: approvedSummary?.amount ?? 0,
        approvedPayments: approvedSummary?.count ?? 0,
        thisMonthRevenue: monthSummary?.amount ?? 0,
        thisMonthPayments: monthSummary?.count ?? 0,
        activePaidSubscriptions: activeMonthly.length,
        monthlyRecurringRevenue: activeMonthly.reduce((total, access) => total + (monthlyAmountBySubscription.get(access.mercadoPagoSubscriptionId ?? "") ?? 0), 0),
        accountsWithSales: accountsWithSales.length,
      },
      monthlyRevenue: monthLabels.map((month) => ({ month, amount: monthlyMap.get(month)?.amount ?? 0, count: monthlyMap.get(month)?.count ?? 0 })),
      revenueByPlan: planRows.map((row) => ({ ...row, label: planLabel(row.plan, row.serverSlots) })),
    };
  }, { owner: true, detail: { summary: "Owner sales dashboard", tags: ["Panel"] } })
  .get("/accounts", async ({ query }) => {
    const limit = Math.min(Number(query.limit ?? 25), 100);
    const offset = Math.max(Number(query.offset ?? 0), 0);
    const [result] = await BillingTransaction.aggregate<{
      items: {
        _id: string;
        spent: number;
        paymentCount: number;
        products: { plan: string; amount: number; count: number; serverSlots: number }[];
      }[];
      total: { count: number }[];
    }>([
      { $match: { status: "approved" } },
      { $group: {
        _id: { userId: "$userId", plan: "$plan" },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
        serverSlots: { $sum: "$serverSlots" },
      } },
      { $group: {
        _id: "$_id.userId",
        spent: { $sum: "$amount" },
        paymentCount: { $sum: "$count" },
        products: { $push: { plan: "$_id.plan", amount: "$amount", count: "$count", serverSlots: "$serverSlots" } },
      } },
      { $sort: { spent: -1, _id: 1 } },
      { $facet: {
        items: [{ $skip: offset }, { $limit: limit }],
        total: [{ $count: "count" }],
      } },
    ]).allowDiskUse(true);
    const rows = result?.items ?? [];
    const profiles = await loadAccounts(rows.map((row) => row._id));
    return {
      total: result?.total[0]?.count ?? 0,
      limit,
      offset,
      items: rows.map((row) => ({
        userId: row._id,
        account: profiles.get(row._id) ?? null,
        spent: row.spent,
        paymentCount: row.paymentCount,
        products: row.products
          .sort((a, b) => b.amount - a.amount)
          .map((product) => ({
            plan: product.plan,
            label: planLabel(product.plan, product.serverSlots),
            amount: product.amount,
            paymentCount: product.count,
          })),
      })),
    };
  }, {
    owner: true,
    query: z.object({ limit: z.coerce.number().int().positive().max(100).optional(), offset: z.coerce.number().int().min(0).optional() }),
    detail: { summary: "List every account with confirmed spending grouped by product", tags: ["Panel"] },
  })
  .get("/transactions", async ({ query }) => {
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const offset = Math.max(Number(query.offset ?? 0), 0);
    const [transactions, total] = await Promise.all([
      BillingTransaction.find().sort({ paidAt: -1, createdAt: -1 }).skip(offset).limit(limit)
        .select({ userId: 1, purchaseReference: 1, plan: 1, serverSlots: 1, amount: 1, discountAmount: 1, couponCode: 1, currency: 1, status: 1, paidAt: 1, createdAt: 1 })
        .lean(),
      BillingTransaction.countDocuments(),
    ]);
    const profiles = await loadAccounts(transactions.map((item) => item.userId));
    return {
      total,
      limit,
      offset,
      items: transactions.map((item) => ({
        userId: item.userId,
        account: profiles.get(item.userId) ?? null,
        purchaseReference: item.purchaseReference,
        plan: item.plan,
        product: planLabel(item.plan, item.serverSlots),
        serverSlots: item.serverSlots,
        amount: item.amount,
        discountAmount: item.discountAmount ?? 0,
        couponCode: item.couponCode ?? null,
        currency: item.currency,
        status: item.status,
        paidAt: item.paidAt ?? item.createdAt,
      })),
    };
  }, {
    owner: true,
    query: z.object({ limit: z.coerce.number().int().positive().max(100).optional(), offset: z.coerce.number().int().min(0).optional() }),
    detail: { summary: "List payment transactions", tags: ["Panel"] },
  })
  .get("/activity", async () => {
    const [auditLogs, paymentEvents] = await Promise.all([
      AdminAuditLog.find().sort({ createdAt: -1 }).limit(30)
        .select({ actorUserId: 1, actorEmail: 1, targetUserId: 1, targetEmail: 1, action: 1, status: 1, before: 1, after: 1, error: 1, createdAt: 1 })
        .lean(),
      PaymentEvent.find().sort({ receivedAt: -1 }).limit(30)
        .select({ eventId: 1, type: 1, resourceId: 1, status: 1, receivedAt: 1 })
        .lean(),
    ]);
    return {
      planChanges: auditLogs.map((log) => ({
        actorUserId: log.actorUserId,
        actorEmail: log.actorEmail,
        targetUserId: log.targetUserId,
        targetEmail: log.targetEmail,
        action: log.action,
        status: log.status,
        before: log.before,
        after: log.after,
        error: log.error ?? null,
        createdAt: log.createdAt,
      })),
      paymentEvents: paymentEvents.map((event) => ({
        eventId: event.eventId,
        type: event.type,
        resourceId: event.resourceId,
        status: event.status,
        receivedAt: event.receivedAt,
      })),
    };
  }, { owner: true, detail: { summary: "List owner and payment logs", tags: ["Panel"] } })
  .post("/accounts/lookup", async ({ body, status }) => {
    const accountDocument = await findAccount(body.identifier);
    if (!accountDocument) return status(404, { code: "ACCOUNT_NOT_FOUND", message: "Não encontrei uma conta com esse ID ou e-mail." });
    const account = publicAccount(accountDocument);
    const [access, orders, transactions] = await Promise.all([
      PlanAccess.findOne({ userId: account.id })
        .select({ plan: 1, status: 1, startsAt: 1, expiresAt: 1, cancelAtPeriodEnd: 1, grantSource: 1, serverLimitOverride: 1, serverLimitUnlimited: 1, mercadoPagoSubscriptionId: 1 })
        .lean(),
      PlanPurchase.find({ userId: account.id }).sort({ createdAt: -1 }).limit(100)
        .select({ plan: 1, serverSlots: 1, amount: 1, discountAmount: 1, couponCode: 1, currency: 1, status: 1, externalReference: 1, createdAt: 1, updatedAt: 1 })
        .lean(),
      BillingTransaction.find({ userId: account.id }).sort({ paidAt: -1, createdAt: -1 }).limit(100)
        .select({ purchaseReference: 1, plan: 1, serverSlots: 1, amount: 1, discountAmount: 1, couponCode: 1, currency: 1, status: 1, paidAt: 1, createdAt: 1 })
        .lean(),
    ]);
    const spend = await BillingTransaction.aggregate<{ amount: number; count: number }>([
      { $match: { userId: account.id, status: "approved" } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const plan = access?.plan === "monthly" || access?.plan === "lifetime" || access?.plan === "aether" ? access.plan : null;
    return {
      account,
      access: {
        ...accessSnapshot(access as Record<string, unknown> | null),
        startsAt: access?.startsAt ?? null,
        cancelAtPeriodEnd: access?.cancelAtPeriodEnd ?? false,
        hasProviderSubscription: Boolean(access?.mercadoPagoSubscriptionId),
        planLabel: plan ? PLANS_CONFIG.plans[plan].name : "Sem plano pago ativo",
        defaultServerLimit: plan ? getServerLimitForPlan(plan) : null,
        planServerLimits: {
          monthly: getServerLimitForPlan("monthly"),
          lifetime: getServerLimitForPlan("lifetime"),
          aether: getServerLimitForPlan("aether"),
        },
      },
      spending: { total: spend[0]?.amount ?? 0, approvedPayments: spend[0]?.count ?? 0 },
      orders: orders.map((order) => ({
        reference: order.externalReference,
        plan: order.plan,
        product: planLabel(order.plan, order.serverSlots ?? 0),
        serverSlots: order.serverSlots ?? 0,
        amount: order.amount,
        discountAmount: order.discountAmount ?? 0,
        couponCode: order.couponCode ?? null,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
      })),
      transactions: transactions.map((transaction) => ({
        reference: transaction.purchaseReference,
        plan: transaction.plan,
        product: planLabel(transaction.plan, transaction.serverSlots),
        serverSlots: transaction.serverSlots,
        amount: transaction.amount,
        discountAmount: transaction.discountAmount ?? 0,
        couponCode: transaction.couponCode ?? null,
        currency: transaction.currency,
        status: transaction.status,
        paidAt: transaction.paidAt ?? transaction.createdAt,
      })),
    };
  }, { owner: true, body: lookupSchema, detail: { summary: "Look up an account for plan management", tags: ["Panel"] } })
  .post("/accounts/access", async ({ user, body, status, request }) => {
    if (!hasTrustedWebOrigin(request)) return status(403, { message: "Origem da solicitação não permitida." });
    const accountDocument = await findAccount(body.identifier);
    if (!accountDocument) return status(404, { code: "ACCOUNT_NOT_FOUND", message: "Não encontrei uma conta com esse ID ou e-mail." });
    const target = publicAccount(accountDocument);
    const currentAccess = await PlanAccess.findOne({ userId: target.id })
      .select({ plan: 1, status: 1, expiresAt: 1, serverLimitOverride: 1, serverLimitUnlimited: 1, grantSource: 1, mercadoPagoSubscriptionId: 1, cancelAtPeriodEnd: 1 })
      .lean();
    const before = accessSnapshot(currentAccess as Record<string, unknown> | null);
    const nextPlan = body.plan === "none" ? null : body.plan;
    const nextExpiresAt = body.plan === "monthly" && body.expiresAt ? new Date(body.expiresAt) : null;
    const nextSnapshot = {
      plan: nextPlan,
      status: nextPlan ? "active" : currentAccess ? "revoked" : null,
      expiresAt: nextExpiresAt,
      serverLimitOverride: nextPlan && !body.unlimited ? body.serverLimit : null,
      serverLimitUnlimited: Boolean(nextPlan && body.unlimited),
      grantSource: nextPlan
        ? currentAccess?.plan === body.plan && currentAccess.status === "active"
          ? currentAccess.grantSource ?? null
          : OWNER_ROLE
        : null,
    };
    const preserveSubscription = Boolean(
      body.plan === "monthly" &&
      currentAccess?.plan === "monthly" &&
      currentAccess.status === "active" &&
      currentAccess.mercadoPagoSubscriptionId &&
      !currentAccess.cancelAtPeriodEnd,
    );
    const shouldCancelSubscription = Boolean(
      currentAccess?.mercadoPagoSubscriptionId &&
      !currentAccess.cancelAtPeriodEnd &&
      !preserveSubscription,
    );
    const auditLog = await AdminAuditLog.create({
      actorUserId: user.id,
      actorEmail: user.email,
      targetUserId: target.id,
      targetEmail: target.email,
      action: "plan_access_updated",
      status: "pending",
      before,
      after: nextSnapshot,
    });

    try {
      if (shouldCancelSubscription && currentAccess?.mercadoPagoSubscriptionId) {
        const mercadoPagoClient = await getMercadoPagoClient();
        await new PreApproval(mercadoPagoClient).update({
          id: currentAccess.mercadoPagoSubscriptionId,
          body: { status: "cancelled" },
        });
      }

      if (!nextPlan) {
        if (currentAccess) {
          await PlanAccess.updateOne({ userId: target.id }, {
            $set: { status: "revoked", grantSource: OWNER_ROLE },
            $unset: { mercadoPagoSubscriptionId: "", cancelAtPeriodEnd: "", serverLimitOverride: "", serverLimitUnlimited: "" },
          });
        }
      } else {
        const isExistingPaidEntitlement = currentAccess?.plan === body.plan && currentAccess.status === "active";
        const update: Record<string, unknown> = {
          userId: target.id,
          plan: body.plan,
          status: "active",
          startsAt: currentAccess?.plan === body.plan && currentAccess.startsAt ? currentAccess.startsAt : new Date(),
          expiresAt: nextExpiresAt,
          cancelAtPeriodEnd: false,
          serverLimitUnlimited: body.unlimited,
        };
        const unset: Record<string, string> = {};
        if (body.unlimited || body.serverLimit === null) unset.serverLimitOverride = "";
        else update.serverLimitOverride = body.serverLimit;
        if (!preserveSubscription) unset.mercadoPagoSubscriptionId = "";
        if (isExistingPaidEntitlement) {
          if (currentAccess?.grantSource) update.grantSource = currentAccess.grantSource;
          else unset.grantSource = "";
        } else {
          update.grantSource = OWNER_ROLE;
        }
        await PlanAccess.updateOne(
          { userId: target.id },
          { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
          { upsert: true },
        );
      }
      await AdminAuditLog.updateOne({ _id: auditLog._id }, { $set: { status: "applied" } });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido";
      await AdminAuditLog.updateOne({ _id: auditLog._id }, { $set: { status: "failed", error: reason } });
      return status(503, { code: "PLAN_UPDATE_FAILED", message: "Não foi possível aplicar a alteração. Confira os logs e tente novamente." });
    }

    return {
      account: target,
      access: nextSnapshot,
      canceledProviderSubscription: shouldCancelSubscription,
    };
  }, { owner: true, body: updateAccessSchema, detail: { summary: "Change an account's plan and server capacity", tags: ["Panel"] } });

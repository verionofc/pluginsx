import { createHash } from "node:crypto";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { env } from "../../env.js";
import { License } from "../../database/models/License.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import {
  PlanPurchase,
  type PlanPurchaseRecord,
} from "../../database/models/PlanPurchase.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import {
  ensurePaidPlanLicense,
  type PaidLicensePlan,
} from "./paid-plan-license.js";
import { getLicensingConfig } from "./licensing-config.js";
import { applyVerifiedPayment } from "./billing-payment-processing.js";
import { grantPermanentPurchase } from "./billing-entitlements.js";
import { cancelUpgradedSubscription } from "./upgrade.js";
import { recordedPurchaseStatus } from "./billing-payment-ledger.js";
import { isPaidAccessFunded } from "./plan-access.js";

type Purchase = PlanPurchaseRecord & { _id: unknown };
const client = () =>
  env.MERCADOPAGO_ACCESS_TOKEN
    ? new MercadoPagoConfig({
        accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
        options: { timeout: 4000, maxRetries: 0 },
      })
    : null;

/** Never derives payment or ownership from provider return query parameters. */
async function receipt(purchase: Purchase) {
  const access = await PlanAccess.findOne({ userId: purchase.userId }).lean();
  const paymentStatus = await recordedPurchaseStatus(
    purchase.userId,
    purchase.externalReference,
    purchase.status,
  );
  const paid = paymentStatus === "approved";
  let fulfillmentStatus:
    | "pending"
    | "processing"
    | "ready"
    | "review"
    | "revoked" = paid ? "processing" : "pending";
  let licenseRef: string | null = null;
  let licenseIssuedAt: Date | null = null;
  let message =
    "Aguardando a confirmação do pagamento. Você pode continuar no site enquanto conferimos seu pedido.";
  if (purchase.upgradeCreditReversed) {
    fulfillmentStatus = "review";
    message =
      "O pagamento usado como crédito foi estornado. O upgrade precisa de revisão; entre em contato com o suporte.";
  } else if (["refunded", "charged_back"].includes(paymentStatus)) {
    fulfillmentStatus = "revoked";
    message =
      "Este pagamento foi estornado. Consulte o histórico do pedido ou fale com o suporte.";
  } else if (paid && purchase.plan === "server_slots") {
    fulfillmentStatus = "ready";
    message =
      "Pagamento confirmado. As vagas já estão disponíveis no seu acesso.";
  } else if (paid) {
    const matching =
      access?.plan === purchase.plan &&
      access.status === "active" &&
      (await isPaidAccessFunded(access)) &&
      (access.plan !== "monthly" ||
        Boolean(access.expiresAt && access.expiresAt > new Date())) &&
      (!access.purchaseReference ||
        access.purchaseReference === purchase.externalReference);
    if (matching) {
      try {
        const issued = await ensurePaidPlanLicense(
          purchase.userId,
          purchase.plan as PaidLicensePlan,
        );
        const license = await License.findOne({
          _id: issued.code,
          ownerId: purchase.userId,
          sourcePlan: purchase.plan,
          "value.valid": true,
        })
          .select({ _id: 1, createdAt: 1 })
          .lean();
        if (license) {
          licenseIssuedAt = license.createdAt ?? null;
          licenseRef = createHash("sha256")
            .update(`pluginsx-account-license:${license._id}`)
            .digest("hex");
          fulfillmentStatus = "ready";
          message =
            "Pagamento confirmado. Sua licença independente já está no inventário de acessos.";
          if (purchase.fulfillmentStatus !== "ready")
            await PlanPurchase.updateOne(
              { _id: purchase._id, status: "approved" },
              {
                $set: {
                  fulfillmentStatus: "ready",
                  fulfilledAt: purchase.fulfilledAt ?? new Date(),
                },
              },
            );
        } else {
          fulfillmentStatus = "review";
          message =
            "O pagamento foi confirmado, mas esta licença está bloqueada para revisão. Fale com o suporte.";
        }
      } catch {
        message =
          "Pagamento confirmado. Estamos preparando sua licença; a confirmação continua automaticamente.";
      }
    } else if (
      access?.status === "revoked" ||
      purchase.fulfillmentStatus === "revoked" ||
      purchase.fulfilledAt
    ) {
      fulfillmentStatus = "revoked";
      message =
        "O pagamento consta no histórico, mas o acesso deste pedido não está ativo atualmente.";
    } else if (purchase.fulfillmentStatus === "review") {
      fulfillmentStatus = "review";
      message =
        "Pagamento confirmado. O acesso deste pedido precisa de revisão; entre em contato com o suporte.";
    } else {
      message =
        purchase.subscriptionCancellationStatus === "failed"
          ? "Pagamento recebido; o upgrade aguarda o encerramento da renovação mensal. A confirmação será tentada novamente."
          : "Pagamento confirmado. Estamos preparando sua licença; a confirmação continua automaticamente.";
    }
  } else if (
    purchase.entitlementCheckoutReserved &&
    ["rejected", "cancelled"].includes(purchase.status)
  ) {
    message =
      "A última tentativa não foi aprovada. O mesmo checkout continua disponível para tentar novamente.";
  }
  const config = await getLicensingConfig();
  return {
    reference: purchase.externalReference,
    externalReference: purchase.externalReference,
    plan: purchase.plan,
    planName:
      purchase.planTerms?.name ??
      (purchase.plan === "server_slots"
        ? config.serverSlot.name
        : (config.plans.find((plan) => plan.id === purchase.plan)?.name ??
          purchase.plan)),
    status: purchase.status,
    paymentStatus,
    fulfillmentStatus,
    licenseRef,
    licenseIssuedAt,
    amount: purchase.amount,
    currency: purchase.currency,
    serverSlots: purchase.serverSlots ?? 0,
    checkoutUrl: purchase.checkoutUrl,
    createdAt: purchase.createdAt,
    fulfilledAt: purchase.fulfilledAt,
    couponCode: purchase.couponCode,
    discountAmount: purchase.discountAmount,
    subscriptionCancellationStatus: purchase.subscriptionCancellationStatus,
    upgradeCreditReversed: purchase.upgradeCreditReversed ?? false,
    entitlementCheckoutReserved: purchase.entitlementCheckoutReserved ?? false,
    nextCheckSeconds: 5,
    message,
  };
}

async function reconcile(purchase: Purchase) {
  // A receipt that was already fulfilled must never resurrect an access that
  // the owner or a refund subsequently revoked. Missing active keys self-heal above.
  if (
    purchase.fulfilledAt ||
    purchase.upgradeCreditReversed ||
    ["refunded", "charged_back"].includes(purchase.status)
  )
    return;
  const access = await PlanAccess.findOne({ userId: purchase.userId }).lean();
  if (access?.status === "revoked" || access?.grantSource === "owner") return;
  const now = new Date();
  const claimed = await PlanPurchase.findOneAndUpdate(
    {
      _id: purchase._id,
      userId: purchase.userId,
      $and: [
        {
          $or: [
            { lastProviderCheckAt: { $exists: false } },
            { lastProviderCheckAt: { $lte: new Date(now.getTime() - 10000) } },
          ],
        },
        {
          $or: [
            { providerCheckLeaseUntil: { $exists: false } },
            { providerCheckLeaseUntil: { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        lastProviderCheckAt: now,
        providerCheckLeaseUntil: new Date(now.getTime() + 45000),
      },
    },
    { new: true },
  ).lean();
  if (!claimed) return;
  const provider = client();
  try {
    // Approved ledger rows are server-side evidence. Finish an interrupted
    // permanent grant without requiring the customer to pay again.
    if (
      ["lifetime", "aether"].includes(purchase.plan) &&
      (await BillingTransaction.exists({
        userId: purchase.userId,
        purchaseReference: purchase.externalReference,
        status: "approved",
      }))
    ) {
      if (
        purchase.upgradeFromSubscriptionId &&
        purchase.subscriptionCancellationStatus !== "cancelled"
      ) {
        if (!provider) return;
        await cancelUpgradedSubscription(purchase, provider);
      }
      await grantPermanentPurchase(purchase.externalReference);
      return;
    }
    if (!provider) return;
    const payments = new Payment(provider);
    const seen = new Set<string>();
    async function check(id: string, subscriptionId?: string) {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      const payment = await payments.get({ id });
      // Every full response is revalidated against the owned stored order by
      // the same processor that handles authenticated provider webhooks.
      await applyVerifiedPayment(
        payment,
        provider!,
        purchase.externalReference,
        subscriptionId,
      );
      return payment.status === "approved";
    }
    if (
      purchase.mercadoPagoPaymentId &&
      (await check(purchase.mercadoPagoPaymentId))
    )
      return;
    const search = await payments.search({
      options: {
        external_reference: purchase.externalReference,
        sort: "date_created",
        criteria: "desc",
        limit: 20,
      },
    });
    const candidates = (search.results ?? [])
      .filter((item) => item.id)
      .sort(
        (a, b) =>
          Number(b.status === "approved") - Number(a.status === "approved"),
      );
    for (const item of candidates.slice(0, 2)) {
      if (item.id && (await check(String(item.id)))) return;
    }
    if (
      purchase.plan === "monthly" &&
      purchase.mercadoPagoSubscriptionId &&
      candidates.length === 0
    ) {
      const response = await fetch(
        `https://api.mercadopago.com/authorized_payments/search?preapproval_id=${encodeURIComponent(purchase.mercadoPagoSubscriptionId)}&limit=5&sort=date_created&criteria=desc`,
        {
          headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
          signal: AbortSignal.timeout(4000),
          redirect: "error",
        },
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        results?: {
          preapproval_id?: string;
          payment?: { id?: string | number };
        }[];
      };
      for (const invoice of (data.results ?? []).slice(0, 2)) {
        if (
          invoice.preapproval_id === purchase.mercadoPagoSubscriptionId &&
          invoice.payment?.id &&
          (await check(
            String(invoice.payment.id),
            purchase.mercadoPagoSubscriptionId,
          ))
        )
          return;
      }
    }
  } catch {
    // A timeout or unavailable provider is an unconfirmed purchase, never a
    // synthetic failure/approval. The lease limits retries across all workers.
  } finally {
    await PlanPurchase.updateOne(
      { _id: purchase._id, lastProviderCheckAt: now },
      { $unset: { providerCheckLeaseUntil: "" } },
    );
  }
}

export async function getOwnedPurchaseReceipt(
  userId: string,
  reference: string,
  refreshProvider = true,
) {
  const purchase = await PlanPurchase.findOne({
    userId,
    externalReference: reference,
  }).lean();
  if (!purchase) return null;
  const initial = await receipt(purchase);
  if (
    refreshProvider &&
    !["ready", "review", "revoked"].includes(initial.fulfillmentStatus)
  ) {
    await reconcile(purchase);
    const updated = await PlanPurchase.findOne({
      userId,
      externalReference: reference,
    }).lean();
    if (updated) return receipt(updated);
  }
  return initial;
}

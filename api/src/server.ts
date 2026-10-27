import {
  getLicensingConfig,
  migrateLicensingBeta3,
} from "./http/plugins/licensing-config.js";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import z from "zod";
import mongoose from "mongoose";
import { Coupon } from "./database/models/Coupon.js";
import { CouponAccountUsage } from "./database/models/CouponAccountUsage.js";
import { CouponRedemption } from "./database/models/CouponRedemption.js";

import { env } from "./env.js";
import { Package } from "./config/package.js";
import { OWNER_ROLE, OWNER_USER_IDS } from "./config/roles.js";

import { indexRoutes } from "./http/routes/index.js";
import { aboutRoutes } from "./http/routes/about.js";

import { logger } from "./utils/logger.js";
import { connectDatabase, getDb } from "./database/connect.js";
import { pluginRoutes } from "./http/routes/plugins.js";

await connectDatabase();

// Keep the configured account's Better Auth role aligned with the owner seed.
for (const ownerId of OWNER_USER_IDS) {
  if (!mongoose.isValidObjectId(ownerId)) {
    throw new Error(
      `Configured owner account ID is not a Mongo ObjectId: ${ownerId}`,
    );
  }
  const ownerResult = await getDb()
    .collection("user")
    .updateOne(
      { _id: new mongoose.Types.ObjectId(ownerId) },
      { $set: { role: OWNER_ROLE } },
    );
  if (ownerResult.matchedCount === 0) {
    logger(`Better Auth owner seed was not found for account ${ownerId}.`);
  }
}

// Better Auth uses the already-open Mongoose MongoDB connection.
const [
  { betterAuthPlugin },
  { userRoutes },
  { licenseRoutes },
  { License },
  { LicenseServer },
  { PlanAccess },
  { PlanPurchase },
  { PaymentEvent },
  { BillingTransaction },
  { AdminAuditLog },
  { BillingRateLimit },
  { licenseServerRoutes },
  { billingRoutes },
  { panelRoutes },
] = await Promise.all([
  import("./http/plugins/better-auth.js"),
  import("./http/routes/user.js"),
  import("./http/routes/license.js"),
  import("./database/models/License.js"),
  import("./database/models/LicenseServer.js"),
  import("./database/models/PlanAccess.js"),
  import("./database/models/PlanPurchase.js"),
  import("./database/models/PaymentEvent.js"),
  import("./database/models/BillingTransaction.js"),
  import("./database/models/AdminAuditLog.js"),
  import("./database/models/BillingRateLimit.js"),
  import("./http/routes/license-servers.js"),
  import("./http/routes/billing.js"),
  import("./http/routes/panel.js"),
]);

const { licensingAdminRoutes } = await import(
  "./http/routes/licensing-admin.js"
);
const { activationRoutes } = await import("./http/routes/activation.js");
const { minecraftMediaRoutes } = await import(
  "./http/routes/minecraft-media.js"
);
const {
  LicenseServerEvent,
  LicenseServerPrivacy,
  LicenseRequestNonce,
  LicenseActivationReceipt,
} = await import("./database/models/LicenseServerEvent.js");
await Promise.all([
  LicenseServerEvent.init(),
  LicenseServerPrivacy.init(),
  LicenseRequestNonce.init(),
  LicenseActivationReceipt.init(),
]);

// Create the unique owner index before accepting premium key requests.
await License.init();
await LicenseServer.init();
await PlanAccess.init();
await PlanPurchase.init();
await PaymentEvent.init();
await BillingTransaction.init();
await AdminAuditLog.init();
await BillingRateLimit.init();
await Promise.all([
  Coupon.init(),
  CouponAccountUsage.init(),
  CouponRedemption.init(),
]);
await migrateLicensingBeta3();

// Seed one latest payment per legacy purchase into the ledger. Recurring
// payments received after this deployment are recorded individually by the webhook.
const legacyPurchases = await PlanPurchase.find({
  mercadoPagoPaymentId: { $exists: true, $ne: "" },
})
  .select({
    userId: 1,
    externalReference: 1,
    mercadoPagoPaymentId: 1,
    plan: 1,
    serverSlots: 1,
    amount: 1,
    currency: 1,
    status: 1,
    updatedAt: 1,
  })
  .lean();
const legacyPaymentUpserts = legacyPurchases.flatMap((purchase) =>
  purchase.mercadoPagoPaymentId
    ? [
        {
          updateOne: {
            filter: { providerPaymentId: purchase.mercadoPagoPaymentId },
            update: {
              $setOnInsert: {
                userId: purchase.userId,
                purchaseReference: purchase.externalReference,
                providerPaymentId: purchase.mercadoPagoPaymentId,
                plan: purchase.plan,
                serverSlots: purchase.serverSlots ?? 0,
                amount: purchase.amount,
                currency: purchase.currency,
                status: purchase.status,
                paidAt: purchase.updatedAt,
              },
            },
            upsert: true,
          },
        },
      ]
    : [],
);
if (legacyPaymentUpserts.length) {
  await BillingTransaction.bulkWrite(legacyPaymentUpserts, { ordered: false });
}

// Normalize configured site URLs so a trailing slash does not prevent an
// otherwise valid browser Origin from matching the CORS allowlist.
const trustedWebOrigins = [env.DEV_URL, env.URL].map(
  (url) => new URL(url).origin,
);

const app = new Elysia({ name: "PluginsX API", adapter: node() })
  .use(
    cors({
      origin: (request) =>
        trustedWebOrigins.includes(request.headers.get("origin") ?? ""),
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    }),
  )
  .use(
    openapi({
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
      documentation: {
        info: {
          title: "PluginsX API",
          version: Package.version,
          description:
            "API do PluginsX voltada exclusivamente a servidores PaperMC. Downloads e metadados de plugins são publicados para Paper.",
        },
        tags: [
          {
            name: "Default",
            description: "Default routes",
          },
          {
            name: "User",
            description: "Authenticated user profile",
          },
          {
            name: "Panel",
            description:
              "Painel de vendas e gerenciamento de acesso, exclusivo para owners.",
          },
          {
            name: "License",
            description: "License related routes",
          },
          {
            name: "Plugins",
            description:
              "Metadados e downloads de versões compatíveis com PaperMC.",
          },
        ],
      },
    }),
  )
  .onBeforeHandle(async () => {
    await getLicensingConfig();
  })
  .use(betterAuthPlugin)

  // Routes
  .use(indexRoutes)
  .use(userRoutes)
  .use(aboutRoutes)
  .use(licenseRoutes)
  .use(licenseServerRoutes)
  .use(activationRoutes)
  .use(minecraftMediaRoutes)
  .use(billingRoutes)
  .use(panelRoutes)
  .use(licensingAdminRoutes)
  .use(pluginRoutes)

  .listen(
    {
      port: env.DEFAULT_PORT,
    },
    (info) => {
      logger(`🔥 api is running at ${info.hostname}:${info.port}`);
    },
  );

export type App = typeof app;

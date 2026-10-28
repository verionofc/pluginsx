import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Elysia } from "elysia";
import { License } from "../../database/models/License.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import {
  LicenseActivationReceipt,
  LicenseRequestNonce,
  LicenseServerEvent,
  LicenseServerPrivacy,
} from "../../database/models/LicenseServerEvent.js";
import {
  LicensingConfiguration,
  LicensingRevision,
} from "../../database/models/LicensingConfiguration.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import {
  RemoteSession,
  RemoteRevision,
  RemoteOperation,
} from "../../database/models/RemoteSpawnerX.js";
import { acceptedPlanTerms } from "../../domain/licensing-config.js";
import type { ActivationActor } from "../../domain/activation.js";
const uri = process.env.COUPON_TEST_MONGODB_URI;
type Service = typeof import("./activation-service.js");
type ConfigService = typeof import("./licensing-config.js");
let service: Service,
  configService: ConfigService,
  app: Elysia,
  ownerCookie: string,
  userCookie: string,
  ownerId: string;
const identity = () => {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKey: pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    privateKey: pair.privateKey,
  };
};
const actor: ActivationActor = {
  executionType: "PLAYER",
  username: "PaperAdmin",
  uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
};
describe("licensing beta.3 integration", { skip: !uri }, () => {
  before(async () => {
    assert.match(
      uri!,
      /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/pluginsx_coupon_test(?:\?|$)/,
    );
    Object.assign(process.env, {
      BETTER_AUTH_SECRET: "beta3-test-secret-only-0123456789abcdef",
      GITHUB_CLIENT_ID: "fixture",
      GITHUB_CLIENT_SECRET: "fixture",
      URL: "http://localhost:3000",
      DEV_URL: "http://localhost:3000",
      MONGODB_URI: "mongodb+srv://fixture.invalid",
      MONGODB_DB_NAME: "pluginsx_coupon_test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      MERCADOPAGO_ACCESS_TOKEN: "TEST-fixture",
      MERCADOPAGO_WEBHOOK_SECRET: "fixture-webhook",
      TEMP_LICENSE_TRIAL_ENABLED: "true",
    });
    await mongoose.connect(uri!);
    service = await import("./activation-service.js");
    configService = await import("./licensing-config.js");
    await Promise.all([
      License.init(),
      LicenseServer.init(),
      LicenseRequestNonce.init(),
      LicenseActivationReceipt.init(),
      LicenseServerEvent.init(),
      LicenseServerPrivacy.init(),
      LicensingConfiguration.init(),
      LicensingRevision.init(),
      PlanAccess.init(),
      PlanPurchase.init(),
      BillingTransaction.init(),
      BillingRateLimit.init(),
      RemoteSession.init(),
      RemoteRevision.init(),
      RemoteOperation.init(),
    ]);
    const { licensingAdminRoutes } = await import(
      "../routes/licensing-admin.js"
    );
    const { activationRoutes } = await import("../routes/activation.js");
    const { licenseServerRoutes } = await import(
      "../routes/license-servers.js"
    );
    const { billingRoutes } = await import("../routes/billing.js");
    const { remoteSpawnerXRoutes } = await import(
      "../routes/remote-spawnerx.js"
    );
    app = new Elysia()
      .use(licensingAdminRoutes)
      .use(activationRoutes)
      .use(licenseServerRoutes)
      .use(billingRoutes)
      .use(remoteSpawnerXRoutes)
      .compile() as unknown as Elysia;
  });
  after(async () => {
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([
      License.deleteMany({}),
      LicenseServer.deleteMany({}),
      LicenseRequestNonce.deleteMany({}),
      LicenseActivationReceipt.deleteMany({}),
      LicenseServerEvent.deleteMany({}),
      LicenseServerPrivacy.deleteMany({}),
      LicensingConfiguration.deleteMany({}),
      LicensingRevision.deleteMany({}),
      PlanAccess.deleteMany({}),
      PlanPurchase.deleteMany({}),
      BillingTransaction.deleteMany({}),
      BillingRateLimit.deleteMany({}),
      RemoteSession.deleteMany({}),
      RemoteRevision.deleteMany({}),
      RemoteOperation.deleteMany({}),
      mongoose.connection.db!.collection("user").deleteMany({}),
      mongoose.connection.db!.collection("session").deleteMany({}),
    ]);
    configService.invalidateLicensingConfig();
    await configService.getLicensingConfig();
    async function session(role: string) {
      const id = new mongoose.Types.ObjectId();
      const token = randomUUID();
      const now = new Date();
      await mongoose.connection.db!.collection("user").insertOne({
        _id: id,
        name: role,
        email: `${role}@example.test`,
        emailVerified: true,
        role,
        createdAt: now,
        updatedAt: now,
      });
      await mongoose.connection.db!.collection("session").insertOne({
        _id: new mongoose.Types.ObjectId(),
        token,
        userId: id,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: now,
        updatedAt: now,
      });
      const signed = encodeURIComponent(
        `${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`,
      );
      return {
        id: id.toString(),
        cookie: `better-auth.session_token=${signed}`,
      };
    }
    const owner = await session("owner"),
      user = await session("user");
    ownerId = owner.id;
    ownerCookie = owner.cookie;
    userCookie = user.cookie;
  });
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = ownerCookie,
  ) {
    return app.handle(
      new Request(`http://localhost:3000${path}`, {
        method,
        headers: {
          origin: "http://localhost:3000",
          cookie,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }
  async function fixture(limit = 3) {
    const config = await configService.getLicensingConfig();
    const terms = {
      ...acceptedPlanTerms(
        config,
        config.plans.find((p) => p.id === "lifetime")!,
      ),
      serverLimit: limit,
    };
    await PlanAccess.create({
      userId: ownerId,
      plan: "lifetime",
      status: "active",
      startsAt: new Date(),
      planTerms: terms,
    });
    const key = `plus_${randomUUID()}`;
    await License.create({
      _id: key,
      ownerId,
      sourcePlan: "lifetime",
      value: { tier: "plus", valid: true },
      planTerms: terms,
    });
    return { key, config };
  }
  async function activate(
    key: string,
    who = actor,
    id = identity(),
    requestId = randomUUID(),
    serverId = randomUUID(),
  ) {
    const input = {
      licenseKey: key,
      requestId,
      serverId,
      name: "Paper World",
      minecraftVersion: "1.21.1",
      implementation: "Paper" as const,
      implementationVersion: "1.21.1-100",
      pluginVersion: "1.0.0-beta.3",
      actor: who,
      authentication: {
        onlineMode: true,
        authenticationMode: "DIRECT_ONLINE" as const,
        trustedProxyForwarding: false,
      },
    };
    const config = await configService.getLicensingConfig();
    const { keyFingerprint } = await import("../../domain/activation.js");
    const row = await service.createActivation(
      input,
      {
        payload: "{}",
        publicKey: id.publicKey,
        timestamp: String(Date.now()),
        nonce: randomUUID(),
        signature: "fixture",
      },
      keyFingerprint(id.publicKey),
      config,
    );
    return { row, input, id, config };
  }
  test("real existing authentication denies unprivileged plan edits", async () => {
    const response = await request("/panel/licensing");
    assert.equal(response.status, 200, await response.clone().text());
    const config = (
      (await response.json()) as {
        config: { plans: unknown[]; version: number };
      }
    ).config;
    assert.equal(
      (
        await request(
          "/panel/plans/monthly",
          "PATCH",
          {
            expectedVersion: config.version,
            reason: "test edit",
            confirm: true,
            plan: config.plans[1],
          },
          userCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/panel/licensing", "GET", undefined, "")).status,
      401,
    );
  });
  test("valid activation awaits approval, issues a server credential and accepts its heartbeat", async () => {
    const { key } = await fixture();
    const { row, id, config } = await activate(key);
    assert.equal(row.state, "PENDING");
    assert.ok(
      Math.abs(row.expiresAt.getTime() - Date.now() - 12 * 60000) < 2000,
    );
    await service.manageActivation(ownerId, row._id, "approve", true);
    const { keyFingerprint } = await import("../../domain/activation.js");
    const owned = await service.authenticateInstallation(
      row._id,
      row.serverId,
      row.activationRequestId!,
      keyFingerprint(id.publicKey),
    );
    const response = await service.activationResponse(owned, config);
    assert.ok(response.activationCredential);
    const active = await service.authenticateInstallation(
      row._id,
      row.serverId,
      row.activationRequestId!,
      keyFingerprint(id.publicKey),
    );
    await service.activationResponse(
      active,
      config,
      response.activationCredential,
      true,
    );
    assert.ok((await LicenseServer.findById(row._id))?.lastHeartbeatAt);
  });
  test("invalid and expired keys cannot create a binding", async () => {
    await fixture();
    await assert.rejects(activate(`plus_${randomUUID()}`));
    const key = `plus_${randomUUID()}`;
    await License.create({
      _id: key,
      value: { tier: "plus", valid: true },
      sourcePlan: "trial",
      expiresAt: new Date(Date.now() - 1),
    });
    await assert.rejects(activate(key));
    assert.equal(await LicenseServer.countDocuments({}), 0);
  });
  test("rejection and expiration cannot be approved or reused", async () => {
    const { key } = await fixture();
    const first = await activate(key);
    await service.manageActivation(ownerId, first.row._id, "reject", true);
    await assert.rejects(
      service.manageActivation(ownerId, first.row._id, "approve", true),
    );
    const second = await activate(key);
    await LicenseServer.updateOne(
      { _id: second.row._id },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    await service.expireServerRequest(second.row._id);
    assert.equal(
      (await LicenseServer.findById(second.row._id))?.state,
      "EXPIRED",
    );
    const retried = await activate(
      key,
      actor,
      second.id,
      second.input.requestId,
      second.input.serverId,
    );
    assert.equal(retried.row.state, "EXPIRED");
  });
  test("simultaneous requests do not exceed the accepted capacity", async () => {
    const { key } = await fixture(2);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => activate(key)),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
    assert.equal((await License.findById(key))?.serverSlots, 2);
  });
  test("idempotency keys collapse concurrent duplicates without consuming extra slots", async () => {
    const { key } = await fixture();
    const id = identity(),
      requestId = randomUUID(),
      serverId = randomUUID();
    const rows = await Promise.all([
      activate(key, actor, id, requestId, serverId),
      activate(key, actor, id, requestId, serverId),
    ]);
    assert.equal(rows[0].row._id, rows[1].row._id);
    assert.equal((await License.findById(key))?.serverSlots, 1);
  });
  test("another account cannot read, approve, revoke or customize an owned server", async () => {
    const { key } = await fixture();
    const { row } = await activate(key);
    assert.equal(
      (
        await request(
          `/license/servers/${row._id}`,
          "GET",
          undefined,
          userCookie,
        )
      ).status,
      404,
    );
    await assert.rejects(
      service.manageActivation("foreign", row._id, "approve", true),
    );
    assert.equal(
      (
        await request(
          `/license/servers/${row._id}/appearance`,
          "PATCH",
          { displayName: "stolen" },
          userCookie,
        )
      ).status,
      404,
    );
  });
  test("removal requires confirmation, revokes credentials, frees a slot and supports controlled reactivation", async () => {
    const { key } = await fixture(1);
    const item = await activate(key);
    await service.manageActivation(ownerId, item.row._id, "approve", true);
    await assert.rejects(
      service.manageActivation(ownerId, item.row._id, "remove", false),
    );
    await service.manageActivation(ownerId, item.row._id, "remove", true);
    assert.equal((await License.findById(key))?.serverSlots, 0);
    await assert.rejects(
      activate(key, actor, item.id, randomUUID(), item.input.serverId),
    );
    await LicenseServer.updateOne(
      { _id: item.row._id },
      { $set: { revokedAt: new Date(Date.now() - 61000) } },
    );
    const next = await activate(
      key,
      actor,
      item.id,
      randomUUID(),
      item.input.serverId,
    );
    assert.equal(next.row.state, "PENDING");
    assert.equal(next.row._id, item.row._id);
  });
  test("a license revocation is authoritative even when the binding is active", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await service.manageActivation(ownerId, item.row._id, "approve", true);
    await License.updateOne({ _id: key }, { $set: { "value.valid": false } });
    const row = await LicenseServer.findById(item.row._id).select(
      "+credentialHash",
    );
    await assert.rejects(service.activationResponse(row!, item.config));
  });
  test("console and proxy metadata stay distinct from independent account verification", async () => {
    const { key } = await fixture();
    const consoleItem = await activate(key, {
      executionType: "CONSOLE",
      username: null,
      uuid: null,
    });
    assert.equal(consoleItem.row.accountVerification, "NOT_APPLICABLE");
    const player = await activate(key);
    assert.equal(player.row.accountVerification, "UNVERIFIED");
    assert.equal(player.row.authentication?.onlineMode, true);
  });
  test("commercial revisions affect new quotes and preserve already issued limits", async () => {
    const { key } = await fixture(5);
    const original = await configService.getLicensingConfig();
    const plan = {
      ...original.plans.find((p) => p.id === "lifetime")!,
      basePriceCents: 7990,
      serverLimit: 1,
    };
    const response = await request("/panel/plans/lifetime", "PATCH", {
      expectedVersion: original.version,
      reason: "Update public offer",
      confirm: true,
      plan,
    });
    assert.equal(response.status, 200, await response.clone().text());
    const catalog = (await (await request("/billing/catalog")).json()) as {
      plans: { id: string; amount: number }[];
    };
    assert.equal(catalog.plans.find((p) => p.id === "lifetime")?.amount, 79.9);
    assert.equal(
      (
        await service.licenseEntitlement(
          key,
          await configService.getLicensingConfig(),
        )
      ).limit,
      5,
    );
    assert.equal(await LicensingRevision.countDocuments({}), 1);
    assert.equal(
      (
        await request("/panel/plans/lifetime", "PATCH", {
          expectedVersion: original.version,
          reason: "stale edit",
          confirm: true,
          plan,
        })
      ).status,
      409,
    );
  });
  test("a base promotion can start and stop without silently rewriting subscription prices", async () => {
    const { key } = await fixture();
    let config = await configService.getLicensingConfig();
    const monthly = {
      ...config.plans.find((p) => p.id === "monthly")!,
      basePriceCents: 1990,
      salePriceCents: 990,
      promotionEnabled: true,
    };
    assert.equal(
      (
        await request("/panel/plans/monthly", "PATCH", {
          expectedVersion: config.version,
          reason: "Launch promotion",
          confirm: true,
          plan: monthly,
        })
      ).status,
      200,
    );
    config = await configService.getLicensingConfig();
    assert.equal(
      config.plans.find((p) => p.id === "monthly")?.basePriceCents,
      1990,
    );
    assert.equal((await License.findById(key))?.planTerms?.priceCents, 5990);
    assert.equal(
      (
        await request("/panel/plans/monthly", "PATCH", {
          expectedVersion: config.version,
          reason: "End promotion",
          confirm: true,
          plan: { ...monthly, promotionEnabled: false },
        })
      ).status,
      200,
    );
  });
  test("legacy entitlements migrate idempotently without overwriting explicit limits", async () => {
    await PlanAccess.create({
      userId: ownerId,
      plan: "monthly",
      status: "active",
      expiresAt: new Date(Date.now() + 86400000),
      serverLimitOverride: 17,
    });
    await configService.migrateLicensingBeta3();
    await configService.migrateLicensingBeta3();
    const access = await PlanAccess.findOne({ userId: ownerId });
    assert.equal(access?.serverLimitOverride, 17);
    assert.equal(access?.planTerms?.serverLimit, 3);
    assert.ok((await configService.getLicensingConfig()).migratedAt);
  });
  test("signed request nonces cannot be replayed", async () => {
    const { sign, createHash } = await import("node:crypto");
    const id = identity(),
      path = "/license/servers/poll",
      timestamp = String(Date.now()),
      nonce = randomUUID(),
      payload = "{}";
    const envelope = {
      publicKey: id.publicKey,
      payload,
      timestamp,
      nonce,
      signature: sign(
        null,
        Buffer.from(
          `POST\n${path}\n${timestamp}\n${nonce}\n${createHash("sha256").update(payload).digest("hex")}`,
        ),
        id.privateKey,
      ).toString("base64"),
    };
    const config = await configService.getLicensingConfig();
    await service.acceptServerProof(envelope, path, config);
    await assert.rejects(service.acceptServerProof(envelope, path, config));
  });
  test("server identity cannot be taken over by a different key pair", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await assert.rejects(
      activate(key, actor, identity(), randomUUID(), item.input.serverId),
    );
  });
  test("first-month credit is single-use and based on the actual approved transaction", async () => {
    const config = await configService.getLicensingConfig();
    const sub = "monthly-test",
      reference = randomUUID(),
      paidAt = new Date(Date.now() - 86400000);
    await PlanAccess.create({
      userId: ownerId,
      plan: "monthly",
      status: "active",
      startsAt: paidAt,
      expiresAt: new Date(Date.now() + 29 * 86400000),
      mercadoPagoSubscriptionId: sub,
      planTerms: acceptedPlanTerms(
        config,
        config.plans.find((p) => p.id === "monthly")!,
      ),
    });
    await PlanPurchase.create({
      userId: ownerId,
      plan: "monthly",
      amount: 9.9,
      currency: "BRL",
      externalReference: reference,
      status: "approved",
      mercadoPagoSubscriptionId: sub,
    });
    await BillingTransaction.create({
      userId: ownerId,
      plan: "monthly",
      amount: 9.9,
      currency: "BRL",
      purchaseReference: reference,
      providerPaymentId: "payment-test",
      status: "approved",
      paidAt,
    });
    const { quoteUpgrade } = await import("./upgrade.js");
    assert.equal((await quoteUpgrade(ownerId, 12990)).creditCents, 990);
    await PlanPurchase.create({
      userId: ownerId,
      plan: "aether",
      amount: 120,
      currency: "BRL",
      externalReference: randomUUID(),
      status: "pending",
      upgradeCreditPaymentId: "payment-test",
      upgradeCreditReserved: true,
    });
    assert.equal((await quoteUpgrade(ownerId, 12990)).creditCents, 0);
  });
  test("Trial and a paid plan coexist while the paid contract remains unchanged", async () => {
    await fixture();
    const response = await request("/billing/trial", "POST", {});
    assert.equal(response.status, 200, await response.clone().text());
    const access = await PlanAccess.findOne({ userId: ownerId });
    assert.equal(access?.plan, "lifetime");
    assert.equal(access?.status, "active");
    assert.ok(access?.trialLicenseCode);
    assert.equal(await License.countDocuments({}), 2);
  });
  async function monthlyFixture(amount = 11.9) {
    const config = await configService.getLicensingConfig(),
      sub = `subscription-${randomUUID()}`,
      reference = randomUUID(),
      paymentId = randomUUID(),
      paidAt = new Date(Date.now() - 86400000);
    await PlanAccess.create({
      userId: ownerId,
      plan: "monthly",
      status: "active",
      startsAt: paidAt,
      expiresAt: new Date(Date.now() + 29 * 86400000),
      mercadoPagoSubscriptionId: sub,
      planTerms: acceptedPlanTerms(
        config,
        config.plans.find((p) => p.id === "monthly")!,
      ),
    });
    await PlanPurchase.create({
      userId: ownerId,
      plan: "monthly",
      amount,
      currency: "BRL",
      externalReference: reference,
      status: "approved",
      mercadoPagoSubscriptionId: sub,
    });
    await BillingTransaction.create({
      userId: ownerId,
      plan: "monthly",
      amount,
      currency: "BRL",
      purchaseReference: reference,
      providerPaymentId: paymentId,
      status: "approved",
      paidAt,
    });
    return { sub, paymentId, paidAt };
  }
  test("checkout uses the credited server price and reserves the credit against parallel upgrades", async () => {
    await monthlyFixture();
    const { Preference } = await import("mercadopago");
    const original = Preference.prototype.create;
    let calls = 0;
    Preference.prototype.create = async function (input) {
      calls++;
      assert.equal(input.body.items?.[0]?.unit_price, 118);
      return {
        id: randomUUID(),
        init_point: "https://www.mercadopago.com.br/checkout/test",
      } as Awaited<ReturnType<typeof original>>;
    };
    try {
      const response = await request("/billing/checkout", "POST", {
        plan: "aether",
        serverSlots: 0,
        expectedTotalCents: 11800,
        userId: "forged",
        amount: 0.01,
      });
      assert.equal(response.status, 200, await response.clone().text());
      const purchase = await PlanPurchase.findOne({ plan: "aether" });
      assert.equal(purchase?.amount, 118);
      assert.equal(purchase?.upgradeCreditCents, 1190);
      assert.equal(purchase?.planTerms?.serverLimit, 250);
      assert.equal(purchase?.userId, ownerId);
      assert.equal(
        (
          await request("/billing/checkout", "POST", {
            plan: "aether",
            serverSlots: 0,
          })
        ).status,
        409,
      );
      assert.equal(calls, 1);
    } finally {
      Preference.prototype.create = original;
    }
  });
  test("a changed promotion requires a fresh accepted quote before creating a subscription", async () => {
    const config = await configService.getLicensingConfig();
    const monthly = {
      ...config.plans.find((p) => p.id === "monthly")!,
      basePriceCents: 1990,
      salePriceCents: 990,
      promotionEnabled: true,
    };
    await request("/panel/plans/monthly", "PATCH", {
      expectedVersion: config.version,
      reason: "New subscription offer",
      confirm: true,
      plan: monthly,
    });
    const { PreApproval } = await import("mercadopago");
    const original = PreApproval.prototype.create;
    let calls = 0;
    PreApproval.prototype.create = async function (input) {
      calls++;
      assert.equal(input.body.auto_recurring?.transaction_amount, 9.9);
      return {
        id: randomUUID(),
        init_point: "https://www.mercadopago.com.br/subscription/test",
      } as Awaited<ReturnType<typeof original>>;
    };
    try {
      assert.equal(
        (
          await request("/billing/checkout", "POST", {
            plan: "monthly",
            expectedTotalCents: 1190,
          })
        ).status,
        409,
      );
      assert.equal(calls, 0);
      const response = await request("/billing/checkout", "POST", {
        plan: "monthly",
        expectedTotalCents: 990,
      });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(
        (await PlanPurchase.findOne({ plan: "monthly" }))?.planTerms
          ?.priceCents,
        990,
      );
    } finally {
      PreApproval.prototype.create = original;
    }
  });
  test("a definite provider rejection releases an upgrade credit and records the failed delivery", async () => {
    await monthlyFixture();
    const { Preference } = await import("mercadopago");
    const original = Preference.prototype.create;
    Preference.prototype.create = async () => {
      throw { status: 400, message: "Fixture rejection" };
    };
    try {
      assert.equal(
        (
          await request("/billing/checkout", "POST", {
            plan: "aether",
            expectedTotalCents: 11800,
          })
        ).status,
        503,
      );
      const purchase = await PlanPurchase.findOne({ plan: "aether" });
      assert.equal(purchase?.providerDeliveryStatus, "failed");
      assert.equal(purchase?.upgradeCreditReserved, false);
      const { quoteUpgrade } = await import("./upgrade.js");
      assert.equal((await quoteUpgrade(ownerId, 12990)).creditCents, 1190);
    } finally {
      Preference.prototype.create = original;
    }
  });
  test("a paid upgrade retries a failed cancellation, then replaces the monthly entitlement without double billing", async () => {
    const source = await monthlyFixture();
    const { Preference, PreApproval, Payment } = await import("mercadopago");
    const subscriptionGet = PreApproval.prototype.get;
    PreApproval.prototype.get = async () =>
      ({ status: "authorized" }) as Awaited<ReturnType<typeof subscriptionGet>>;
    const create = Preference.prototype.create,
      update = PreApproval.prototype.update,
      get = Payment.prototype.get;
    let fail = true,
      reference = "";
    const paymentId = randomUUID();
    Preference.prototype.create = async (input) => {
      reference = input.body.external_reference!;
      return {
        id: randomUUID(),
        init_point: "https://www.mercadopago.com.br/checkout/test",
      } as Awaited<ReturnType<typeof create>>;
    };
    PreApproval.prototype.update = async (input) => {
      assert.equal(input.id, source.sub);
      assert.deepEqual(input.body, { status: "cancelled" });
      if (fail) throw new Error("Fixture outage");
      return { id: source.sub, status: "cancelled" } as Awaited<
        ReturnType<typeof update>
      >;
    };
    Payment.prototype.get = async () =>
      ({
        id: paymentId,
        external_reference: reference,
        transaction_amount: 118,
        currency_id: "BRL",
        status: "approved",
        date_approved: new Date().toISOString(),
      }) as unknown as Awaited<ReturnType<typeof get>>;
    try {
      assert.equal(
        (
          await request("/billing/checkout", "POST", {
            plan: "aether",
            expectedTotalCents: 11800,
          })
        ).status,
        200,
      );
      const eventId = randomUUID();
      async function webhook() {
        const requestId = randomUUID(),
          ts = String(Math.floor(Date.now() / 1000)),
          signature = createHmac(
            "sha256",
            process.env.MERCADOPAGO_WEBHOOK_SECRET!,
          )
            .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
            .digest("hex");
        return app.handle(
          new Request(
            `http://localhost:3000/billing/webhook?data.id=${paymentId}`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-request-id": requestId,
                "x-signature": `ts=${ts},v1=${signature}`,
              },
              body: JSON.stringify({
                id: eventId,
                type: "payment",
                data: { id: paymentId },
              }),
            },
          ),
        );
      }
      assert.equal((await webhook()).status, 503);
      assert.equal(
        (await PlanAccess.findOne({ userId: ownerId }))?.plan,
        "monthly",
      );
      assert.equal(
        (await PlanPurchase.findOne({ externalReference: reference }))
          ?.subscriptionCancellationStatus,
        "failed",
      );
      const pendingReceipt = (await (
        await request(`/billing/purchase/${reference}`)
      ).json()) as {
        paymentStatus: string;
        fulfillmentStatus: string;
        licenseRef: unknown;
      };
      assert.equal(pendingReceipt.paymentStatus, "approved");
      assert.equal(pendingReceipt.fulfillmentStatus, "processing");
      assert.equal(pendingReceipt.licenseRef, null);
      fail = false;
      const completed = await webhook();
      assert.equal(completed.status, 200, await completed.clone().text());
      const access = await PlanAccess.findOne({ userId: ownerId });
      assert.equal(access?.plan, "aether");
      assert.equal(access?.mercadoPagoSubscriptionId, undefined);
      assert.equal(access?.planTerms?.serverLimit, 250);
      assert.equal(
        (await PlanPurchase.findOne({ externalReference: reference }))?.amount,
        118,
      );
      assert.equal((await webhook()).status, 200);
    } finally {
      Preference.prototype.create = create;
      PreApproval.prototype.update = update;
      PreApproval.prototype.get = subscriptionGet;
      Payment.prototype.get = get;
    }
  });
  test("optional IP data is encrypted, masked, owner-only and removable without disabling activation", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await LicensingConfiguration.updateOne(
      { _id: "current" },
      { $set: { "policy.collectPlayerIp": true } },
    );
    configService.invalidateLicensingConfig();
    const { collectActivationPrivacy } = await import(
      "./activation-privacy.js"
    );
    const privacy = {
      consented: true,
      consentVersion: 1,
      consentedAt: new Date().toISOString(),
      playerIp: "203.0.113.42",
    };
    const policy = { ...item.config.policy, collectPlayerIp: true };
    await collectActivationPrivacy(
      item.row._id,
      { ...item.input, privacy },
      policy,
    );
    const stored = await LicenseServerPrivacy.findOne({
      serverRecordId: item.row._id,
    }).lean();
    assert.equal(stored?.maskedIp, "203.0.*.*");
    assert.ok(
      stored?.encryptedIp && !stored.encryptedIp.includes("203.0.113.42"),
    );
    const details = (await (
      await request(`/license/servers/${item.row._id}`)
    ).json()) as { privacy: Record<string, unknown> };
    assert.equal(details.privacy.encryptedIp, undefined);
    await collectActivationPrivacy(
      item.row._id,
      { ...item.input, privacy: { ...privacy, consented: false } },
      policy,
    );
    assert.equal(await LicenseServerPrivacy.countDocuments({}), 0);
    assert.equal(
      (await LicenseServer.findById(item.row._id))?.state,
      "PENDING",
    );
  });
  test("unknown, offline and proxy authentication never become verified merely because of a UUID", async () => {
    const { key, config } = await fixture();
    const id = identity();
    const { keyFingerprint } = await import("../../domain/activation.js");
    const input = {
      licenseKey: key,
      requestId: randomUUID(),
      serverId: randomUUID(),
      name: "Velocity Backend",
      minecraftVersion: "1.21.1",
      implementation: "Paper" as const,
      implementationVersion: "Paper",
      pluginVersion: "1.0.0-beta.3",
      actor,
      authentication: {
        onlineMode: false,
        authenticationMode: "VELOCITY" as const,
        trustedProxyForwarding: false,
      },
    };
    const row = await service.createActivation(
      input,
      {
        payload: "{}",
        publicKey: id.publicKey,
        timestamp: String(Date.now()),
        nonce: randomUUID(),
        signature: "fixture",
      },
      keyFingerprint(id.publicKey),
      config,
    );
    assert.equal(row.authentication?.authenticationMode, "VELOCITY");
    assert.equal(row.accountVerification, "UNVERIFIED");
  });
  test("avatar and skin failure use a local fallback while valid UUIDs cannot inject external URLs", async () => {
    const { minecraftMediaRoutes } = await import(
      "../routes/minecraft-media.js"
    );
    const media = new Elysia().use(minecraftMediaRoutes);
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Fixture skin provider unavailable");
    };
    try {
      for (const kind of ["avatar", "body", "skin"]) {
        const response = await media.handle(
          new Request(
            `http://localhost:3000/license/players/${randomUUID()}/${kind}`,
          ),
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/svg+xml");
        assert.match(await response.text(), /^<svg/);
      }
      assert.equal(
        (
          await media.handle(
            new Request(
              "http://localhost:3000/license/players/invalid-avatar/skin",
            ),
          )
        ).status,
        422,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
  test("an explicit owner limit change blocks further approvals but never evicts an active binding", async () => {
    const { key } = await fixture(3);
    const first = await activate(key),
      second = await activate(key);
    await service.manageActivation(ownerId, first.row._id, "approve", true);
    await PlanAccess.updateOne(
      { userId: ownerId },
      { $set: { serverLimitOverride: 1 } },
    );
    await assert.rejects(
      service.manageActivation(ownerId, second.row._id, "approve", true),
    );
    assert.equal(
      (await LicenseServer.findById(first.row._id))?.state,
      "ACTIVE",
    );
  });
  test("a rejected second payment attempt preserves paid slots until the approved payment is refunded", async () => {
    await fixture();
    const reference = randomUUID();
    await PlanPurchase.create({
      userId: ownerId,
      plan: "server_slots",
      serverSlots: 2,
      amount: 11.8,
      currency: "BRL",
      externalReference: reference,
      status: "pending",
    });
    const { Payment } = await import("mercadopago");
    const original = Payment.prototype.get;
    let paymentId = "100001",
      paymentStatus = "approved";
    Payment.prototype.get = async () =>
      ({
        id: paymentId,
        status: paymentStatus,
        external_reference: reference,
        transaction_amount: 11.8,
        currency_id: "BRL",
        date_approved: new Date().toISOString(),
      }) as unknown as Awaited<ReturnType<typeof original>>;
    async function webhook() {
      const ts = String(Math.floor(Date.now() / 1000)),
        requestId = randomUUID(),
        eventId = randomUUID();
      const signature = createHmac(
        "sha256",
        process.env.MERCADOPAGO_WEBHOOK_SECRET!,
      )
        .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
        .digest("hex");
      return app.handle(
        new Request(
          `http://localhost:3000/billing/webhook?data.id=${paymentId}&type=payment`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-request-id": requestId,
              "x-signature": `ts=${ts},v1=${signature}`,
            },
            body: JSON.stringify({
              id: eventId,
              type: "payment",
              data: { id: paymentId },
            }),
          },
        ),
      );
    }
    try {
      const approved = await webhook();
      assert.equal(approved.status, 200, await approved.clone().text());
      paymentId = "100002";
      paymentStatus = "rejected";
      assert.equal((await webhook()).status, 200);
      assert.equal(
        (await PlanPurchase.findOne({ externalReference: reference }))?.status,
        "approved",
      );
      assert.equal(
        (await PlanPurchase.findOne({ externalReference: reference }))
          ?.mercadoPagoPaymentId,
        "100001",
      );
      assert.equal(
        (
          (await (await request("/billing/state")).json()) as {
            additionalServerSlots: number;
          }
        ).additionalServerSlots,
        2,
      );
      assert.equal(
        await BillingTransaction.countDocuments({
          purchaseReference: reference,
        }),
        2,
      );
      paymentId = "100001";
      paymentStatus = "refunded";
      assert.equal((await webhook()).status, 200);
      assert.equal(
        (await PlanPurchase.findOne({ externalReference: reference }))?.status,
        "refunded",
      );
      assert.equal(
        (
          (await (await request("/billing/state")).json()) as {
            additionalServerSlots: number;
          }
        ).additionalServerSlots,
        0,
      );
    } finally {
      Payment.prototype.get = original;
    }
  });
  test("a reserved plan checkout remains resumable after a newer add-on purchase", async () => {
    const reference = randomUUID();
    await PlanPurchase.create({
      userId: ownerId,
      plan: "aether",
      amount: 118,
      currency: "BRL",
      externalReference: reference,
      status: "pending",
      entitlementCheckoutReserved: true,
      checkoutUrl: "https://www.mercadopago.com.br/checkout/saved",
    });
    await PlanPurchase.create({
      userId: ownerId,
      plan: "server_slots",
      serverSlots: 1,
      amount: 5.9,
      currency: "BRL",
      externalReference: randomUUID(),
      status: "approved",
    });
    const state = (await (await request("/billing/state")).json()) as {
      lastPurchase: { externalReference: string; checkoutUrl: string };
    };
    assert.equal(state.lastPurchase.externalReference, reference);
    assert.match(state.lastPurchase.checkoutUrl, /checkout\/saved$/);
  });
  test("refunding the current monthly charge never preserves its period because an older month was paid", async () => {
    const current = await monthlyFixture();
    const charge = await BillingTransaction.findOne({
      providerPaymentId: current.paymentId,
    });
    assert.ok(charge);
    await BillingTransaction.create({
      userId: ownerId,
      plan: "monthly",
      amount: 11.9,
      currency: "BRL",
      purchaseReference: charge.purchaseReference,
      providerPaymentId: randomUUID(),
      status: "approved",
      paidAt: new Date(Date.now() - 40 * 86400000),
    });
    const { Payment } = await import("mercadopago");
    const original = Payment.prototype.get;
    Payment.prototype.get = async () =>
      ({
        id: current.paymentId,
        status: "refunded",
        external_reference: charge.purchaseReference,
        transaction_amount: 11.9,
        currency_id: "BRL",
        date_approved: current.paidAt.toISOString(),
      }) as unknown as Awaited<ReturnType<typeof original>>;
    try {
      const ts = String(Math.floor(Date.now() / 1000)),
        requestId = randomUUID();
      const signature = createHmac(
        "sha256",
        process.env.MERCADOPAGO_WEBHOOK_SECRET!,
      )
        .update(`id:${current.paymentId};request-id:${requestId};ts:${ts};`)
        .digest("hex");
      const response = await app.handle(
        new Request(
          `http://localhost:3000/billing/webhook?data.id=${current.paymentId}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-request-id": requestId,
              "x-signature": `ts=${ts},v1=${signature}`,
            },
            body: JSON.stringify({
              id: randomUUID(),
              type: "payment",
              data: { id: current.paymentId },
            }),
          },
        ),
      );
      assert.equal(response.status, 200, await response.clone().text());
      const access = await PlanAccess.findOne({ userId: ownerId });
      assert.equal(access?.status, "revoked");
      assert.ok(access?.expiresAt && access.expiresAt < new Date());
    } finally {
      Payment.prototype.get = original;
    }
  });
  test("an upgrade cannot be fulfilled after its reserved monthly credit is reversed", async () => {
    const { assertUpgradeCredit, revokeUpgradesForReversedCredit } =
      await import("./upgrade.js");
    const reference = randomUUID(),
      paymentId = randomUUID();
    await BillingTransaction.create({
      userId: ownerId,
      plan: "monthly",
      amount: 11.9,
      currency: "BRL",
      purchaseReference: randomUUID(),
      providerPaymentId: paymentId,
      status: "refunded",
      paidAt: new Date(),
    });
    const purchase = await PlanPurchase.create({
      userId: ownerId,
      plan: "aether",
      amount: 118,
      currency: "BRL",
      externalReference: reference,
      status: "pending",
      upgradeCreditPaymentId: paymentId,
      upgradeCreditCents: 1190,
      upgradeCreditReserved: true,
    });
    await revokeUpgradesForReversedCredit(paymentId, ownerId);
    await assert.rejects(assertUpgradeCredit(purchase));
    assert.equal(
      (await PlanPurchase.findOne({ externalReference: reference }))
        ?.upgradeCreditReversed,
      true,
    );
    const panel = (await (await request("/panel/licensing")).json()) as {
      providerIssues: {
        externalReference: string;
        upgradeCreditReversed?: boolean;
      }[];
    };
    assert.ok(
      panel.providerIssues.some(
        (issue) =>
          issue.externalReference === reference && issue.upgradeCreditReversed,
      ),
    );
  });
  test("reversing the credited payment revokes only its dependent upgrade", async () => {
    const { revokeUpgradesForReversedCredit } = await import("./upgrade.js");
    const source = "credited-payment",
      reference = randomUUID();
    await PlanPurchase.create({
      userId: ownerId,
      plan: "aether",
      amount: 118,
      currency: "BRL",
      externalReference: reference,
      status: "approved",
      upgradeCreditPaymentId: source,
      upgradeCreditReserved: true,
    });
    await PlanAccess.create({
      userId: ownerId,
      plan: "aether",
      status: "active",
      purchaseReference: reference,
    });
    await revokeUpgradesForReversedCredit(source, ownerId);
    assert.equal(
      (await PlanAccess.findOne({ userId: ownerId }))?.status,
      "revoked",
    );
    await PlanAccess.updateOne(
      { userId: ownerId },
      {
        $set: {
          status: "active",
          purchaseReference: "another-fully-paid-contract",
        },
      },
    );
    await revokeUpgradesForReversedCredit(source, ownerId);
    assert.equal(
      (await PlanAccess.findOne({ userId: ownerId }))?.status,
      "active",
    );
  });

  test("active reconfiguration audits its actor once without replacing approval or consuming capacity", async () => {
    const { key } = await fixture(1);
    const item = await activate(key);
    await service.manageActivation(ownerId, item.row._id, "approve", true);
    const { keyFingerprint } = await import("../../domain/activation.js");
    const original = await service.authenticateInstallation(
      item.row._id,
      item.input.serverId,
      item.input.requestId,
      keyFingerprint(item.id.publicKey),
    );
    const issued = await service.activationResponse(original, item.config);
    const approved = await LicenseServer.findById(item.row._id).select(
      "+credentialHash",
    );
    const configuringActor: ActivationActor = {
      executionType: "PLAYER",
      username: "NewAdmin",
      uuid: randomUUID(),
    };
    const requestId = randomUUID();
    const configured = await activate(
      key,
      configuringActor,
      item.id,
      requestId,
      item.input.serverId,
    );
    const retried = await activate(
      key,
      configuringActor,
      item.id,
      requestId,
      item.input.serverId,
    );
    assert.equal(configured.row._id, item.row._id);
    assert.equal(retried.row.activationRequestId, item.input.requestId);
    const persisted = await LicenseServer.findById(item.row._id).select(
      "+credentialHash",
    );
    assert.equal(persisted?.state, "ACTIVE");
    assert.deepEqual(persisted?.activatedBy, actor);
    assert.equal(
      persisted?.approvedAt?.getTime(),
      approved?.approvedAt?.getTime(),
    );
    assert.equal(persisted?.credentialHash, approved?.credentialHash);
    assert.equal((await License.findById(key))?.serverSlots, 1);
    assert.equal(
      await LicenseActivationReceipt.countDocuments({ requestId }),
      1,
    );
    const events = await LicenseServerEvent.find({
      serverRecordId: item.row._id,
      action: "CONFIGURATION_UPDATED",
    }).lean();
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]?.metadata.actor, configuringActor);
    await service.activationResponse(
      persisted!,
      item.config,
      issued.activationCredential,
      true,
    );
    await service.manageActivation(ownerId, item.row._id, "remove", true);
    await assert.rejects(
      activate(key, configuringActor, item.id, requestId, item.input.serverId),
    );
  });
  test("legacy endpoints cannot validate or replace signed installations", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await service.manageActivation(ownerId, item.row._id, "approve", true);
    const post = await request("/license/servers/request", "POST", {
      key,
      serverId: item.input.serverId,
      name: "Legacy impersonation",
    });
    assert.equal(post.status, 409, await post.clone().text());
    const get = await request(
      `/license/servers/status?key=${key}&serverId=${item.input.serverId}`,
    );
    assert.equal(get.status, 409, await get.clone().text());
    assert.equal((await LicenseServer.findById(item.row._id))?.state, "ACTIVE");
    assert.equal((await LicenseServer.findById(item.row._id))?.protocol, 3);
  });
  test("disabling new legacy activations preserves existing legacy bindings", async () => {
    const { key } = await fixture();
    const serverId = randomUUID();
    const created = await request("/license/servers/request", "POST", {
      key,
      serverId,
      name: "Existing legacy",
    });
    assert.equal(created.status, 200, await created.clone().text());
    const row = (await created.json()) as { id: string };
    await service.manageActivation(ownerId, row.id, "approve", true);
    await LicensingConfiguration.updateOne(
      { _id: "current" },
      { $set: { "policy.allowLegacyActivations": false } },
    );
    configService.invalidateLicensingConfig();
    assert.equal(
      (
        await request("/license/servers/request", "POST", {
          key,
          serverId,
          name: "Existing legacy",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/license/servers/status?key=${key}&serverId=${serverId}`))
        .status,
      200,
    );
    const blocked = await request("/license/servers/request", "POST", {
      key,
      serverId: randomUUID(),
      name: "New legacy",
    });
    assert.equal(blocked.status, 409, await blocked.clone().text());
  });
  test("a reconfiguring administrator can erase only their own optional IP data", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await service.manageActivation(ownerId, item.row._id, "approve", true);
    const newActor: ActivationActor = {
      executionType: "PLAYER",
      username: "PrivacyAdmin",
      uuid: randomUUID(),
    };
    await LicensingConfiguration.updateOne(
      { _id: "current" },
      { $set: { "policy.collectPlayerIp": true } },
    );
    configService.invalidateLicensingConfig();
    const { collectActivationPrivacy } = await import(
      "./activation-privacy.js"
    );
    await collectActivationPrivacy(
      item.row._id,
      {
        ...item.input,
        actor: newActor,
        privacy: {
          consented: true,
          consentVersion: item.config.policy.consentVersion,
          consentedAt: new Date().toISOString(),
          playerIp: "203.0.113.42",
        },
      },
      { ...item.config.policy, collectPlayerIp: true },
    );
    assert.equal(
      (await LicenseServerPrivacy.findOne({ serverRecordId: item.row._id }))
        ?.subjectUuid,
      newActor.uuid,
    );
    const details = (await (
      await request(`/license/servers/${item.row._id}`)
    ).json()) as { privacy: unknown };
    assert.equal(
      details.privacy,
      null,
      "Another administrator's optional location must not be attributed to the original activator",
    );
    const { sign, createHash } = await import("node:crypto");
    const path = "/license/servers/privacy";
    async function erase(playerUuid: string) {
      const timestamp = String(Date.now()),
        nonce = randomUUID();
      const payload = JSON.stringify({
        activationId: item.row._id,
        serverId: item.input.serverId,
        requestId: item.input.requestId,
        playerUuid,
      });
      const signature = sign(
        null,
        Buffer.from(
          `POST\n${path}\n${timestamp}\n${nonce}\n${createHash("sha256").update(payload).digest("hex")}`,
        ),
        item.id.privateKey,
      ).toString("base64");
      return request(path, "POST", {
        payload,
        publicKey: item.id.publicKey,
        timestamp,
        nonce,
        signature,
      });
    }
    assert.equal((await erase(actor.uuid!)).status, 404);
    assert.equal(
      await LicenseServerPrivacy.countDocuments({
        serverRecordId: item.row._id,
      }),
      1,
    );
    const erased = await erase(newActor.uuid!);
    assert.equal(erased.status, 200, await erased.clone().text());
    assert.equal(
      await LicenseServerPrivacy.countDocuments({
        serverRecordId: item.row._id,
      }),
      0,
    );
    assert.equal((await LicenseServer.findById(item.row._id))?.state, "ACTIVE");
  });

  test("legacy and signed concurrent activations share one atomic capacity reservation", async () => {
    const { key } = await fixture(1);
    const legacy = async () => {
      const response = await request("/license/servers/request", "POST", {
        key,
        serverId: randomUUID(),
        name: "Legacy concurrent",
      });
      assert.ok(
        [200, 409].includes(response.status),
        await response.clone().text(),
      );
      return response.status === 200;
    };
    const modern = async () => {
      try {
        await activate(key);
        return true;
      } catch (error) {
        assert.equal((error as { code: string }).code, "SERVER_LIMIT");
        return false;
      }
    };
    const results = await Promise.all([
      legacy(),
      modern(),
      legacy(),
      modern(),
      legacy(),
      modern(),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(
      await LicenseServer.countDocuments({ licenseId: key, state: "PENDING" }),
      1,
    );
    assert.equal((await License.findById(key))?.serverSlots, 1);
  });
  test("legacy renewal and a signed activation cannot reuse the same remaining slot", async () => {
    const { key } = await fixture(1);
    const serverId = randomUUID();
    await LicenseServer.create({
      _id: randomUUID(),
      licenseId: key,
      ownerId,
      serverId,
      name: "Old binding",
      minecraftVersion: "1.21.1",
      implementation: "Paper",
      implementationVersion: "Paper",
      pluginVersion: "1.0.0-beta.2",
      state: "REVOKED",
      revokedAt: new Date(Date.now() - 3600000),
      createdAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() - 3000000),
    });
    const results = await Promise.all([
      request("/license/servers/request", "POST", {
        key,
        serverId,
        name: "Legacy renewed",
      }).then(async (response) => {
        assert.ok(
          [200, 409].includes(response.status),
          await response.clone().text(),
        );
        return response.status === 200;
      }),
      activate(key).then(
        () => true,
        (error) => {
          assert.equal((error as { code: string }).code, "SERVER_LIMIT");
          return false;
        },
      ),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(
      await LicenseServer.countDocuments({ licenseId: key, state: "PENDING" }),
      1,
    );
    assert.equal((await License.findById(key))?.serverSlots, 1);
  });
  test("paid checkout rechecks the entitlement after taking the account lock", async () => {
    const { lockBillingAccount, assertCheckoutEntitlement } = await import(
      "./billing-lock.js"
    );
    await PlanAccess.create({
      userId: ownerId,
      plan: "free",
      status: "expired",
    });
    const stale = await PlanAccess.findOne({ userId: ownerId }).lean();
    assert.equal(stale?.plan, "free");
    await PlanAccess.updateOne(
      { userId: ownerId },
      {
        $set: {
          plan: "monthly",
          status: "active",
          expiresAt: new Date(Date.now() + 86400000),
        },
      },
    );
    await assert.rejects(
      PlanAccess.db.transaction(async (session) => {
        await lockBillingAccount(ownerId, session);
        await assertCheckoutEntitlement(ownerId, "monthly", session);
      }),
      (error: unknown) =>
        (error as { code?: string }).code === "ENTITLEMENT_CONFLICT",
    );
  });
  test("concurrent credit reversal cannot leave its permanent grant active", async () => {
    const { grantPermanentPurchase } = await import(
      "./billing-entitlements.js"
    );
    const { revokeUpgradesForReversedCredit } = await import("./upgrade.js");
    const config = await configService.getLicensingConfig();
    const reference = randomUUID(),
      sourceReference = randomUUID(),
      sourcePayment = `source-${randomUUID()}`,
      targetPayment = `target-${randomUUID()}`;
    await PlanAccess.create({
      userId: ownerId,
      plan: "monthly",
      status: "active",
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      mercadoPagoSubscriptionId: "reversed-concurrent",
    });
    await BillingTransaction.create({
      userId: ownerId,
      purchaseReference: sourceReference,
      providerPaymentId: sourcePayment,
      plan: "monthly",
      serverSlots: 0,
      amount: 11.9,
      currency: "BRL",
      status: "approved",
      paidAt: new Date(),
    });
    await PlanPurchase.create({
      userId: ownerId,
      plan: "lifetime",
      amount: 48,
      currency: "BRL",
      externalReference: reference,
      status: "pending",
      planTerms: acceptedPlanTerms(
        config,
        config.plans.find((plan) => plan.id === "lifetime")!,
      ),
      upgradeCreditCents: 1190,
      upgradeCreditPaymentId: sourcePayment,
      upgradeCreditReserved: true,
      upgradeFromSubscriptionId: "reversed-concurrent",
      subscriptionCancellationStatus: "cancelled",
      entitlementCheckoutReserved: true,
    });
    await BillingTransaction.create({
      userId: ownerId,
      purchaseReference: reference,
      providerPaymentId: targetPayment,
      plan: "lifetime",
      serverSlots: 0,
      amount: 48,
      currency: "BRL",
      status: "approved",
      paidAt: new Date(),
    });
    const results = await Promise.allSettled([
      grantPermanentPurchase(reference),
      (async () => {
        await BillingTransaction.updateOne(
          { providerPaymentId: sourcePayment },
          { $set: { status: "refunded" } },
        );
        await revokeUpgradesForReversedCredit(sourcePayment, ownerId);
      })(),
    ]);
    assert.equal(results[1]?.status, "fulfilled");
    const final = await PlanAccess.findOne({ userId: ownerId }).lean();
    assert.equal(
      final?.plan === "lifetime" && final.status === "active",
      false,
    );
    assert.equal(
      (await PlanPurchase.findOne({ externalReference: reference }))
        ?.upgradeCreditReversed,
      true,
    );
  });
  test("cancellation finishing after an upgrade never overwrites the permanent entitlement", async () => {
    const source = await monthlyFixture();
    await PlanAccess.updateOne(
      { userId: ownerId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const { PreApproval } = await import("mercadopago");
    const original = PreApproval.prototype.update;
    PreApproval.prototype.update = async () => {
      await PlanAccess.updateOne(
        { userId: ownerId },
        {
          $set: {
            plan: "aether",
            status: "active",
            purchaseReference: "new-permanent-purchase",
          },
          $unset: { mercadoPagoSubscriptionId: "", expiresAt: "" },
        },
      );
      return { id: source.sub, status: "cancelled" } as Awaited<
        ReturnType<typeof original>
      >;
    };
    try {
      const response = await request("/billing/cancel", "POST", {});
      assert.equal(response.status, 200, await response.clone().text());
      const access = await PlanAccess.findOne({ userId: ownerId });
      assert.equal(access?.plan, "aether");
      assert.equal(access?.status, "active");
      assert.equal(access?.purchaseReference, "new-permanent-purchase");
      const { syncSubscriptionCancellation } = await import(
        "./subscription-access.js"
      );
      await syncSubscriptionCancellation(ownerId, source.sub);
      assert.equal(
        (await PlanAccess.findOne({ userId: ownerId }))?.status,
        "active",
      );
    } finally {
      PreApproval.prototype.update = original;
    }
  });
  test("subscription cancellation preserves the paid period and only changes the matching contract", async () => {
    const source = await monthlyFixture();
    const { syncSubscriptionCancellation } = await import(
      "./subscription-access.js"
    );
    const original = (await PlanAccess.findOne({ userId: ownerId }))!;
    await syncSubscriptionCancellation(ownerId, "unrelated-contract");
    assert.equal(
      (await PlanAccess.findOne({ userId: ownerId }))?.cancelAtPeriodEnd,
      false,
    );
    const end = await syncSubscriptionCancellation(ownerId, source.sub);
    assert.equal(end?.getTime(), original.expiresAt?.getTime());
    assert.equal(
      (await PlanAccess.findOne({ userId: ownerId }))?.status,
      "active",
    );
    assert.equal(
      (await PlanAccess.findOne({ userId: ownerId }))?.cancelAtPeriodEnd,
      true,
    );
  });
  test("a payable legacy checkout cannot be bypassed by the new reservation index", async () => {
    const reference = randomUUID();
    await PlanPurchase.create({
      userId: ownerId,
      plan: "monthly",
      amount: 11.9,
      currency: "BRL",
      externalReference: reference,
      status: "pending",
      mercadoPagoSubscriptionId: randomUUID(),
    });
    const { lockBillingAccount, assertCheckoutEntitlement } = await import(
      "./billing-lock.js"
    );
    await assert.rejects(
      PlanAccess.db.transaction(async (session) => {
        await lockBillingAccount(ownerId, session);
        await assertCheckoutEntitlement(ownerId, "lifetime", session);
      }),
      (error) =>
        (error as { code: string }).code === "CHECKOUT_ALREADY_PENDING",
    );
  });
  test("a recorded reversal cannot be reapproved by an older payment notification", async () => {
    const { recordPaymentAttempt } = await import(
      "./billing-payment-ledger.js"
    );
    const id = `ledger-${randomUUID()}`,
      reference = randomUUID(),
      paidAt = new Date(Date.now() - 10000);
    const values = {
      userId: ownerId,
      purchaseReference: reference,
      plan: "lifetime",
      serverSlots: 0,
      amount: 59.9,
      currency: "BRL",
      status: "approved",
      paidAt,
      couponCode: "$literal-test",
    };
    assert.equal((await recordPaymentAttempt(id, values)).status, "approved");
    assert.equal(
      (
        await recordPaymentAttempt(id, {
          ...values,
          status: "pending",
          paidAt: new Date(),
        })
      ).status,
      "approved",
    );
    assert.equal(
      (await recordPaymentAttempt(id, { ...values, status: "rejected" }))
        .status,
      "approved",
    );
    assert.equal(
      (await recordPaymentAttempt(id, { ...values, status: "refunded" }))
        .status,
      "refunded",
    );
    const stale = await recordPaymentAttempt(id, values);
    assert.equal(stale.status, "refunded");
    assert.equal(stale.paidAt?.getTime(), paidAt.getTime());
    assert.equal(stale.couponCode, "$literal-test");
    const chargedBackId = `ledger-${randomUUID()}`;
    await recordPaymentAttempt(chargedBackId, {
      ...values,
      status: "charged_back",
    });
    await PlanAccess.db.transaction(async (session) => {
      assert.equal(
        (await recordPaymentAttempt(chargedBackId, values, session)).status,
        "charged_back",
      );
    });
  });
  test("disabling collection during geolocation cannot recreate optional IP records", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await LicensingConfiguration.updateOne(
      { _id: "current" },
      {
        $set: {
          "policy.collectPlayerIp": true,
          "policy.geolocationEnabled": true,
        },
      },
    );
    configService.invalidateLicensingConfig();
    const config = await configService.getLicensingConfig();
    const { collectActivationPrivacy } = await import(
      "./activation-privacy.js"
    );
    const originalFetch = globalThis.fetch,
      originalToken = process.env.IPINFO_TOKEN;
    process.env.IPINFO_TOKEN = "fixture-private-token";
    let signalStarted!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => (signalStarted = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    globalThis.fetch = async () => {
      signalStarted();
      await gate;
      return new Response(
        JSON.stringify({
          country: "BR",
          region: "Fixture",
          city: "Approximate",
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    let collecting: Promise<void> | undefined;
    try {
      collecting = collectActivationPrivacy(
        item.row._id,
        {
          ...item.input,
          privacy: {
            consented: true,
            consentVersion: config.policy.consentVersion,
            consentedAt: new Date().toISOString(),
            playerIp: "203.0.113.42",
          },
        },
        config.policy,
      );
      await started;
      const changed = await request("/panel/licensing/settings", "PATCH", {
        expectedVersion: config.version,
        reason: "Withdraw optional data collection",
        confirm: true,
        policy: {
          ...config.policy,
          collectPlayerIp: false,
          geolocationEnabled: false,
        },
      });
      assert.equal(changed.status, 200, await changed.clone().text());
      release();
      await collecting;
      assert.equal(
        await LicenseServerPrivacy.countDocuments({
          serverRecordId: item.row._id,
        }),
        0,
      );
      assert.equal(
        (await LicenseServer.findById(item.row._id))?.state,
        "PENDING",
      );
    } finally {
      release();
      await collecting?.catch(() => undefined);
      globalThis.fetch = originalFetch;
      if (originalToken === undefined) delete process.env.IPINFO_TOKEN;
      else process.env.IPINFO_TOKEN = originalToken;
    }
  });
  test("owner erasure invalidates an in-flight geolocation write even before it has created a record", async () => {
    const { key } = await fixture();
    const item = await activate(key);
    await LicensingConfiguration.updateOne(
      { _id: "current" },
      {
        $set: {
          "policy.collectPlayerIp": true,
          "policy.geolocationEnabled": true,
        },
      },
    );
    configService.invalidateLicensingConfig();
    const config = await configService.getLicensingConfig();
    const { collectActivationPrivacy } = await import(
      "./activation-privacy.js"
    );
    const originalFetch = globalThis.fetch,
      originalToken = process.env.IPINFO_TOKEN;
    process.env.IPINFO_TOKEN = "fixture-private-token";
    let signalStarted!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => (signalStarted = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    globalThis.fetch = async () => {
      signalStarted();
      await gate;
      return new Response(
        JSON.stringify({
          country: "BR",
          region: "Fixture",
          city: "Approximate",
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    let collecting: Promise<void> | undefined;
    try {
      collecting = collectActivationPrivacy(
        item.row._id,
        {
          ...item.input,
          privacy: {
            consented: true,
            consentVersion: config.policy.consentVersion,
            consentedAt: new Date().toISOString(),
            playerIp: "203.0.113.42",
          },
        },
        config.policy,
      );
      await started;
      const erased = await request(
        `/license/servers/${item.row._id}/privacy`,
        "DELETE",
        { confirm: true },
      );
      assert.equal(erased.status, 200, await erased.clone().text());
      release();
      await collecting;
      assert.equal(
        await LicenseServerPrivacy.countDocuments({
          serverRecordId: item.row._id,
        }),
        0,
      );
      assert.ok(
        ((await LicenseServer.findById(item.row._id))?.privacyRevision ?? 0) >
          0,
      );
    } finally {
      release();
      await collecting?.catch(() => undefined);
      globalThis.fetch = originalFetch;
      if (originalToken === undefined) delete process.env.IPINFO_TOKEN;
      else process.env.IPINFO_TOKEN = originalToken;
    }
  });
  test("a confirmed paid access repairs its missing independent card even when Trial already exists", async () => {
    const trialResponse = await request("/billing/trial", "POST", {});
    assert.equal(trialResponse.status, 200, await trialResponse.clone().text());
    const trial = (await trialResponse.json()) as { code: string };
    const config = await configService.getLicensingConfig();
    await PlanAccess.updateOne(
      { userId: ownerId },
      {
        $set: {
          plan: "lifetime",
          status: "active",
          startsAt: new Date(),
          expiresAt: null,
          planTerms: acceptedPlanTerms(
            config,
            config.plans.find((p) => p.id === "lifetime")!,
          ),
        },
      },
    );
    assert.equal(await License.countDocuments({}), 1);
    const response = await request("/license/servers");
    assert.equal(response.status, 200, await response.clone().text());
    const cards = (await response.json()) as {
      id: string;
      plan: string;
      valid: boolean;
    }[];
    assert.equal(cards.length, 2);
    assert.ok(cards.some((card) => card.plan === "trial" && card.valid));
    assert.ok(cards.some((card) => card.plan === "lifetime" && card.valid));
    const paid = cards.find((card) => card.plan === "lifetime")!;
    const revealed = (await (
      await request("/license/servers/key", "POST", { licenseRef: paid.id })
    ).json()) as { key: string };
    assert.notEqual(revealed.key, trial.code);
    const { ensurePaidPlanLicense } = await import("./paid-plan-license.js");
    const repeated = await Promise.all(
      Array.from({ length: 4 }, () =>
        ensurePaidPlanLicense(ownerId, "lifetime"),
      ),
    );
    assert.ok(repeated.every((result) => result.code === revealed.key));
    assert.equal(
      await License.countDocuments({ ownerId, sourcePlan: "lifetime" }),
      1,
    );
    assert.equal((await License.findById(trial.code))?.sourcePlan, "trial");
  });
  test("independent paid-plan keys never inherit another plan's authorization after an upgrade", async () => {
    await monthlyFixture();
    const { ensurePaidPlanLicense } = await import("./paid-plan-license.js");
    const { view } = await import("./license.js");
    const monthly = await ensurePaidPlanLicense(ownerId, "monthly");
    const config = await configService.getLicensingConfig();
    await PlanAccess.updateOne(
      { userId: ownerId },
      {
        $set: {
          plan: "lifetime",
          status: "active",
          expiresAt: null,
          planTerms: acceptedPlanTerms(
            config,
            config.plans.find((p) => p.id === "lifetime")!,
          ),
        },
        $unset: { mercadoPagoSubscriptionId: "" },
      },
    );
    const lifetime = await ensurePaidPlanLicense(ownerId, "lifetime");
    assert.notEqual(monthly.code, lifetime.code);
    assert.equal((await License.findById(monthly.code))?.sourcePlan, "monthly");
    assert.equal((await view(monthly.code)).valid, false);
    assert.equal((await view(lifetime.code)).valid, true);
    await assert.rejects(
      service.licenseEntitlement(monthly.code, config),
      (error) => (error as { code: string }).code === "INACTIVE_LICENSE",
    );
    const cards = (await (await request("/license/servers")).json()) as {
      plan: string;
      valid: boolean;
    }[];
    assert.ok(cards.some((card) => card.plan === "monthly" && !card.valid));
    assert.ok(cards.some((card) => card.plan === "lifetime" && card.valid));
    await assert.rejects(ensurePaidPlanLicense(ownerId, "aether"));
    assert.equal(await License.countDocuments({ ownerId }), 2);
  });
  test("plan-key index migration preserves a legacy owned Trial and its server while allowing a separate paid key", async () => {
    const { migratePlanLicenseIndexes, ensurePaidPlanLicense } = await import(
      "./paid-plan-license.js"
    );
    await License.collection.createIndex(
      { ownerId: 1 },
      { name: "legacy_one_key_per_owner", unique: true, sparse: true },
    );
    const key = `plus_${randomUUID()}`,
      serverRecord = randomUUID();
    const expiry = new Date(Date.now() + 3600000);
    await License.create({
      _id: key,
      ownerId,
      sourcePlan: "lifetime",
      expiresAt: expiry,
      value: { tier: "plus", valid: true },
    });
    await LicenseServer.create({
      _id: serverRecord,
      licenseId: key,
      ownerId,
      serverId: randomUUID(),
      name: "Preserved Trial world",
      minecraftVersion: "1.21.1",
      implementation: "Paper",
      implementationVersion: "Paper",
      pluginVersion: "1.0.0-beta.3",
      state: "ACTIVE",
      createdAt: new Date(),
      expiresAt: expiry,
    });
    const config = await configService.getLicensingConfig();
    await PlanAccess.create({
      userId: ownerId,
      plan: "lifetime",
      status: "active",
      startsAt: new Date(),
      planTerms: acceptedPlanTerms(
        config,
        config.plans.find((p) => p.id === "lifetime")!,
      ),
    });
    await migratePlanLicenseIndexes();
    await migratePlanLicenseIndexes();
    assert.equal((await License.findById(key))?.sourcePlan, "trial");
    assert.equal(
      (await License.findById(key))?.expiresAt?.getTime(),
      expiry.getTime(),
    );
    assert.equal((await LicenseServer.findById(serverRecord))?.licenseId, key);
    const paid = await ensurePaidPlanLicense(ownerId, "lifetime");
    assert.notEqual(paid.code, key);
    assert.equal(await License.countDocuments({ ownerId }), 2);
    const indexes = await License.collection.indexes();
    assert.ok(
      !indexes.some(
        (index) =>
          index.unique &&
          Object.keys(index.key).length === 1 &&
          index.key.ownerId === 1,
      ),
    );
    assert.ok(
      indexes.some(
        (index) =>
          index.name === "one_paid_key_per_account_plan" && index.unique,
      ),
    );
  });
  async function paidOrder(plan: "lifetime" | "monthly" = "lifetime") {
    const config = await configService.getLicensingConfig();
    return PlanPurchase.create({
      userId: ownerId,
      plan,
      amount: plan === "monthly" ? 11.9 : 59.9,
      currency: "BRL",
      externalReference: randomUUID(),
      status: "pending",
      entitlementCheckoutReserved: true,
      planTerms: acceptedPlanTerms(
        config,
        config.plans.find((p) => p.id === plan)!,
      ),
    });
  }
  async function paymentNotification(id: string) {
    const ts = String(Math.floor(Date.now() / 1000)),
      requestId = randomUUID();
    const signature = createHmac(
      "sha256",
      process.env.MERCADOPAGO_WEBHOOK_SECRET!,
    )
      .update(`id:${id};request-id:${requestId};ts:${ts};`)
      .digest("hex");
    return app.handle(
      new Request(`http://localhost:3000/billing/webhook?data.id=${id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "x-signature": `ts=${ts},v1=${signature}`,
        },
        body: JSON.stringify({
          id: randomUUID(),
          type: "payment",
          data: { id },
        }),
      }),
    );
  }
  test("Trial then paid Ender Dragon webhook immediately issues a distinct ready key and both cards", async () => {
    const trial = (await (
      await request("/billing/trial", "POST", {})
    ).json()) as { code: string };
    const expiry = (await License.findById(trial.code))?.expiresAt?.getTime();
    const order = await paidOrder();
    const { Payment } = await import("mercadopago");
    const original = Payment.prototype.get;
    const id = randomUUID();
    Payment.prototype.get = async () =>
      ({
        id,
        external_reference: order.externalReference,
        transaction_amount: 59.9,
        currency_id: "BRL",
        status: "approved",
        date_approved: new Date().toISOString(),
      }) as unknown as Awaited<ReturnType<typeof original>>;
    try {
      const notified = await paymentNotification(id);
      assert.equal(notified.status, 200, await notified.clone().text());
      const receipt = (await (
        await request(`/billing/purchase/${order.externalReference}`)
      ).json()) as {
        fulfillmentStatus: string;
        licenseRef: string;
        paymentStatus: string;
      };
      assert.equal(receipt.paymentStatus, "approved");
      assert.equal(receipt.fulfillmentStatus, "ready");
      assert.match(receipt.licenseRef, /^[a-f0-9]{64}$/);
      const cards = (await (await request("/license/servers")).json()) as {
        plan: string;
        id: string;
        valid: boolean;
      }[];
      assert.equal(cards.length, 2);
      assert.ok(cards.some((card) => card.plan === "trial" && card.valid));
      assert.ok(
        cards.some(
          (card) =>
            card.plan === "lifetime" &&
            card.id === receipt.licenseRef &&
            card.valid,
        ),
      );
      const key = (await (
        await request("/license/servers/key", "POST", {
          licenseRef: receipt.licenseRef,
        })
      ).json()) as { key: string };
      assert.notEqual(key.key, trial.code);
      assert.equal(
        (await License.findById(trial.code))?.expiresAt?.getTime(),
        expiry,
      );
      assert.equal(await License.countDocuments({}), 2);
    } finally {
      Payment.prototype.get = original;
    }
  });
  test("owned receipt recovers a paid Pix without a webhook and repeated checks issue one independent key", async () => {
    await request("/billing/trial", "POST", {});
    const order = await paidOrder();
    const { Payment } = await import("mercadopago");
    const search = Payment.prototype.search,
      get = Payment.prototype.get;
    let searches = 0,
      gets = 0;
    const id = randomUUID();
    Payment.prototype.search = async (input) => {
      searches++;
      assert.equal(input?.options?.external_reference, order.externalReference);
      return { results: [{ id, status: "approved" }] } as Awaited<
        ReturnType<typeof search>
      >;
    };
    Payment.prototype.get = async () => {
      gets++;
      return {
        id,
        external_reference: order.externalReference,
        transaction_amount: 59.9,
        currency_id: "BRL",
        status: "approved",
        date_approved: new Date().toISOString(),
      } as unknown as Awaited<ReturnType<typeof get>>;
    };
    try {
      const forbidden = await request(
        `/billing/purchase/${order.externalReference}`,
        "GET",
        undefined,
        userCookie,
      );
      assert.equal(forbidden.status, 404);
      assert.equal(searches, 0);
      await Promise.all([
        request(`/billing/purchase/${order.externalReference}`),
        request(`/billing/purchase/${order.externalReference}`),
      ]);
      const receipt = (await (
        await request(`/billing/purchase/${order.externalReference}`)
      ).json()) as { fulfillmentStatus: string; licenseRef: string };
      assert.equal(receipt.fulfillmentStatus, "ready");
      assert.match(receipt.licenseRef, /^[a-f0-9]{64}$/);
      assert.equal(searches, 1);
      assert.equal(gets, 1);
      assert.equal(
        await License.countDocuments({ ownerId, sourcePlan: "lifetime" }),
        1,
      );
      assert.equal(await License.countDocuments({ sourcePlan: "trial" }), 1);
      const state = (await (await request("/billing/state")).json()) as {
        lastPurchase: { fulfillmentStatus: string; licenseRef: string };
      };
      assert.equal(state.lastPurchase.licenseRef, receipt.licenseRef);
      assert.equal(state.lastPurchase.fulfillmentStatus, "ready");
    } finally {
      Payment.prototype.search = search;
      Payment.prototype.get = get;
    }
  });
  test("mismatched provider references, amounts and currencies never grant a paid key", async () => {
    await request("/billing/trial", "POST", {});
    const order = await paidOrder();
    const { Payment } = await import("mercadopago");
    const search = Payment.prototype.search,
      get = Payment.prototype.get;
    const id = randomUUID();
    Payment.prototype.search = async () =>
      ({ results: [{ id, status: "approved" }] }) as Awaited<
        ReturnType<typeof search>
      >;
    try {
      for (const mismatch of [
        { external_reference: randomUUID() },
        { transaction_amount: 0.01 },
        { currency_id: "USD" },
      ]) {
        Payment.prototype.get = async () =>
          ({
            id,
            external_reference: order.externalReference,
            transaction_amount: 59.9,
            currency_id: "BRL",
            status: "approved",
            ...mismatch,
          }) as unknown as Awaited<ReturnType<typeof get>>;
        await PlanPurchase.updateOne(
          { _id: order._id },
          { $unset: { lastProviderCheckAt: "", providerCheckLeaseUntil: "" } },
        );
        const receipt = (await (
          await request(`/billing/purchase/${order.externalReference}`)
        ).json()) as { fulfillmentStatus: string; licenseRef: unknown };
        assert.equal(receipt.fulfillmentStatus, "pending");
        assert.equal(receipt.licenseRef, null);
        assert.equal(
          await License.countDocuments({ ownerId, sourcePlan: "lifetime" }),
          0,
        );
      }
      assert.equal(await License.countDocuments({}), 1);
    } finally {
      Payment.prototype.search = search;
      Payment.prototype.get = get;
    }
  });
  test("provider failure and forged return parameters keep the order unconfirmed and throttle retries", async () => {
    await request("/billing/trial", "POST", {});
    const order = await paidOrder();
    const { Payment } = await import("mercadopago");
    const original = Payment.prototype.search;
    let calls = 0;
    Payment.prototype.search = async () => {
      calls++;
      throw new Error("Fixture provider timeout");
    };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request(
          `/billing/purchase/${order.externalReference}?status=approved&collection_status=approved&payment_id=forged`,
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          fulfillmentStatus: string;
          paymentStatus: string;
        };
        assert.equal(body.fulfillmentStatus, "pending");
        assert.equal(body.paymentStatus, "pending");
      }
      assert.equal(calls, 1);
      assert.equal(
        await License.countDocuments({ ownerId, sourcePlan: "lifetime" }),
        0,
      );
    } finally {
      Payment.prototype.search = original;
    }
  });
  test("payment approval with interrupted key issuance stays processing and repairs without another payment", async () => {
    await request("/billing/trial", "POST", {});
    const order = await paidOrder();
    const { Payment } = await import("mercadopago");
    const get = Payment.prototype.get,
      insert = License.collection.insertOne;
    const id = randomUUID();
    Payment.prototype.get = async () =>
      ({
        id,
        external_reference: order.externalReference,
        transaction_amount: 59.9,
        currency_id: "BRL",
        status: "approved",
        date_approved: new Date().toISOString(),
      }) as unknown as Awaited<ReturnType<typeof get>>;
    License.collection.insertOne = async function (document, options) {
      if (document.sourcePlan === "lifetime")
        throw new Error("Fixture license write interrupted");
      return insert.call(this, document, options);
    };
    try {
      assert.equal((await paymentNotification(id)).status, 503);
      const processing = (await (
        await request(`/billing/purchase/${order.externalReference}`)
      ).json()) as {
        paymentStatus: string;
        fulfillmentStatus: string;
        licenseRef: unknown;
      };
      assert.equal(processing.paymentStatus, "approved");
      assert.equal(processing.fulfillmentStatus, "processing");
      assert.equal(processing.licenseRef, null);
      assert.equal(await License.countDocuments({}), 1);
      License.collection.insertOne = insert;
      await PlanPurchase.updateOne(
        { _id: order._id },
        { $unset: { lastProviderCheckAt: "", providerCheckLeaseUntil: "" } },
      );
      const recovered = (await (
        await request(`/billing/purchase/${order.externalReference}`)
      ).json()) as { fulfillmentStatus: string };
      assert.equal(recovered.fulfillmentStatus, "ready");
      assert.equal(
        await License.countDocuments({ ownerId, sourcePlan: "lifetime" }),
        1,
      );
      assert.equal(await License.countDocuments({}), 2);
    } finally {
      License.collection.insertOne = insert;
      Payment.prototype.get = get;
    }
  });
  test("an expired older invoice cannot fund a monthly period whose payment was reversed", async () => {
    const config = await configService.getLicensingConfig(),
      reference = randomUUID();
    const terms = acceptedPlanTerms(
      config,
      config.plans.find((plan) => plan.id === "monthly")!,
    );
    await PlanPurchase.create({
      userId: ownerId,
      plan: "monthly",
      amount: 11.9,
      currency: "BRL",
      externalReference: reference,
      status: "approved",
      fulfilledAt: new Date(),
      planTerms: terms,
    });
    await PlanAccess.create({
      userId: ownerId,
      plan: "monthly",
      status: "active",
      purchaseReference: reference,
      planTerms: terms,
      expiresAt: new Date(Date.now() + 86400000),
    });
    await BillingTransaction.create([
      {
        userId: ownerId,
        purchaseReference: reference,
        providerPaymentId: randomUUID(),
        plan: "monthly",
        amount: 11.9,
        currency: "BRL",
        status: "approved",
        paidAt: new Date(Date.now() - 400 * 86400000),
      },
      {
        userId: ownerId,
        purchaseReference: reference,
        providerPaymentId: randomUUID(),
        plan: "monthly",
        amount: 11.9,
        currency: "BRL",
        status: "refunded",
        paidAt: new Date(),
      },
    ]);
    const { ensurePaidPlanLicense } = await import("./paid-plan-license.js"),
      { hasPremiumAccess } = await import("./plan-access.js");
    assert.equal(await hasPremiumAccess(ownerId), false);
    await assert.rejects(
      ensurePaidPlanLicense(ownerId, "monthly"),
      (error) => (error as { code: string }).code === "PLAN_REQUIRED",
    );
    const receipt = (await (
      await request(`/billing/purchase/${reference}`)
    ).json()) as { fulfillmentStatus: string; licenseRef: unknown };
    assert.equal(receipt.fulfillmentStatus, "revoked");
    assert.equal(receipt.licenseRef, null);
    assert.equal(await License.countDocuments({ ownerId }), 0);
    await BillingTransaction.create({
      userId: ownerId,
      purchaseReference: reference,
      providerPaymentId: randomUUID(),
      plan: "monthly",
      amount: 11.9,
      currency: "BRL",
      status: "approved",
      paidAt: new Date(),
    });
    assert.equal(await hasPremiumAccess(ownerId), true);
    assert.ok(
      (await ensurePaidPlanLicense(ownerId, "monthly")).code.startsWith(
        "plus_",
      ),
    );
  });
  test("a recorded reversal blocks stale approved receipts, missing-key recovery and existing-key authorization", async () => {
    const config = await configService.getLicensingConfig(),
      reference = randomUUID(),
      paymentId = randomUUID();
    await PlanPurchase.create({
      userId: ownerId,
      plan: "lifetime",
      amount: 59.9,
      currency: "BRL",
      externalReference: reference,
      status: "approved",
    });
    await PlanAccess.create({
      userId: ownerId,
      plan: "lifetime",
      status: "active",
      purchaseReference: reference,
      planTerms: acceptedPlanTerms(
        config,
        config.plans.find((plan) => plan.id === "lifetime")!,
      ),
    });
    await BillingTransaction.create({
      userId: ownerId,
      purchaseReference: reference,
      providerPaymentId: paymentId,
      plan: "lifetime",
      amount: 59.9,
      currency: "BRL",
      status: "refunded",
      paidAt: new Date(),
    });
    const receipt = (await (
      await request(`/billing/purchase/${reference}`)
    ).json()) as {
      paymentStatus: string;
      fulfillmentStatus: string;
      licenseRef: unknown;
    };
    assert.equal(receipt.paymentStatus, "refunded");
    assert.equal(receipt.fulfillmentStatus, "revoked");
    assert.equal(receipt.licenseRef, null);
    const { ensurePaidPlanLicense } = await import("./paid-plan-license.js");
    await assert.rejects(
      ensurePaidPlanLicense(ownerId, "lifetime"),
      (error) => (error as { code: string }).code === "PLAN_REQUIRED",
    );
    assert.deepEqual(await (await request("/license/servers")).json(), []);
    assert.equal(await License.countDocuments({ ownerId }), 0);
    const key = `plus_${randomUUID()}`;
    await License.create({
      _id: key,
      ownerId,
      sourcePlan: "lifetime",
      value: { tier: "plus", valid: true },
    });
    const { view } = await import("./license.js"),
      { hasPremiumAccess } = await import("./plan-access.js");
    assert.equal((await view(key)).valid, false);
    assert.equal(await hasPremiumAccess(ownerId), false);
    await assert.rejects(
      service.licenseEntitlement(key, config),
      (error) => (error as { code: string }).code === "INACTIVE_LICENSE",
    );
    const state = (await (await request("/billing/state")).json()) as {
      access: { status: string };
    };
    assert.equal(state.access.status, "revoked");
    // A different, still-approved attempt pays the same order; the refunded
    // attempt alone must not revoke that independent payment's access.
    await BillingTransaction.create({
      userId: ownerId,
      purchaseReference: reference,
      providerPaymentId: randomUUID(),
      plan: "lifetime",
      amount: 59.9,
      currency: "BRL",
      status: "approved",
      paidAt: new Date(),
    });
    assert.equal((await view(key)).valid, true);
    assert.equal(await hasPremiumAccess(ownerId), true);
    assert.equal((await ensurePaidPlanLicense(ownerId, "lifetime")).code, key);
  });
  function remoteSnapshot(hash = "a".repeat(64), enabled = true) {
    const bool = {
      type: "boolean",
      title: "Ativo",
      description: "Habilitar o recurso",
      default: true,
      reload: "RELOAD",
    };
    const shop = {
      type: "object",
      properties: {
        spawner: {
          type: "object",
          properties: {
            shop: {
              type: "object",
              properties: {
                enabled: bool,
                currency: { type: "string", enum: ["XP"], default: "XP" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    };
    const config = {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["pt_BR", "en_US"], default: "pt_BR" },
        spawner: {
          type: "object",
          properties: { "stacking-enabled": bool },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    };
    const defaults = {
      config: { locale: "pt_BR", spawner: { "stacking-enabled": true } },
      shop: { spawner: { shop: { enabled: true, currency: "XP" } } },
    };
    return {
      configHash: hash,
      documents: {
        ...structuredClone(defaults),
        config: { locale: "pt_BR", spawner: { "stacking-enabled": enabled } },
      },
      capabilities: {
        schemaVersion: 1,
        pluginVersion: "1.0.0-beta.4",
        operations: ["APPLY", "PLUGIN_RELOAD", "SYNC", "RESTORE"],
        schema: { config, shop },
        defaults,
      },
    };
  }
  async function remoteFixture() {
    const { key } = await fixture();
    const a = await activate(key);
    await service.manageActivation(ownerId, a.row._id, "approve", true);
    const { keyFingerprint } = await import("../../domain/activation.js");
    const row = await service.authenticateInstallation(
      a.row._id,
      a.row.serverId,
      a.input.requestId,
      keyFingerprint(a.id.publicKey),
    );
    const activation = await service.activationResponse(row, a.config);
    const base = {
      activationId: row._id,
      serverId: row.serverId,
      requestId: a.input.requestId,
    };
    async function plugin(
      action: string,
      data: Record<string, unknown>,
      credential = activation.activationCredential,
    ) {
      const { sign, createHash } = await import("node:crypto"),
        path = `/remote/spawnerx/plugin/${action}`,
        payload = JSON.stringify({ ...base, ...data }),
        nonce = randomUUID(),
        timestamp = String(Date.now());
      const body = {
        payload,
        publicKey: a.id.publicKey,
        nonce,
        timestamp,
        signature: sign(
          null,
          Buffer.from(
            `POST\n${path}\n${timestamp}\n${nonce}\n${createHash("sha256").update(payload).digest("hex")}`,
          ),
          a.id.privateKey,
        ).toString("base64"),
      };
      return app.handle(
        new Request(`http://localhost:3000${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential}`,
          },
          body: JSON.stringify(body),
        }),
      );
    }
    const response = await plugin("connect", {
      actor,
      snapshot: remoteSnapshot(),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const connect = (await response.json()) as {
      sessionId: string;
      code: string;
      url: string;
    };
    const token = new URLSearchParams(new URL(connect.url).hash.slice(1)).get(
      "token",
    )!;
    return {
      ...a,
      key,
      row,
      plugin,
      connect,
      token,
      prefix: `/remote/spawnerx/servers/${row._id}`,
    };
  }
  async function remoteConnected() {
    const f = await remoteFixture();
    const approve = await request(f.prefix + "/authorize", "POST", {
      requestId: f.connect.sessionId,
      token: f.token,
      decision: "approve",
    });
    assert.equal(approve.status, 200, await approve.clone().text());
    const polled = await f.plugin("poll", {
      sessionId: f.connect.sessionId,
      operational: true,
    });
    assert.equal(polled.status, 200, await polled.clone().text());
    const confirmation = (await polled.json()) as { confirmationToken: string };
    const confirm = await f.plugin("confirm", {
      sessionId: f.connect.sessionId,
      playerUuid: actor.uuid,
      confirmationToken: confirmation.confirmationToken,
      decision: "confirm",
      snapshot: remoteSnapshot(),
    });
    assert.equal(confirm.status, 200, await confirm.clone().text());
    return f;
  }
  test("remote handshake requires website ownership and exact Minecraft player confirmation; tokens stay private and one-use", async () => {
    const f = await remoteFixture();
    assert.equal(new URL(f.connect.url).search, "");
    const saved = await RemoteSession.findById(f.row._id)
      .select("+tokenHash")
      .lean();
    assert.notEqual(saved!.tokenHash, f.token);
    const state = await request(f.prefix);
    assert.equal(state.status, 200);
    const before = (await state.json()) as {
      manageable: boolean;
      session: { state: string };
    };
    assert.equal(before.manageable, false);
    assert.equal(before.session.state, "PENDING");
    assert.ok(!JSON.stringify(before).includes(f.token));
    assert.equal(
      (await request(f.prefix, "GET", undefined, userCookie)).status,
      404,
    );
    const input = {
      requestId: f.connect.sessionId,
      token: f.token,
      decision: "approve",
    };
    assert.equal(
      (
        await request(f.prefix + "/authorize", "POST", {
          ...input,
          token: "x".repeat(43),
        })
      ).status,
      403,
    );
    assert.equal(
      await LicenseServerEvent.countDocuments({
        serverRecordId: f.row._id,
        action: "REMOTE_INVALID_TOKEN",
      }),
      1,
    );
    assert.equal(
      (await request(f.prefix + "/authorize", "POST", input, userCookie))
        .status,
      404,
    );
    assert.equal(
      (await request(f.prefix + "/authorize", "POST", input)).status,
      200,
    );
    assert.equal(
      (await request(f.prefix + "/authorize", "POST", input)).status,
      409,
    );
    assert.equal(
      (
        await request(f.prefix + "/operations", "POST", {
          kind: "PLUGIN_RELOAD",
          expectedHash: "a".repeat(64),
          confirmed: true,
        })
      ).status,
      409,
    );
    const poll = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
      })
    ).json()) as { state: string; confirmationToken: string };
    assert.equal(poll.state, "WEB_APPROVED");
    assert.equal(
      (
        await f.plugin("confirm", {
          sessionId: f.connect.sessionId,
          playerUuid: randomUUID(),
          confirmationToken: poll.confirmationToken,
          decision: "confirm",
        })
      ).status,
      403,
    );
    const confirm = {
      sessionId: f.connect.sessionId,
      playerUuid: actor.uuid,
      confirmationToken: poll.confirmationToken,
      decision: "confirm",
    };
    assert.equal((await f.plugin("confirm", confirm)).status, 200);
    assert.equal((await f.plugin("confirm", confirm)).status, 409);
    const after = (await (await request(f.prefix)).json()) as {
      manageable: boolean;
      session: { state: string; actor: { accountVerification: string } };
    };
    assert.equal(after.manageable, true);
    assert.equal(after.session.state, "CONNECTED");
    assert.equal(after.session.actor.accountVerification, "UNVERIFIED");
    assert.ok(!JSON.stringify(after).includes(poll.confirmationToken));
  });
  test("remote expiry, wrong server, rejected request and Trial never permit administration", async () => {
    const f = await remoteFixture();
    await RemoteSession.updateOne(
      { _id: f.row._id },
      { $set: { approvalExpiresAt: new Date(Date.now() - 1) } },
    );
    assert.equal(
      (
        await request(f.prefix + "/authorize", "POST", {
          requestId: f.connect.sessionId,
          token: f.token,
          decision: "approve",
        })
      ).status,
      409,
    );
    const state = (await (await request(f.prefix)).json()) as {
      session: { state: string };
    };
    assert.equal(state.session.state, "EXPIRED");
    assert.equal(
      (
        await request(
          `/remote/spawnerx/servers/${randomUUID()}/authorize`,
          "POST",
          {
            requestId: f.connect.sessionId,
            token: f.token,
            decision: "approve",
          },
        )
      ).status,
      404,
    );
    await License.updateOne(
      { _id: f.key },
      {
        $set: { sourcePlan: "trial", expiresAt: new Date(Date.now() + 60000) },
      },
    );
    const trial = await f.plugin("connect", {
      actor,
      snapshot: remoteSnapshot(),
    });
    assert.equal(trial.status, 403, await trial.clone().text());
    assert.equal(
      ((await trial.json()) as { code: string }).code,
      "PAID_PLAN_REQUIRED",
    );
    const after = (await (await request(f.prefix)).json()) as {
      manageable: boolean;
    };
    assert.equal(after.manageable, false);
  });
  test("offline remote channel blocks saves/reloads and expires deliveries without replay on reconnect", async () => {
    const f = await remoteConnected();
    const operation = await request(f.prefix + "/operations", "POST", {
      kind: "PLUGIN_RELOAD",
      expectedHash: "a".repeat(64),
      confirmed: true,
    });
    assert.equal(operation.status, 200);
    const op = (await operation.json()) as {
      operation: { id: string; status: string };
    };
    assert.equal(op.operation.status, "QUEUED");
    await RemoteSession.updateOne(
      { _id: f.row._id },
      { $set: { leaseExpiresAt: new Date(0) } },
    );
    const state = (await (await request(f.prefix)).json()) as {
      manageable: boolean;
      operations: { status: string }[];
    };
    assert.equal(state.manageable, false);
    assert.equal(state.operations[0]!.status, "EXPIRED");
    assert.equal(
      (
        await request(f.prefix + "/draft", "POST", {
          expectedRevision: null,
          expectedHash: "a".repeat(64),
          documents: remoteSnapshot().documents,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(f.prefix + "/operations", "POST", {
          kind: "PLUGIN_RELOAD",
          expectedHash: "a".repeat(64),
          confirmed: true,
        })
      ).status,
      409,
    );
    const resumed = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
        snapshot: remoteSnapshot(),
      })
    ).json()) as { state: string; operation?: unknown };
    assert.equal(resumed.state, "CONNECTED");
    assert.equal(resumed.operation, undefined);
    assert.equal(
      (
        await f.plugin("result", {
          sessionId: f.connect.sessionId,
          operationId: op.operation.id,
          status: "APPLIED",
          message: "unexpected",
          snapshot: remoteSnapshot(),
        })
      ).status,
      409,
    );
  });
  test("remote reload delivery is serialized and only a real matching plugin result records success", async () => {
    const f = await remoteConnected(),
      input = {
        kind: "PLUGIN_RELOAD",
        expectedHash: "a".repeat(64),
        confirmed: true,
      };
    const responses = await Promise.all([
      request(f.prefix + "/operations", "POST", input),
      request(f.prefix + "/operations", "POST", input),
    ]);
    assert.deepEqual(responses.map((v) => v.status).sort(), [200, 409]);
    const delivered = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
      })
    ).json()) as { operation: { id: string; kind: string } };
    assert.equal(delivered.operation.kind, "PLUGIN_RELOAD");
    const pending = await RemoteOperation.findById(
      delivered.operation.id,
    ).lean();
    assert.equal(pending!.status, "SENT");
    assert.equal(
      (
        await f.plugin("result", {
          sessionId: f.connect.sessionId,
          operationId: delivered.operation.id,
          status: "APPLIED",
          message: "done",
        })
      ).status,
      400,
    );
    const result = {
      sessionId: f.connect.sessionId,
      operationId: delivered.operation.id,
      status: "APPLIED",
      message:
        "SpawnerX recarregado com sucesso. As configurações foram aplicadas.",
      snapshot: remoteSnapshot(),
      backupId: "backup-fixture",
    };
    assert.equal((await f.plugin("result", result)).status, 200);
    assert.equal((await f.plugin("result", result)).status, 200);
    const finished = await RemoteOperation.findById(
      delivered.operation.id,
    ).lean();
    assert.equal(finished!.status, "APPLIED");
    assert.equal(finished!.busy, false);
    assert.equal(
      await RemoteRevision.countDocuments({
        operationId: delivered.operation.id,
      }),
      1,
    );
  });
  test("remote drafts validate schema and secret boundaries, use optimistic revision checks and detect local conflicts", async () => {
    const f = await remoteConnected(),
      docs = remoteSnapshot("a".repeat(64), false).documents;
    const body = {
      expectedRevision: null,
      expectedHash: "a".repeat(64),
      documents: docs,
    };
    const secret = {
      ...body,
      documents: {
        ...docs,
        config: { ...docs.config, license: { key: "never-transmit" } },
      },
    };
    assert.equal(
      (await request(f.prefix + "/draft", "POST", secret)).status,
      400,
    );
    assert.equal(
      (
        await request(f.prefix + "/draft", "POST", {
          ...body,
          documents: {
            ...docs,
            shop: { spawner: { shop: { currency: "BRL" } } },
          },
        })
      ).status,
      400,
    );
    const saved = await request(f.prefix + "/draft", "POST", body);
    assert.equal(saved.status, 200, await saved.clone().text());
    const revision = (await saved.json()) as {
      revision: { id: string; status: string };
    };
    assert.equal(revision.revision.status, "SAVED");
    assert.equal(
      (await request(f.prefix + "/draft", "POST", body)).status,
      409,
    );
    const queued = await request(f.prefix + "/operations", "POST", {
      kind: "APPLY",
      expectedHash: "a".repeat(64),
      revisionId: revision.revision.id,
      confirmed: true,
    });
    assert.equal(queued.status, 200);
    const changed = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
        snapshot: remoteSnapshot("b".repeat(64)),
      })
    ).json()) as { operation?: unknown };
    assert.equal(changed.operation, undefined);
    const conflict = await RemoteOperation.findOne({
      revisionId: revision.revision.id,
    }).lean();
    assert.equal(conflict!.status, "CONFLICT");
  });
  test("remote apply acknowledges new files once, retains revisions and restores only online", async () => {
    const f = await remoteConnected(),
      before = await RemoteRevision.findOne({
        serverRecordId: f.row._id,
        status: "SNAPSHOT",
      }).lean();
    const saved = (await (
      await request(f.prefix + "/draft", "POST", {
        expectedRevision: null,
        expectedHash: "a".repeat(64),
        documents: remoteSnapshot("a".repeat(64), false).documents,
      })
    ).json()) as { revision: { id: string } };
    assert.equal(
      (
        await request(f.prefix + "/operations", "POST", {
          kind: "APPLY",
          expectedHash: "a".repeat(64),
          revisionId: saved.revision.id,
          confirmed: true,
        })
      ).status,
      200,
    );
    const poll = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
      })
    ).json()) as { operation: { id: string } };
    assert.equal(
      (
        await f.plugin("result", {
          sessionId: f.connect.sessionId,
          operationId: poll.operation.id,
          status: "APPLIED",
          message: "Aplicado",
          snapshot: remoteSnapshot("b".repeat(64), false),
          backupId: "before-apply",
        })
      ).status,
      200,
    );
    const state = (await (await request(f.prefix)).json()) as {
      snapshot: { hash: string };
      draft: unknown;
      history: unknown[];
    };
    assert.equal(state.snapshot.hash, "b".repeat(64));
    assert.equal(state.draft, null);
    assert.ok(state.history.length >= 5);
    assert.equal(
      (
        await request(f.prefix + "/operations", "POST", {
          kind: "RESTORE",
          expectedHash: "b".repeat(64),
          revisionId: before!._id,
          confirmed: true,
        })
      ).status,
      200,
    );
    const restore = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
      })
    ).json()) as { operation: { kind: string; documents: unknown } };
    assert.equal(restore.operation.kind, "RESTORE");
    assert.deepEqual(restore.operation.documents, remoteSnapshot().documents);
    assert.equal(
      (await request(f.prefix + "/disconnect", "POST", { confirmed: true }))
        .status,
      200,
    );
    const after = (await (await request(f.prefix)).json()) as {
      session: { state: string };
      operations: { status: string }[];
    };
    assert.equal(after.session.state, "REVOKED");
    assert.equal(after.operations[0]!.status, "UNKNOWN");
    assert.equal(
      (
        await request(f.prefix + "/operations", "POST", {
          kind: "RESTORE",
          expectedHash: "b".repeat(64),
          revisionId: before!._id,
          confirmed: true,
        })
      ).status,
      409,
    );
  });
  test("remote revocation and banned ownership stop authenticated plugin operations immediately", async () => {
    const f = await remoteConnected();
    await mongoose.connection
      .db!.collection("user")
      .updateOne(
        { _id: new mongoose.Types.ObjectId(ownerId) },
        { $set: { banned: true } },
      );
    const denied = await f.plugin("poll", {
      sessionId: f.connect.sessionId,
      operational: true,
    });
    assert.equal(denied.status, 403, await denied.clone().text());
    assert.equal(
      (await RemoteSession.findById(f.row._id).lean())!.state,
      "REVOKED",
    );
    await mongoose.connection
      .db!.collection("user")
      .updateOne(
        { _id: new mongoose.Types.ObjectId(ownerId) },
        { $set: { banned: false } },
      );
    await License.updateOne({ _id: f.key }, { $set: { "value.valid": false } });
    assert.equal(
      (
        await f.plugin("poll", {
          sessionId: f.connect.sessionId,
          operational: true,
        })
      ).status,
      403,
    );
    const read = await request(f.prefix);
    assert.equal(read.status, 200);
    assert.equal(
      ((await read.json()) as { manageable: boolean }).manageable,
      false,
    );
  });
  test("sent operations losing their lease are uncertain and stale results cannot resurrect them", async () => {
    const f = await remoteConnected();
    await request(f.prefix + "/operations", "POST", {
      kind: "SYNC",
      expectedHash: "a".repeat(64),
      confirmed: true,
    });
    const polled = (await (
      await f.plugin("poll", {
        sessionId: f.connect.sessionId,
        operational: true,
      })
    ).json()) as { operation: { id: string } };
    await RemoteSession.updateOne(
      { _id: f.row._id },
      { $set: { leaseExpiresAt: new Date(0) } },
    );
    await request(f.prefix);
    const result = await f.plugin("result", {
      sessionId: f.connect.sessionId,
      operationId: polled.operation.id,
      status: "APPLIED",
      message: "late",
      snapshot: remoteSnapshot(),
    });
    assert.equal(result.status, 409);
    assert.equal(
      (await RemoteOperation.findById(polled.operation.id).lean())!.status,
      "UNKNOWN",
    );
    assert.equal((await request(f.prefix + "/history")).status, 200);
  });
});

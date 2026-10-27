import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash, randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import {
  activationPayload,
  accountVerification,
  serverConnection,
  verifyServerProof,
} from "./activation.js";
import {
  commercialPlanSchema,
  defaultLicensingPolicy,
  effectivePrice,
  licensingPolicySchema,
} from "./licensing-config.js";
import { firstMonthCredit } from "./upgrade.js";
const plan = {
  id: "monthly" as const,
  name: "Creeper",
  description: "Plus",
  basePriceCents: 1990,
  salePriceCents: 990,
  promotionEnabled: true,
  promotionStartsAt: null,
  promotionEndsAt: null,
  billingType: "recurring" as const,
  durationUnit: "months" as const,
  duration: 1,
  serverLimit: 3,
  features: ["spawners" as const],
  permissions: ["spawnerx.plus"],
  enabled: true,
  visible: true,
  featured: false,
  order: 0,
};
describe("licensing beta.3 domain", () => {
  test("uses actual integer-cent promotions and can disable them without changing base price", () => {
    assert.equal(effectivePrice(plan).priceCents, 990);
    assert.equal(
      effectivePrice({ ...plan, promotionEnabled: false }).priceCents,
      1990,
    );
    assert.equal(effectivePrice(plan).discountPercent, 50);
    assert.equal(
      commercialPlanSchema.safeParse({ ...plan, salePriceCents: 2000 }).success,
      false,
    );
    assert.equal(
      commercialPlanSchema.safeParse({ ...plan, salePriceCents: -1 }).success,
      false,
    );
    assert.equal(
      commercialPlanSchema.safeParse({ ...plan, basePriceCents: 12.5 }).success,
      false,
    );
  });
  test("promotion scheduling uses server time and exact end boundaries", () => {
    const scheduled = {
      ...plan,
      promotionStartsAt: "2026-10-26T12:00:00Z",
      promotionEndsAt: "2026-10-27T12:00:00Z",
    };
    assert.equal(
      effectivePrice(scheduled, Date.parse(scheduled.promotionStartsAt) - 1)
        .promotion,
      false,
    );
    assert.equal(
      effectivePrice(scheduled, Date.parse(scheduled.promotionStartsAt))
        .promotion,
      true,
    );
    assert.equal(
      effectivePrice(scheduled, Date.parse(scheduled.promotionEndsAt))
        .promotion,
      false,
    );
  });
  test("first-month upgrade credits actual approved payment, including a discounted monthly payment", () => {
    const paidAt = new Date("2026-10-26T12:00:00Z");
    const input = {
      targetPriceCents: 12990,
      paidCents: 1190,
      paidAt,
      status: "approved",
      subscriptionMatches: true,
      alreadyClaimed: false,
    };
    assert.equal(
      firstMonthCredit(input, new Date("2026-10-28T12:00:00Z")).creditCents,
      1190,
    );
    assert.equal(
      12990 -
        firstMonthCredit(input, new Date("2026-10-28T12:00:00Z")).creditCents,
      11800,
    );
    assert.equal(
      firstMonthCredit({ ...input, paidCents: 900 }, paidAt).creditCents,
      900,
    );
    assert.equal(
      firstMonthCredit({ ...input, targetPriceCents: 500 }, paidAt).creditCents,
      500,
    );
    for (const change of [
      { status: "refunded" },
      { alreadyClaimed: true },
      { subscriptionMatches: false },
    ])
      assert.equal(
        firstMonthCredit({ ...input, ...change }, paidAt).creditCents,
        0,
      );
    assert.equal(
      firstMonthCredit(input, new Date("2026-11-26T12:00:00Z")).creditCents,
      0,
    );
  });
  test("signed proofs reject tampering, wrong paths, invalid keys and stale requests", () => {
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const timestamp = String(Date.now()),
      nonce = randomUUID(),
      payload = '{"serverId":"test"}',
      path = "/license/servers/poll";
    const signature = sign(
      null,
      Buffer.from(
        `POST\n${path}\n${timestamp}\n${nonce}\n${createHash("sha256").update(payload).digest("hex")}`,
      ),
      pair.privateKey,
    ).toString("base64");
    const envelope = { publicKey, timestamp, nonce, payload, signature };
    assert.match(verifyServerProof(envelope, path, 120), /^[a-f0-9]{64}$/);
    for (const change of [
      { payload: payload + " " },
      { signature: "x".repeat(88) },
      { timestamp: String(Date.now() - 400000) },
    ])
      assert.throws(() =>
        verifyServerProof({ ...envelope, ...change }, path, 120),
      );
    assert.throws(() => verifyServerProof(envelope, path + "/other", 120));
  });
  test("console, offline and proxy reports never falsely verify Microsoft identity", () => {
    assert.equal(
      accountVerification({
        executionType: "CONSOLE",
        username: null,
        uuid: null,
      }),
      "NOT_APPLICABLE",
    );
    assert.equal(
      accountVerification({
        executionType: "PLAYER",
        username: "Player",
        uuid: randomUUID(),
      }),
      "UNVERIFIED",
    );
    assert.equal(
      activationPayload.safeParse({ accountVerification: "VERIFIED" }).success,
      false,
    );
  });
  test("online status depends on authenticated communication rather than license state", () => {
    const now = Date.now();
    assert.equal(serverConnection("ACTIVE", null, 180, now), "UNKNOWN");
    assert.equal(
      serverConnection("ACTIVE", new Date(now - 179000), 180, now),
      "ONLINE",
    );
    assert.equal(
      serverConnection("ACTIVE", new Date(now - 181000), 180, now),
      "OFFLINE",
    );
    assert.equal(
      serverConnection("REVOKED", new Date(now), 180, now),
      "INACTIVE",
    );
  });
  test("unsafe policy ranges and excessive heartbeat timeouts are rejected", () => {
    assert.equal(
      licensingPolicySchema.safeParse(defaultLicensingPolicy).success,
      true,
    );
    for (const update of [
      { approvalMinutes: 0 },
      { graceSeconds: 99999 },
      { offlineAfterSeconds: 30 },
      { requireSensitiveConfirmation: false },
      { geolocationEnabled: true, collectPlayerIp: false },
    ])
      assert.equal(
        licensingPolicySchema.safeParse({
          ...defaultLicensingPolicy,
          ...update,
        }).success,
        false,
      );
  });
});

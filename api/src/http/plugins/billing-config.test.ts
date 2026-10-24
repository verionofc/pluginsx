import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { WebhookSignatureValidator } from "mercadopago";
import { PLAN_CATALOG, PLAN_PRICES, addOneCalendarMonth, safeReturnPath } from "./billing-config.js";

describe("server billing configuration", () => {
  test("keeps the approved prices in the server catalog", () => {
    assert.deepEqual(PLAN_PRICES, { monthly: 12.53, lifetime: 63.04 });
    assert.deepEqual(PLAN_CATALOG.map(({ id, amount }) => [id, amount]), [
      ["free", 0],
      ["monthly", 12.53],
      ["lifetime", 63.04],
    ]);
  });

  test("allows internal key destinations and rejects external redirects", () => {
    assert.equal(safeReturnPath("/#license"), "/#license");
    assert.equal(safeReturnPath("/account/keys/new"), "/account/keys/new");
    assert.equal(safeReturnPath("https://attacker.example"), "/");
    assert.equal(safeReturnPath("//attacker.example"), "/");
    assert.equal(safeReturnPath("/\\attacker.example"), "/");
    assert.equal(safeReturnPath("/dashboard"), "/");
  });

  test("adds a calendar month and clamps dates at month end", () => {
    assert.equal(addOneCalendarMonth(new Date("2026-01-31T12:00:00Z")).toISOString(), "2026-02-28T12:00:00.000Z");
    assert.equal(addOneCalendarMonth(new Date("2026-12-15T12:00:00Z")).toISOString(), "2027-01-15T12:00:00.000Z");
  });
});

describe("Mercado Pago webhook signature validation", () => {
  const secret = "test-secret";
  const requestId = "request-123";
  const dataId = "987654";
  const timestamp = "1700000000";
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const hash = createHmac("sha256", secret).update(manifest).digest("hex");

  test("accepts the SDK manifest signature", () => {
    assert.doesNotThrow(() => WebhookSignatureValidator.validate({
      xSignature: `ts=${timestamp},v1=${hash}`,
      xRequestId: requestId,
      dataId,
      secret,
    }));
  });

  test("rejects modified resource identifiers and invalid signatures", () => {
    assert.throws(() => WebhookSignatureValidator.validate({
      xSignature: `ts=${timestamp},v1=${hash}`,
      xRequestId: requestId,
      dataId: "other-resource",
      secret,
    }));
    assert.throws(() => WebhookSignatureValidator.validate({
      xSignature: "ts=1700000000,v1=bad",
      xRequestId: requestId,
      dataId,
      secret,
    }));
  });

  test("rejects stale signatures when a tolerance window is set", () => {
    assert.throws(() => WebhookSignatureValidator.validate({
      xSignature: `ts=${timestamp},v1=${hash}`,
      xRequestId: requestId,
      dataId,
      secret,
      toleranceSeconds: 300,
      now: () => 1_800_000_000_000,
    }));
  });
});

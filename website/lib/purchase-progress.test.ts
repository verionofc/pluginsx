import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  discoverPurchase,
  markArrivalSeen,
  type PurchaseProgressData,
  purchaseIsReady,
  purchasePhase,
  rememberPurchase,
  restoredPurchase,
  safeCheckoutUrl,
} from "./purchase-progress";

const reference = randomUUID();
const paid: PurchaseProgressData = {
  reference,
  plan: "lifetime",
  status: "approved",
  paymentStatus: "approved",
  fulfillmentStatus: "processing",
};
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("a provider approval never announces a license until its independent key exists", () => {
  assert.equal(purchaseIsReady(paid), false);
  assert.equal(purchasePhase(paid), "processing");
  assert.equal(purchaseIsReady({ ...paid, fulfillmentStatus: "ready" }), false);
  assert.equal(
    purchaseIsReady({
      ...paid,
      paymentStatus: "pending",
      fulfillmentStatus: "ready",
      licenseRef: "a".repeat(64),
    }),
    false,
  );
  assert.equal(
    purchaseIsReady({
      ...paid,
      fulfillmentStatus: "ready",
      licenseRef: "a".repeat(64),
    }),
    true,
  );
  assert.equal(
    purchaseIsReady({
      ...paid,
      fulfillmentStatus: "ready",
      licenseRef: "a".repeat(64),
      upgradeCreditReversed: true,
    }),
    false,
  );
  assert.equal(
    purchaseIsReady({
      ...paid,
      plan: "server_slots",
      fulfillmentStatus: "ready",
    }),
    true,
  );
});
test("reversed payments and review states cannot produce an acquisition celebration", () => {
  assert.equal(
    purchasePhase({
      ...paid,
      paymentStatus: "charged_back",
      fulfillmentStatus: "ready",
      licenseRef: "a".repeat(64),
    }),
    "revoked",
  );
  assert.equal(
    purchasePhase({ ...paid, upgradeCreditReversed: true }),
    "review",
  );
});
test("pending references survive returning without a URL and stay scoped to the account", () => {
  const store = memory(),
    now = Date.now();
  rememberPurchase(store, "account-a", reference, now);
  assert.equal(restoredPurchase(store, "account-a", now + 86400000), reference);
  assert.equal(restoredPurchase(store, "account-b", now + 86400000), null);
  assert.equal(restoredPurchase(store, "account-a", now + 8 * 86400000), null);
});
test("discovery ignores old approved history and deduplicates recent arrivals", () => {
  const store = memory(),
    now = Date.now();
  const value = {
    ...paid,
    fulfillmentStatus: "ready",
    licenseRef: "a".repeat(64),
    createdAt: new Date(now - 1000).toISOString(),
  };
  assert.equal(discoverPurchase(value, store, "a", now), reference);
  markArrivalSeen(store, "a", reference);
  assert.equal(discoverPurchase(value, store, "a", now), null);
  assert.equal(
    discoverPurchase(
      { ...value, createdAt: new Date(now - 86400000).toISOString() },
      store,
      "b",
      now,
    ),
    null,
  );
  assert.equal(
    discoverPurchase(
      {
        ...value,
        createdAt: new Date(now - 86400000).toISOString(),
        licenseIssuedAt: new Date(now - 1000).toISOString(),
      },
      store,
      "repaired-account",
      now,
    ),
    reference,
  );
  assert.equal(
    discoverPurchase(
      { ...value, status: "pending", fulfillmentStatus: "pending" },
      store,
      "a",
      now,
    ),
    reference,
  );
});
test("checkout navigation rejects credentials and unsafe schemes while supporting same-origin covered upgrades", () => {
  assert.equal(
    safeCheckoutUrl("javascript:alert(1)", "http://localhost:3401"),
    null,
  );
  assert.equal(
    safeCheckoutUrl(
      "https://user:secret@example.test/checkout",
      "http://localhost:3401",
    ),
    null,
  );
  assert.equal(
    safeCheckoutUrl("http://external.test/checkout", "http://localhost:3401"),
    null,
  );
  assert.equal(
    safeCheckoutUrl(`/cart?purchase=${reference}`, "http://localhost:3401"),
    `http://localhost:3401/cart?purchase=${reference}`,
  );
  assert.equal(
    safeCheckoutUrl(
      "https://www.mercadopago.com.br/checkout/test",
      "http://localhost:3401",
    ),
    "https://www.mercadopago.com.br/checkout/test",
  );
});

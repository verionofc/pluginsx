import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { claimPurchaseReceipt } from "./purchase-receipts";

test("returning to the same paid receipt cannot remove newly added cart items", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const reference = randomUUID();
  assert.equal(claimPurchaseReceipt(reference, new Set(), storage), true);
  assert.equal(claimPurchaseReceipt(reference, new Set(), storage), false);
  assert.equal(claimPurchaseReceipt(randomUUID(), new Set(), storage), true);
});

test("blocked storage still deduplicates repeated completion in the mounted cart", () => {
  const remembered = new Set<string>(),
    reference = randomUUID();
  const storage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(claimPurchaseReceipt(reference, remembered, storage), true);
  assert.equal(claimPurchaseReceipt(reference, remembered, storage), false);
});

test("malformed persisted receipts never block a valid payment or accept an invalid reference", () => {
  const storage = { getItem: () => "{broken", setItem: () => {} };
  assert.equal(claimPurchaseReceipt(randomUUID(), new Set(), storage), true);
  assert.equal(
    claimPurchaseReceipt("javascript:alert(1)", new Set(), storage),
    false,
  );
});

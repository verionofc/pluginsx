import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getLicenseCapacity } from "./license-capacity";

describe("license capacity presentation", () => {
  test("unlimited capacity has no fabricated maximum, cells or full usage meter", () => {
    const view = getLicenseCapacity(1, null, true);
    assert.equal(view.mode, "unlimited");
    assert.equal(view.used, 1);
    assert.equal(view.cells, 0);
    assert.equal(view.available, null);
    assert.equal(view.percent, 0);
  });
  test("small finite plans preserve exact occupied slots, including twelve slots", () => {
    const view = getLicenseCapacity(9, 12);
    assert.equal(view.mode, "inventory");
    assert.equal(view.cells, 12);
    assert.equal(view.filled, 9);
    assert.equal(view.available, 3);
  });
  test("large limits use a constant-size overview with the actual usage ratio", () => {
    for (const limit of [13, 250, 1000000, Number.MAX_SAFE_INTEGER]) {
      const view = getLicenseCapacity(1, limit);
      assert.equal(view.mode, "network");
      assert.equal(view.cells, 0);
      assert.ok(Math.abs(view.percent - 100 / limit) <= (100 / limit) * 1e-12);
      assert.equal(view.available, limit - 1);
    }
  });
  test("zero, missing and invalid limits never produce invalid CSS counts", () => {
    assert.equal(getLicenseCapacity(0, 0).mode, "empty");
    for (const limit of [null, Number.NaN, Number.POSITIVE_INFINITY])
      assert.equal(getLicenseCapacity(1, limit).mode, "unknown");
    assert.equal(getLicenseCapacity(-5, 3).used, 0);
  });
  test("over-limit records retain their real counts while clamping the graph", () => {
    const view = getLicenseCapacity(20, 13);
    assert.equal(view.used, 20);
    assert.equal(view.limit, 13);
    assert.equal(view.percent, 100);
    assert.equal(view.available, 0);
    assert.equal(view.excess, 7);
  });
});

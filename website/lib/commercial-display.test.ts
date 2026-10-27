import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBillingInterval } from "./commercial-display";

test("billing copy follows the interval accepted by the commercial catalogue", () => {
  assert.equal(
    formatBillingInterval({ duration: 1, durationUnit: "months" }),
    "1 mês",
  );
  assert.equal(
    formatBillingInterval({ duration: 3, durationUnit: "months" }),
    "3 meses",
  );
  assert.equal(
    formatBillingInterval({ duration: 7, durationUnit: "days" }),
    "7 dias",
  );
  assert.equal(
    formatBillingInterval({ duration: 1, durationUnit: "days" }),
    "1 dia",
  );
});

test("unknown or invalid contract durations never advertise a guessed monthly period", () => {
  for (const offer of [
    {},
    { duration: 0, durationUnit: "months" },
    { duration: 1.5, durationUnit: "days" },
    { duration: 1, durationUnit: "lifetime" },
  ])
    assert.equal(formatBillingInterval(offer), null);
});

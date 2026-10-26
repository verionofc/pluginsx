import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMonthlyBillingReader, type MonthlyAccess } from "./monthly-billing.js";

const now = Date.parse("2026-10-26T12:00:00Z");
const due = "2026-11-04T12:00:00Z";
function fixture(overrides: Partial<MonthlyAccess> = {}, providerDate: string | null = due) {
  const access: MonthlyAccess = { id: "access", status: "active", mercadoPagoSubscriptionId: "sub", billingScheduleSubscriptionId: "sub", expiresAt: new Date("2026-11-07T12:00:00Z"), ...overrides };
  let reads = 0, writes = 0;
  const services = { configured: true, now: () => now, findAccess: async () => access, readSubscription: async (_userId: string, id: string) => { assert.equal(id, "sub"); reads++; return { nextPaymentDate: providerDate, authorized: true }; }, storeSchedule: async () => { writes++; return true; } };
  return { access, services, counts: () => ({ reads, writes }) };
}
describe("monthly invoice schedule", () => {
  test("uses the provider date, independently of the paid access expiry", async () => {
    const { services, access, counts } = fixture(); const result = await createMonthlyBillingReader(services)("owner");
    assert.equal(result?.nextBillingAt?.toISOString(), new Date(due).toISOString()); assert.equal(result?.currentPeriodEndsAt, access.expiresAt); assert.equal(result?.autoRenew, true); assert.deepEqual(counts(), { reads: 1, writes: 1 });
  });
  test("does not present a next invoice for canceled, owner-granted or non-recurring access", async () => {
    for (const override of [{ cancelAtPeriodEnd: true }, { status: "canceled" }, { status: "revoked" }, { grantSource: "owner" }, { mercadoPagoSubscriptionId: "" }]) {
      const { services, counts } = fixture(override); const result = await createMonthlyBillingReader(services)("owner");
      assert.equal(result?.nextBillingAt, null); assert.equal(result?.autoRenew, false); assert.deepEqual(counts(), { reads: 0, writes: 0 });
    }
  });
  test("never substitutes paid access expiry when the provider date is missing or invalid", async () => {
    for (const date of [null, "not-a-date"]) { const { services } = fixture({}, date); assert.equal((await createMonthlyBillingReader(services)("owner"))?.nextBillingAt, null); }
  });
  test("uses verified cached dates during the cache window and during provider failure", async () => {
    const cached = new Date(due);
    const fresh = fixture({ nextBillingAt: cached, billingScheduleCheckedAt: new Date(now - 1000) });
    assert.equal((await createMonthlyBillingReader(fresh.services)("owner"))?.nextBillingAt, cached); assert.equal(fresh.counts().reads, 0);
    const failed = fixture({ nextBillingAt: cached }); failed.services.readSubscription = async () => { throw new Error("Provider unavailable"); };
    assert.equal((await createMonthlyBillingReader(failed.services)("owner"))?.nextBillingAt, cached);
  });
  test("does not reuse the previous subscription's cached billing date", async () => {
    const { services } = fixture({ billingScheduleSubscriptionId: "previous-sub", nextBillingAt: new Date(due), billingScheduleCheckedAt: new Date(now) });
    services.readSubscription = async () => { throw new Error("Provider unavailable"); };
    assert.equal((await createMonthlyBillingReader(services)("owner"))?.nextBillingAt, null);
  });
  test("coalesces simultaneous reads and respects a cancellation during lookup", async () => {
    const { services, counts, access } = fixture(); const read = createMonthlyBillingReader(services);
    await Promise.all([read("owner"), read("owner")]); assert.equal(counts().reads, 1);
    services.storeSchedule = async () => { access.cancelAtPeriodEnd = true; return false; };
    const result = await read("owner"); assert.equal(result?.autoRenew, false); assert.equal(result?.nextBillingAt, null);
  });
});

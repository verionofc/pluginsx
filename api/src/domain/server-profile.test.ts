import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { serverProfileUpdate, updateAuthorizedServerProfile, type ServerProfileUpdate } from "./server-profile.js";

describe("server profile validation", () => {
  test("normalizes labels and de-duplicates tags without discarding partial updates", () => {
    assert.deepEqual(serverProfileUpdate.parse({ displayName: "  Lobby  ", tags: [" produção ", "Produção", "Survival"], icon: "diamond", pinned: true }), { displayName: "Lobby", tags: ["produção", "Survival"], icon: "diamond", pinned: true });
    assert.deepEqual(serverProfileUpdate.parse({ pinned: false }), { pinned: false });
    assert.deepEqual(serverProfileUpdate.parse({ displayName: "", tags: [] }), { displayName: "", tags: [] });
  });
  test("rejects authorization changes, unsupported icons, invalid limits and empty mutations", () => {
    for (const body of [{}, { state: "ACTIVE" }, { ownerId: "other" }, { licenseId: "other" }, { name: "plugin-name" }, { icon: "https://example.test/image.png" }, { displayName: "x".repeat(101) }, { tags: ["x".repeat(25)] }, { tags: ["1", "2", "3", "4", "5", "6"] }, { displayName: "line\nbreak" }, { tags: ["<tag>"] }]) assert.equal(serverProfileUpdate.safeParse(body).success, false, JSON.stringify(body));
  });
});

function fixture({ owned = true, trial = false, state = "ACTIVE", changed = false } = {}) {
  const writes: ServerProfileUpdate[] = [];
  const services = {
    findServer: async () => ({ _id: "server-id", licenseId: "license-id", state }),
    ownsLicense: async () => owned,
    ownsLiveTrial: async () => trial,
    updateActiveServer: async (_id: string, licenseId: string, patch: ServerProfileUpdate) => { assert.equal(licenseId, "license-id"); writes.push(patch); return changed ? null : { id: "server-id", name: "Original", tags: ["old"], ...patch }; },
  };
  return { services, writes };
}
describe("owned active server profile mutations", () => {
  test("changes only metadata for the owner and accepts a valid trial owner", async () => {
    for (const options of [{}, { owned: false, trial: true }]) {
      const { services, writes } = fixture(options);
      const result = await updateAuthorizedServerProfile("owner", "server-id", { pinned: true }, services);
      assert.equal(result.ok, true); assert.equal(writes.length, 1);
      if (result.ok) { assert.equal(result.server.name, "Original"); assert.deepEqual(result.server.tags, ["old"]); }
    }
  });
  test("does not expose or update another account's server or an expired trial", async () => {
    const { services, writes } = fixture({ owned: false });
    assert.deepEqual(await updateAuthorizedServerProfile("other", "server-id", { pinned: true }, services), { ok: false, status: 404, message: "Servidor não encontrado." });
    assert.equal(writes.length, 0);
  });
  test("denies pending, revoked and inactive records before writing", async () => {
    for (const state of ["PENDING", "REVOKED", "INACTIVE", "EXPIRED"]) {
      const { services, writes } = fixture({ state });
      const result = await updateAuthorizedServerProfile("owner", "server-id", { icon: "chest" }, services);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 409); assert.equal(writes.length, 0);
    }
  });
  test("reports a concurrent revocation instead of claiming that the update succeeded", async () => {
    const { services } = fixture({ changed: true });
    const result = await updateAuthorizedServerProfile("owner", "server-id", { pinned: true }, services);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 409);
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getMobHead, mobHeadCatalog, mobHeadUrl } from "./mob-heads";

describe("Mob Heads flat catalog", () => {
  test("uses only verified MC-Heads identifiers for remote textures", () => {
    const verified = mobHeadCatalog.filter((entry) => entry.verified);

    assert.ok(verified.length > 0);
    assert.equal(
      verified.every((entry) => entry.source?.startsWith("MHF_")),
      true,
    );
    assert.match(mobHeadUrl("minecraft:magma_cube", 64) ?? "", /MHF_LavaSlime/);
    assert.match(
      mobHeadUrl("minecraft:wither_skeleton", 64) ?? "",
      /MHF_WSkeleton/,
    );
  });

  test("never points an unverified mob at a Steve fallback texture", () => {
    const entry = getMobHead("rabbit");

    assert.equal(entry?.verified, false);
    assert.equal(mobHeadUrl("rabbit"), null);
  });
});

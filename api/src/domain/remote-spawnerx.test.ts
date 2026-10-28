import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateDocuments,
  validateSnapshot,
  validateValue,
  type RemoteNode,
} from "./remote-spawnerx.js";

const object = (properties: Record<string, RemoteNode>): RemoteNode => ({
  type: "object",
  properties,
  additionalProperties: false,
});
function fixture() {
  const config = object({
    locale: { type: "string", enum: ["pt_BR", "en_US"], default: "pt_BR" },
    spawner: object({
      "max-stack-size": {
        type: "number",
        minimum: 1,
        maximum: 128,
        integer: true,
        default: 64,
      },
    }),
  });
  const shop = object({
    spawner: object({
      shop: object({
        enabled: { type: "boolean", default: true },
        currency: { type: "string", enum: ["XP"], default: "XP" },
      }),
    }),
  });
  const defaults = {
    config: { locale: "pt_BR", spawner: { "max-stack-size": 64 } },
    shop: { spawner: { shop: { enabled: true, currency: "XP" } } },
  };
  return {
    configHash: "a".repeat(64),
    documents: structuredClone(defaults),
    capabilities: {
      schemaVersion: 1,
      pluginVersion: "1.0.0-beta.4",
      operations: ["APPLY", "PLUGIN_RELOAD", "SYNC", "RESTORE"],
      schema: { config, shop },
      defaults,
    },
  };
}
test("remote schemas accept current typed documents and enforce advertised server limits", () => {
  const snapshot = validateSnapshot(fixture());
  const docs = structuredClone(snapshot.documents);
  (docs.config.spawner as Record<string, unknown>)["max-stack-size"] = 129;
  assert.throws(
    () => validateDocuments(docs, snapshot.capabilities),
    /limites/,
  );
  (docs.config.spawner as Record<string, unknown>)["max-stack-size"] = 2.5;
  assert.throws(
    () => validateDocuments(docs, snapshot.capabilities),
    /limites/,
  );
});
test("fixed remote options cannot be deleted and unknown or inherited properties never authorize values", () => {
  const snapshot = validateSnapshot(fixture());
  assert.throws(
    () =>
      validateDocuments(
        { config: {}, shop: snapshot.documents.shop },
        snapshot.capabilities,
      ),
    /obrigatória/,
  );
  const docs = structuredClone(snapshot.documents);
  docs.config.toString = "forged inherited option" as unknown as () => string;
  assert.throws(
    () => validateDocuments(docs, snapshot.capabilities),
    /não suportada/,
  );
  assert.throws(
    () =>
      validateValue(
        {},
        { type: "unsupported" } as unknown as RemoteNode,
        "config",
      ),
    /schema incompatível/,
  );
});
test("license credentials and schema metadata cannot be exported through remote snapshots", () => {
  const snap = fixture();
  (snap.documents.config as Record<string, unknown>).license = {
    key: "never-export",
  };
  assert.throws(() => validateSnapshot(snap), /interna|não suportada/);
  const metadata = fixture();
  (
    metadata.capabilities.schema.config as unknown as Record<string, unknown>
  ).password = "never-export";
  assert.throws(() => validateSnapshot(metadata), /metadado/);
  const defaults = fixture();
  defaults.capabilities.schema.config.default = {
    ...defaults.documents.config,
    secret: "hidden-value",
  };
  assert.throws(() => validateSnapshot(defaults), /interna|não suportada/);
});
test("real secret rarity ID is allowed without allowing secret credentials elsewhere", () => {
  const snap = fixture(),
    rarity = object({
      "display-name": { type: "string", default: "Secreto" },
      color: { type: "string", default: "&c" },
      tier: {
        type: "number",
        integer: true,
        minimum: 1,
        maximum: 100,
        default: 6,
      },
    });
  const map: RemoteNode = {
    type: "object",
    additionalProperties: rarity,
    default: { secret: { "display-name": "Secreto", color: "&c", tier: 6 } },
  };
  snap.capabilities.schema.config.properties!["rarity-settings"] = map;
  (snap.documents.config as Record<string, unknown>)["rarity-settings"] =
    map.default;
  (snap.capabilities.defaults.config as Record<string, unknown>)[
    "rarity-settings"
  ] = map.default;
  assert.ok(validateSnapshot(snap));
  assert.throws(
    () =>
      validateValue(
        { secret: "hidden" },
        { type: "object", additionalProperties: { type: "string" } },
        "config.trade",
      ),
    /interna/,
  );
});
test("dynamic Minecraft entries obey actual installation options and object-key boundaries", () => {
  const node: RemoteNode = {
    type: "object",
    keyOptions: ["COW", "PIG"],
    propertyPattern: "^[A-Za-z0-9_-]{1,64}$",
    additionalProperties: object({
      price: {
        type: "number",
        integer: true,
        minimum: 0,
        maximum: 2147483647,
        default: 200,
      },
    }),
  };
  assert.doesNotThrow(() =>
    validateValue({ COW: { price: 0 } }, node, "shop.items"),
  );
  assert.throws(
    () => validateValue({ DRAGON: { price: 200 } }, node, "shop.items"),
    /tipo não suportado/,
  );
  assert.throws(
    () =>
      validateValue(
        JSON.parse('{"__proto__":{"price":200}}'),
        node,
        "shop.items",
      ),
    /interna|inválida/,
  );
  assert.throws(
    () => validateValue({ "COW.price": 12 }, node, "shop.items"),
    /interna|inválida/,
  );
});
test("remote schemas reject unsafe regular expressions, unexpected operation kinds and giant values", () => {
  const snap = fixture();
  snap.capabilities.schema.config.propertyPattern = "(a+)+$";
  assert.throws(() => validateSnapshot(snap), /padrão de chave/);
  const command = fixture();
  command.capabilities.operations.push("CONSOLE_EXEC");
  assert.throws(() => validateSnapshot(command), /operações incompatíveis/);
  assert.throws(
    () => validateValue("x".repeat(16385), { type: "string" }, "config.text"),
    /texto/,
  );
  assert.throws(
    () =>
      validateValue(
        Array.from({ length: 301 }, () => "x"),
        { type: "array", items: { type: "string" } },
        "config.list",
      ),
    /lista/,
  );
});

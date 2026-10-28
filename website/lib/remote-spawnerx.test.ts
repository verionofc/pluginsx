import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type ConfigSchema,
  configChanges,
  nodeDefault,
  operationPending,
  parseRemoteYaml,
  type RemoteCapabilities,
  type RemoteOperation,
  validateConfig,
  validateDocuments,
  validDynamicKey,
} from "./remote-spawnerx";

const schema: ConfigSchema = {
  type: "object",
  title: "Configuração",
  description: "Propriedades públicas",
  properties: {
    enabled: {
      type: "boolean",
      title: "Ativado",
      description: "Estado",
      default: true,
    },
    count: {
      type: "number",
      title: "Quantidade",
      description: "Limite inteiro",
      default: 3,
      minimum: 1,
      maximum: 64,
      integer: true,
    },
    currency: {
      type: "string",
      title: "Moeda",
      description: "Moeda suportada",
      default: "XP",
      enum: ["XP"],
    },
  },
  additionalProperties: false,
};
describe("SpawnerX remote configuration safety", () => {
  test("advanced YAML validates actual types, allowed values and numeric boundaries before updating the form", async () => {
    assert.deepEqual(
      await parseRemoteYaml("enabled: false\ncount: 8\ncurrency: XP\n", schema),
      { enabled: false, count: 8, currency: "XP" },
    );
    await assert.rejects(
      parseRemoteYaml("enabled: true\ncount: 1.5\ncurrency: XP", schema),
      /inteiro/,
    );
    await assert.rejects(
      parseRemoteYaml("enabled: true\ncount: 65\ncurrency: XP", schema),
      /máximo/,
    );
    await assert.rejects(
      parseRemoteYaml("enabled: true\ncount: 3\ncurrency: MONEY", schema),
      /opção suportada/,
    );
  });
  test("missing fixed fields, unknown inherited property names and license credentials never pass validation", async () => {
    await assert.rejects(
      parseRemoteYaml("enabled: true\ncount: 3", schema),
      /obrigatória/,
    );
    await assert.rejects(
      parseRemoteYaml(
        "enabled: true\ncount: 3\ncurrency: XP\ntoString: true",
        schema,
      ),
      /não suportada/,
    );
    await assert.rejects(
      parseRemoteYaml(
        "enabled: true\ncount: 3\ncurrency: XP\nlicense:\n  key: secret",
        schema,
      ),
      /interna/,
    );
    assert.equal(
      validateConfig("text", {
        type: "invented",
        title: "Invalid",
        description: "",
      } as unknown as ConfigSchema).length,
      1,
    );
  });
  test("duplicate YAML properties, aliases and prototype pollution keys are rejected", async () => {
    await assert.rejects(
      parseRemoteYaml(
        "enabled: true\nenabled: false\ncount: 3\ncurrency: XP",
        schema,
      ),
    );
    await assert.rejects(
      parseRemoteYaml("enabled: &a true\ncount: 3\ncurrency: *a", schema),
    );
    await assert.rejects(
      parseRemoteYaml(
        "enabled: true\ncount: 3\ncurrency: XP\n__proto__: {polluted: true}",
        schema,
      ),
    );
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  });
  test("dynamic maps accept only the installation's supported entity identifiers", () => {
    const dynamic: ConfigSchema = {
      type: "object",
      title: "Entidades",
      description: "Versão instalada",
      keyOptions: ["COW", "ZOMBIE"],
      additionalProperties: schema,
    };
    const item = { enabled: true, count: 2, currency: "XP" };
    assert.deepEqual(validateConfig({ COW: item }, dynamic), []);
    assert.match(
      validateConfig({ INVENTED_ENTITY: item }, dynamic)[0],
      /identificador não suportado/,
    );
    assert.equal(validDynamicKey("../../config"), false);
    assert.equal(validDynamicKey("constructor"), false);
    assert.equal(validDynamicKey("Farm_02"), true);
  });
  test("default values are cloned so editing an added item cannot corrupt the version's template", () => {
    const object: ConfigSchema = {
      type: "object",
      title: "Item",
      description: "Template",
      default: { lore: ["Original"], price: 20 },
    };
    const first = nodeDefault(object) as { lore: string[]; price: number };
    first.lore[0] = "Changed";
    first.price = 100;
    assert.deepEqual(nodeDefault(object), { lore: ["Original"], price: 20 });
  });
  test("the preview reports additions, removals and edits with full property paths", () => {
    const changes = configChanges(
      { shop: { COW: { price: 20 }, ZOMBIE: { price: 30 } } },
      { shop: { COW: { price: 40 }, BLAZE: { price: 60 } } },
    );
    assert.deepEqual(changes, [
      { path: "shop.COW.price", before: 20, after: 40 },
      { path: "shop.ZOMBIE", before: { price: 30 }, after: undefined },
      { path: "shop.BLAZE", before: undefined, after: { price: 60 } },
    ]);
  });
  test("an unconfirmed delivery is terminal uncertainty rather than a success or a command waiting to replay", () => {
    const operation = {
      id: "fixture",
      kind: "APPLY",
      status: "UNKNOWN",
      createdAt: new Date().toISOString(),
    } satisfies RemoteOperation;
    assert.equal(operationPending(operation), false);
    assert.equal(operationPending({ ...operation, status: "SENT" }), true);
    assert.equal(operationPending({ ...operation, status: "APPLIED" }), false);
  });
  test("spawn delay validation catches inverted bounds before saving either document", () => {
    const number: ConfigSchema = {
      type: "number",
      title: "Delay",
      description: "Ticks",
      minimum: 1,
      integer: true,
    };
    const object = (
      properties: Record<string, ConfigSchema>,
    ): ConfigSchema => ({
      type: "object",
      title: "Grupo",
      description: "",
      properties,
      additionalProperties: false,
    });
    const capabilities = {
      schema: {
        config: object({
          spawner: object({
            "base-stats": object({
              "min-spawn-delay": number,
              "max-spawn-delay": number,
            }),
          }),
        }),
        shop: object({}),
      },
    } as RemoteCapabilities;
    assert.match(
      validateDocuments(
        {
          config: {
            spawner: {
              "base-stats": { "min-spawn-delay": 600, "max-spawn-delay": 500 },
            },
          },
          shop: {},
        },
        capabilities,
      )[0],
      /mínimo não pode superar/,
    );
  });
});

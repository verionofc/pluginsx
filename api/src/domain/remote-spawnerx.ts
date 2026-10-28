import { z } from "zod";
import { ActivationError, actorSchema, signedEnvelope } from "./activation.js";

export const remoteStates = [
  "PENDING",
  "WEB_APPROVED",
  "CONNECTED",
  "REJECTED",
  "EXPIRED",
  "DISCONNECTED",
  "REVOKED",
  "ERROR",
] as const;
export const operationKinds = [
  "APPLY",
  "PLUGIN_RELOAD",
  "SYNC",
  "RESTORE",
] as const;
export const operationStatuses = [
  "QUEUED",
  "SENT",
  "APPLIED",
  "AWAITING_RELOAD",
  "RESTART_REQUIRED",
  "FAILED",
  "CONFLICT",
  "EXPIRED",
  "UNKNOWN",
  "CANCELLED",
] as const;
export type RemoteState = (typeof remoteStates)[number];
export type OperationKind = (typeof operationKinds)[number];
export type OperationStatus = (typeof operationStatuses)[number];
export type Documents = {
  config: Record<string, unknown>;
  shop: Record<string, unknown>;
};
export type RemoteNode = {
  type: "object" | "array" | "string" | "number" | "boolean";
  title?: string;
  description?: string;
  default?: unknown;
  properties?: Record<string, RemoteNode>;
  additionalProperties?: RemoteNode | false;
  items?: RemoteNode;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  reload?: "RELOAD" | "RESTART";
  requires?: "RELOAD" | "RESTART";
  propertyPattern?: string;
  keyOptions?: string[];
  format?: string;
  maxItems?: number;
  maxLength?: number;
};
export type Capabilities = {
  schemaVersion: 1;
  pluginVersion: string;
  operations: OperationKind[];
  schema: { config: RemoteNode; shop: RemoteNode };
  defaults: Documents;
};
export type Snapshot = {
  configHash: string;
  documents: Documents;
  capabilities: Capabilities;
  capturedAt?: string;
};
export const remoteEnvelope = signedEnvelope.extend({
  payload: z.string().min(2).max(262144),
});
export const pluginBase = z.object({
  activationId: z.string().uuid(),
  serverId: z.string().uuid(),
  requestId: z.string().uuid(),
});
export const connectPayload = pluginBase
  .extend({ actor: actorSchema, snapshot: z.unknown() })
  .strict();
export const pollPayload = pluginBase
  .extend({
    sessionId: z.string().uuid(),
    operational: z.literal(true),
    uptimeSeconds: z.number().int().min(0).max(315360000).optional(),
    snapshot: z.unknown().optional(),
  })
  .strict();
export const confirmPayload = pluginBase
  .extend({
    sessionId: z.string().uuid(),
    playerUuid: z.string().uuid(),
    confirmationToken: z.string().min(40).max(100),
    decision: z.enum(["confirm", "reject"]),
    snapshot: z.unknown().optional(),
  })
  .strict();
export const resultPayload = pluginBase
  .extend({
    sessionId: z.string().uuid(),
    operationId: z.string().uuid(),
    status: z.enum([
      "APPLIED",
      "AWAITING_RELOAD",
      "RESTART_REQUIRED",
      "FAILED",
      "CONFLICT",
    ]),
    message: z.string().max(1000),
    snapshot: z.unknown().optional(),
    backupId: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,120}$/)
      .optional(),
  })
  .strict();
export const disconnectPayload = pluginBase
  .extend({ sessionId: z.string().uuid() })
  .strict();
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const documentSchema = z
  .object({
    config: z.record(z.string(), z.unknown()),
    shop: z.record(z.string(), z.unknown()),
  })
  .strict();
export const draftPayload = z
  .object({
    expectedRevision: z.string().uuid().nullable(),
    expectedHash: hashSchema,
    documents: documentSchema,
  })
  .strict();
export const operationPayload = z
  .object({
    kind: z.enum(operationKinds),
    expectedHash: hashSchema,
    revisionId: z.string().uuid().optional(),
    confirmed: z.literal(true),
  })
  .strict();
export const authorizePayload = z
  .object({
    requestId: z.string().uuid(),
    token: z.string().min(40).max(100),
    decision: z.enum(["approve", "reject"]),
  })
  .strict();
const validKey = /^[A-Za-z0-9_-]{1,64}$/;
const deniedKey =
  /^(?:__proto__|prototype|constructor|license|credentials?|password|private[-_]?key|access[-_]?token|refresh[-_]?token|session[-_]?token|secret)$/i;
const forbiddenKey = (key: string, path: string) =>
  deniedKey.test(key) &&
  !(
    key === "secret" &&
    /^config(?:\.default)?\.rarity-settings(?:\.default)?$/.test(path)
  );
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
function invalid(path: string, reason: string): never {
  throw new ActivationError(
    "INVALID_CONFIGURATION",
    `${path || "configuração"}: ${reason}`,
    400,
  );
}

function checkNode(
  node: unknown,
  path: string,
  budget: { count: number },
  depth = 0,
): asserts node is RemoteNode {
  if (
    !isRecord(node) ||
    !["object", "array", "string", "number", "boolean"].includes(
      String(node.type),
    ) ||
    depth > 14 ||
    ++budget.count > 2500
  )
    invalid(path, "schema incompatível ou extenso demais.");
  const allowed = new Set([
    "type",
    "title",
    "description",
    "default",
    "properties",
    "additionalProperties",
    "items",
    "enum",
    "minimum",
    "maximum",
    "integer",
    "reload",
    "requires",
    "propertyPattern",
    "keyOptions",
    "format",
    "maxItems",
    "maxLength",
  ]);
  if (Object.keys(node).some((key) => !allowed.has(key)))
    invalid(path, "metadado de schema não suportado.");
  for (const field of ["title", "description"])
    if (
      node[field] !== undefined &&
      (typeof node[field] !== "string" || (node[field] as string).length > 2000)
    )
      invalid(path, "metadados inválidos.");
  if (node.type === "object") {
    if (node.properties !== undefined && !isRecord(node.properties))
      invalid(path, "propriedades inválidas.");
    for (const [key, child] of Object.entries(
      (node.properties ?? {}) as Record<string, unknown>,
    )) {
      if (!validKey.test(key) || forbiddenKey(key, path))
        invalid(path, "propriedade interna ou insegura.");
      checkNode(child, `${path}.${key}`, budget, depth + 1);
    }
    if (
      node.additionalProperties !== undefined &&
      node.additionalProperties !== false
    )
      checkNode(node.additionalProperties, `${path}.*`, budget, depth + 1);
  }
  if (node.type === "array")
    checkNode(node.items, `${path}[]`, budget, depth + 1);
  if (
    node.enum !== undefined &&
    (!Array.isArray(node.enum) ||
      node.enum.length > 1000 ||
      node.enum.some((v) => typeof v !== "string" || v.length > 256))
  )
    invalid(path, "enum inválido.");
  for (const bound of ["minimum", "maximum"])
    if (
      node[bound] !== undefined &&
      (typeof node[bound] !== "number" || !Number.isFinite(node[bound]))
    )
      invalid(path, "limite inválido.");
  if (node.integer !== undefined && typeof node.integer !== "boolean")
    invalid(path, "limite inteiro inválido.");
  if (
    node.reload !== undefined &&
    !["RELOAD", "RESTART"].includes(String(node.reload))
  )
    invalid(path, "modo de aplicação inválido.");
  if (
    node.requires !== undefined &&
    !["RELOAD", "RESTART"].includes(String(node.requires))
  )
    invalid(path, "modo de aplicação inválido.");
  if (node.format !== undefined && node.format !== "minecraft-material")
    invalid(path, "formato não suportado.");
  if (
    node.propertyPattern !== undefined &&
    node.propertyPattern !== "^[A-Za-z0-9_-]{1,64}$"
  )
    invalid(path, "padrão de chave incompatível.");
  if (
    node.keyOptions !== undefined &&
    (!Array.isArray(node.keyOptions) ||
      node.keyOptions.length > 2000 ||
      node.keyOptions.some((v) => typeof v !== "string" || !validKey.test(v)))
  )
    invalid(path, "chaves permitidas inválidas.");
  if (
    node.maxItems !== undefined &&
    (!Number.isSafeInteger(node.maxItems) ||
      Number(node.maxItems) < 0 ||
      Number(node.maxItems) > 300)
  )
    invalid(path, "tamanho de lista inválido.");
  if (
    node.maxLength !== undefined &&
    (!Number.isSafeInteger(node.maxLength) ||
      Number(node.maxLength) < 0 ||
      Number(node.maxLength) > 16384)
  )
    invalid(path, "tamanho de texto inválido.");
  if (Object.hasOwn(node, "default"))
    validateValue(
      node.default,
      node as unknown as RemoteNode,
      `${path}.default`,
    );
}
export function validateValue(
  value: unknown,
  node: RemoteNode,
  path: string,
  depth = 0,
): void {
  if (depth > 14) invalid(path, "estrutura profunda demais.");
  switch (node.type) {
    case "object": {
      if (!isRecord(value) || Object.keys(value).length > 500)
        invalid(path, "objeto inválido ou extenso demais.");
      for (const key of Object.keys(node.properties ?? {}))
        if (!Object.hasOwn(value, key))
          invalid(
            `${path}.${key}`,
            "propriedade obrigatória ausente. Use o valor padrão para restaurá-la.",
          );
      for (const [key, child] of Object.entries(value)) {
        if (!validKey.test(key) || forbiddenKey(key, path))
          invalid(`${path}.${key}`, "propriedade interna ou inválida.");
        if (node.keyOptions && !node.keyOptions.includes(key))
          invalid(`${path}.${key}`, "tipo não suportado nesta instalação.");
        const childNode =
          node.properties && Object.hasOwn(node.properties, key)
            ? node.properties[key]
            : node.additionalProperties;
        if (!childNode)
          invalid(
            `${path}.${key}`,
            "opção não suportada pela versão instalada.",
          );
        validateValue(child, childNode, `${path}.${key}`, depth + 1);
      }
      break;
    }
    case "array":
      if (
        !Array.isArray(value) ||
        value.length > (node.maxItems ?? 300) ||
        !node.items
      )
        invalid(path, "lista inválida.");
      value.forEach((child, i) =>
        validateValue(child, node.items!, `${path}[${i}]`, depth + 1),
      );
      break;
    case "string":
      if (
        typeof value !== "string" ||
        value.length > (node.maxLength ?? 16384) ||
        (node.enum && !node.enum.includes(value))
      )
        invalid(path, "texto ou opção inválida.");
      break;
    case "number":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > 2147483647 ||
        (node.integer && !Number.isSafeInteger(value)) ||
        (node.minimum !== undefined && value < node.minimum) ||
        (node.maximum !== undefined && value > node.maximum)
      )
        invalid(path, "número fora dos limites.");
      break;
    case "boolean":
      if (typeof value !== "boolean") invalid(path, "esperado sim ou não.");
      break;
    default:
      invalid(path, "schema incompatível.");
  }
}
export function validateDocuments(
  value: unknown,
  capabilities: Capabilities,
): Documents {
  const docs = documentSchema.parse(value);
  if (Buffer.byteLength(JSON.stringify(docs)) > 150000)
    invalid("documentos", "conteúdo extenso demais.");
  validateValue(docs.config, capabilities.schema.config, "config");
  validateValue(docs.shop, capabilities.schema.shop, "shop");
  const minDelay = (
    docs.config.spawner as Record<string, unknown> | undefined
  )?.["base-stats"] as Record<string, unknown> | undefined;
  if (
    minDelay &&
    typeof minDelay["min-spawn-delay"] === "number" &&
    typeof minDelay["max-spawn-delay"] === "number" &&
    minDelay["min-spawn-delay"] > minDelay["max-spawn-delay"]
  )
    invalid("config.spawner.base-stats", "delay mínimo supera o máximo.");
  return docs;
}
export function validateSnapshot(value: unknown): Snapshot {
  if (!isRecord(value) || !isRecord(value.capabilities))
    invalid("snapshot", "formato inválido.");
  if (
    Object.keys(value).some(
      (key) =>
        !["configHash", "documents", "capabilities", "capturedAt"].includes(
          key,
        ),
    )
  )
    invalid("snapshot", "propriedade não suportada.");
  hashSchema.parse(value.configHash);
  const cap = value.capabilities;
  if (
    Object.keys(cap).some(
      (key) =>
        ![
          "schemaVersion",
          "pluginVersion",
          "operations",
          "schema",
          "defaults",
        ].includes(key),
    )
  )
    invalid("capabilities", "propriedade não suportada.");
  if (
    cap.schemaVersion !== 1 ||
    typeof cap.pluginVersion !== "string" ||
    cap.pluginVersion.length > 40 ||
    !cap.pluginVersion ||
    !Array.isArray(cap.operations) ||
    cap.operations.some((v) => !operationKinds.includes(v as OperationKind)) ||
    !isRecord(cap.schema)
  )
    invalid("capabilities", "versão ou operações incompatíveis.");
  checkNode(cap.schema.config, "config", { count: 0 });
  checkNode(cap.schema.shop, "shop", { count: 0 });
  if (cap.schema.config.type !== "object" || cap.schema.shop.type !== "object")
    invalid("schema", "documentos devem ser objetos.");
  const roots = Object.keys(cap.schema.config.properties ?? {});
  if (
    cap.schema.config.additionalProperties ||
    roots.some(
      (key) =>
        ![
          "locale",
          "break",
          "explosion",
          "trade",
          "spawner",
          "rarity-settings",
          "mob-rarities",
        ].includes(key),
    ) ||
    cap.schema.shop.additionalProperties ||
    Object.keys(cap.schema.shop.properties ?? {}).some(
      (key) => key !== "spawner",
    )
  )
    invalid("schema", "raiz não suportada.");
  const capabilities = cap as unknown as Capabilities;
  validateDocuments(cap.defaults, capabilities);
  const documents = validateDocuments(value.documents, capabilities);
  return { configHash: value.configHash as string, documents, capabilities };
}

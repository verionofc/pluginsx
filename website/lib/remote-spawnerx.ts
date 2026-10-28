export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | ConfigValue[]
  | { [key: string]: ConfigValue };
export type ConfigObject = { [key: string]: ConfigValue };
export type RemoteDocuments = { config: ConfigObject; shop: ConfigObject };
export type ConfigSchema = {
  type: "object" | "array" | "string" | "number" | "boolean";
  title: string;
  description: string;
  default?: ConfigValue;
  properties?: Record<string, ConfigSchema>;
  additionalProperties?: ConfigSchema | false;
  items?: ConfigSchema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  reload?: "RELOAD" | "RESTART";
  requires?: "RELOAD" | "RESTART";
  keyOptions?: string[];
  propertyPattern?: string;
  maxLength?: number;
  maxItems?: number;
  format?: string;
};
export type RemoteCapabilities = {
  schemaVersion: number;
  pluginVersion: string;
  operations: string[];
  schema: { config: ConfigSchema; shop: ConfigSchema };
  defaults: RemoteDocuments;
};
export type RemoteSession = {
  id: string;
  state: string;
  code: string;
  requestedAt: string;
  expiresAt: string;
  lastSeenAt?: string | null;
  leaseExpiresAt?: string | null;
  actor?: { username: string | null; uuid: string | null };
  authorizedBy?: string | null;
};
export type RemoteOperation = {
  id: string;
  kind: string;
  status: string;
  message?: string;
  createdAt: string;
  completedAt?: string | null;
  backupId?: string | null;
};
export type RemoteRevision = {
  id: string;
  documents: RemoteDocuments;
  baseHash: string;
  createdAt: string;
  actorId: string;
  status: string;
};
export type RemoteServerState = {
  server: {
    id: string;
    serverId: string;
    name: string;
    minecraftVersion: string;
    implementation: string;
    implementationVersion: string;
    pluginVersion: string;
    license: { plan: string | null; valid: boolean };
    lastHeartbeatAt?: string | null;
    uptimeSeconds?: number | null;
  };
  session: RemoteSession | null;
  online: boolean;
  manageable: boolean;
  reason?: string;
  capabilities: RemoteCapabilities | null;
  snapshot: {
    hash: string;
    documents: RemoteDocuments;
    capturedAt: string;
  } | null;
  draft: RemoteRevision | null;
  revisions: RemoteRevision[];
  operations: RemoteOperation[];
  history: {
    action: string;
    actorId: string | null;
    createdAt: string;
    metadata?: Record<string, unknown>;
  }[];
};

export const remoteSessionLabels: Record<string, string> = {
  PENDING: "Aguardando autorização no site",
  WEB_APPROVED: "Confirme no Minecraft",
  CONNECTED: "Conectado",
  REJECTED: "Conexão recusada",
  EXPIRED: "Solicitação expirada",
  DISCONNECTED: "Servidor desconectado",
  REVOKED: "Sessão revogada",
  ERROR: "Falha na conexão",
};
export const operationLabels: Record<string, string> = {
  APPLY: "Aplicar configurações",
  PLUGIN_RELOAD: "Recarregar plugin",
  SYNC: "Sincronizar configurações",
  RESTORE: "Restaurar revisão",
};
export const operationStatusLabels: Record<string, string> = {
  QUEUED: "Preparada para envio",
  PENDING: "Preparada para envio",
  SENT: "Enviada ao plugin",
  DISPATCHED: "Enviada ao plugin",
  RUNNING: "Em execução no servidor",
  APPLYING: "Aplicando no servidor",
  APPLIED: "Aplicada e confirmada pelo plugin",
  SUCCEEDED: "Concluída pelo plugin",
  AWAITING_RELOAD: "Aplicada; aguarda reload",
  RELOAD_REQUIRED: "Aplicada; aguarda reload",
  RESTART_REQUIRED: "Aguarda reinicialização do servidor",
  FAILED: "Falha na operação",
  EXPIRED: "Operação expirada",
  CANCELLED: "Operação cancelada",
  CONFLICT: "Conflito com uma alteração local",
  UNKNOWN: "Resultado não confirmado pelo servidor",
};
export function operationPending(operation: RemoteOperation): boolean {
  return [
    "QUEUED",
    "PENDING",
    "SENT",
    "DISPATCHED",
    "RUNNING",
    "APPLYING",
  ].includes(operation.status);
}
export function documentsEqual(
  a: RemoteDocuments | null,
  b: RemoteDocuments | null,
): boolean {
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}
export function isConfigObject(value: unknown): value is ConfigObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const safeKey = /^[A-Za-z0-9_-]{1,64}$/;
const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);
export function validDynamicKey(key: string): boolean {
  return safeKey.test(key) && !blockedKeys.has(key);
}
export function nodeDefault(schema: ConfigSchema): ConfigValue {
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.type === "object")
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, node]) => [
        key,
        nodeDefault(node),
      ]),
    );
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "number") return schema.minimum ?? 0;
  return schema.enum?.[0] ?? "";
}
export function validateConfig(
  value: ConfigValue,
  schema: ConfigSchema,
  path = "",
  depth = 0,
): string[] {
  const label = path || schema.title || "Configuração";
  if (!["object", "array", "string", "number", "boolean"].includes(schema.type))
    return [`${label}: tipo de propriedade não suportado.`];
  if (depth > 16) return [`${label}: estrutura muito profunda.`];
  if (schema.type === "object") {
    if (!isConfigObject(value))
      return [`${label}: informe um grupo de propriedades.`];
    const errors: string[] = [];
    if (Object.keys(value).length > 500)
      errors.push(`${label}: limite de 500 propriedades por grupo.`);
    for (const [key, current] of Object.entries(value)) {
      const known = Boolean(
        schema.properties && Object.hasOwn(schema.properties, key),
      );
      const child = known
        ? schema.properties?.[key]
        : schema.additionalProperties;
      if (blockedKeys.has(key) || (path === "config" && key === "license")) {
        errors.push(
          `${label}.${key}: propriedade interna não pode ser editada.`,
        );
      } else if (!child)
        errors.push(
          `${label}.${key}: propriedade não suportada por esta versão.`,
        );
      else if (!known && !validDynamicKey(key))
        errors.push(
          `${label}.${key}: use letras, números, _ ou -, até 64 caracteres.`,
        );
      else if (!known && schema.keyOptions && !schema.keyOptions.includes(key))
        errors.push(
          `${label}.${key}: identificador não suportado pela instalação.`,
        );
      else
        errors.push(
          ...validateConfig(current, child, `${label}.${key}`, depth + 1),
        );
    }
    for (const key of Object.keys(schema.properties ?? {})) {
      if (!Object.hasOwn(value, key))
        errors.push(`${label}.${key}: propriedade obrigatória ausente.`);
    }
    return errors;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${label}: informe uma lista.`];
    if (value.length > (schema.maxItems ?? 500))
      return [`${label}: limite de ${schema.maxItems ?? 500} entradas.`];
    return schema.items
      ? value.flatMap((item, index) =>
          validateConfig(
            item,
            schema.items as ConfigSchema,
            `${label}[${index}]`,
            depth + 1,
          ),
        )
      : [];
  }
  if (schema.type === "boolean")
    return typeof value === "boolean"
      ? []
      : [`${label}: escolha ativado ou desativado.`];
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return [`${label}: informe um número válido.`];
    if (schema.integer && !Number.isInteger(value))
      return [`${label}: use um número inteiro.`];
    if (schema.minimum !== undefined && value < schema.minimum)
      return [`${label}: mínimo ${schema.minimum}.`];
    if (schema.maximum !== undefined && value > schema.maximum)
      return [`${label}: máximo ${schema.maximum}.`];
    return [];
  }
  if (typeof value !== "string") return [`${label}: informe um texto.`];
  if (value.length > (schema.maxLength ?? 8192))
    return [`${label}: texto muito longo.`];
  return schema.enum && !schema.enum.includes(value)
    ? [`${label}: escolha uma opção suportada.`]
    : [];
}
export function validateDocuments(
  documents: RemoteDocuments,
  capabilities: RemoteCapabilities,
): string[] {
  const errors = [
    ...validateConfig(documents.config, capabilities.schema.config, "config"),
    ...validateConfig(documents.shop, capabilities.schema.shop, "shop"),
  ];
  const spawner = isConfigObject(documents.config.spawner)
    ? documents.config.spawner
    : {};
  const stats = isConfigObject(spawner["base-stats"])
    ? spawner["base-stats"]
    : {};
  if (
    typeof stats["min-spawn-delay"] === "number" &&
    typeof stats["max-spawn-delay"] === "number" &&
    stats["min-spawn-delay"] > stats["max-spawn-delay"]
  )
    errors.push(
      "config.spawner.base-stats: o delay mínimo não pode superar o máximo.",
    );
  return errors;
}
export async function parseRemoteYaml(
  text: string,
  schema: ConfigSchema,
): Promise<ConfigObject> {
  if (text.length > 262144) throw new Error("O arquivo ultrapassa 256 KB.");
  const { parseDocument } = await import("yaml");
  const parsed = parseDocument(text, { uniqueKeys: true });
  if (parsed.errors.length)
    throw new Error(parsed.errors.map((error) => error.message).join("\n"));
  const value: unknown = parsed.toJS({ maxAliasCount: 0 });
  if (!isConfigObject(value))
    throw new Error("O arquivo deve conter um mapa de configurações.");
  const errors = validateConfig(value, schema, "config");
  if (errors.length) throw new Error(errors.slice(0, 8).join("\n"));
  return value;
}
export async function stringifyRemoteYaml(
  value: ConfigObject,
): Promise<string> {
  const { stringify } = await import("yaml");
  return stringify(value, { lineWidth: 0 });
}
export function configChanges(
  before: ConfigValue,
  after: ConfigValue,
  path = "",
): {
  path: string;
  before: ConfigValue | undefined;
  after: ConfigValue | undefined;
}[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (isConfigObject(before) && isConfigObject(after))
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap((key) =>
      key in before && key in after
        ? configChanges(before[key], after[key], path ? `${path}.${key}` : key)
        : [
            {
              path: path ? `${path}.${key}` : key,
              before: before[key],
              after: after[key],
            },
          ],
    );
  return [{ path, before, after }];
}
export function remoteTimestamp(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

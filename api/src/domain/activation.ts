import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
export const verificationStates = [
  "VERIFIED",
  "UNVERIFIED",
  "UNKNOWN",
  "NOT_APPLICABLE",
] as const;
export const actorSchema = z
  .object({
    executionType: z.enum(["PLAYER", "CONSOLE"]),
    username: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,32}$/)
      .nullable(),
    uuid: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((a, c) => {
    if (a.executionType === "PLAYER" && (!a.username || !a.uuid))
      c.addIssue({ code: "custom", message: "Jogador exige nome e UUID." });
    if (a.executionType === "CONSOLE" && (a.uuid || a.username))
      c.addIssue({
        code: "custom",
        message: "Console não possui identidade de jogador.",
      });
  });
export const authenticationSchema = z
  .object({
    onlineMode: z.boolean(),
    authenticationMode: z.enum([
      "DIRECT_ONLINE",
      "OFFLINE",
      "VELOCITY",
      "BUNGEECORD",
      "FLOODGATE",
      "UNKNOWN",
    ]),
    trustedProxyForwarding: z.boolean(),
  })
  .strict();
export const activationPayload = z
  .object({
    licenseKey: z.string().regex(/^plus_[0-9a-f-]{36}$/i),
    requestId: z.string().uuid(),
    serverId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    minecraftVersion: z.string().min(1).max(40),
    implementation: z.literal("Paper"),
    implementationVersion: z.string().min(1).max(120),
    pluginVersion: z.string().min(1).max(40),
    actor: actorSchema,
    authentication: authenticationSchema,
    privacy: z
      .object({
        consented: z.boolean(),
        consentVersion: z.number().int().positive(),
        consentedAt: z.string().datetime().nullable(),
        playerIp: z.string().max(45).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const signedEnvelope = z
  .object({
    payload: z.string().min(2).max(16384),
    publicKey: z.string().max(300),
    timestamp: z.string().regex(/^\d{13}$/),
    nonce: z.string().uuid(),
    signature: z.string().min(80).max(100),
  })
  .strict();
export type ActivationActor = z.infer<typeof actorSchema>;
export type ActivationAuthentication = z.infer<typeof authenticationSchema>;
export class ActivationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function keyFingerprint(publicKey: string) {
  try {
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "ed25519") throw new Error();
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch {
    throw new ActivationError(
      "INVALID_SERVER_IDENTITY",
      "Identidade criptográfica inválida.",
      401,
    );
  }
}
export function verifyServerProof(
  envelope: z.infer<typeof signedEnvelope>,
  path: string,
  skewSeconds: number,
  now = Date.now(),
) {
  if (Math.abs(now - Number(envelope.timestamp)) > skewSeconds * 1000)
    throw new ActivationError(
      "STALE_REQUEST",
      "Relógio fora da janela permitida.",
      401,
    );
  const fingerprint = keyFingerprint(envelope.publicKey);
  const digest = createHash("sha256")
    .update(envelope.payload, "utf8")
    .digest("hex");
  const manifest = `POST\n${path}\n${envelope.timestamp}\n${envelope.nonce}\n${digest}`;
  if (
    !verify(
      null,
      Buffer.from(manifest),
      envelope.publicKey,
      Buffer.from(envelope.signature, "base64"),
    )
  )
    throw new ActivationError(
      "INVALID_SIGNATURE",
      "Assinatura da instalação inválida.",
      401,
    );
  return fingerprint;
}
export function accountVerification(
  actor: ActivationActor,
): (typeof verificationStates)[number] {
  // A signed installation report is not independent proof of a Microsoft account.
  return actor.executionType === "CONSOLE" ? "NOT_APPLICABLE" : "UNVERIFIED";
}
export const licenseReference = (key: string) =>
  createHash("sha256").update(`pluginsx-account-license:${key}`).digest("hex");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function serverConnection(
  state: string,
  lastHeartbeatAt: Date | null | undefined,
  offlineSeconds: number,
  now = Date.now(),
) {
  if (state !== "ACTIVE") return "INACTIVE";
  if (!lastHeartbeatAt) return "UNKNOWN";
  return now - lastHeartbeatAt.getTime() <= offlineSeconds * 1000
    ? "ONLINE"
    : "OFFLINE";
}

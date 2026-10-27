import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { LicenseServerPrivacy } from "../../database/models/LicenseServerEvent.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import { LicensingConfiguration } from "../../database/models/LicensingConfiguration.js";
import type { LicensingPolicy } from "../../domain/licensing-config.js";
import {
  ActivationError,
  type activationPayload,
} from "../../domain/activation.js";
import type { z } from "zod";
import { env } from "../../env.js";
export function maskedIp(ip: string) {
  return isIP(ip) === 4
    ? ip.split(".").slice(0, 2).join(".") + ".*.*"
    : ip.split(":").slice(0, 2).join(":") + ":…";
}

/** Erasure also invalidates collections that are still awaiting an external lookup. */
export async function eraseActivationPrivacy(id: string, subjectUuid?: string) {
  await LicenseServer.db.transaction(async (session) => {
    const privacy = await LicenseServerPrivacy.findOne({
      serverRecordId: id,
    }).session(session);
    if (
      privacy &&
      subjectUuid &&
      privacy.subjectUuid &&
      privacy.subjectUuid !== subjectUuid
    ) {
      throw new ActivationError(
        "PRIVACY_SUBJECT_NOT_FOUND",
        "Dados opcionais não encontrados para este jogador.",
        404,
      );
    }
    await LicenseServer.updateOne(
      { _id: id },
      { $inc: { privacyRevision: 1 } },
      { session },
    );
    await LicenseServerPrivacy.deleteOne({ serverRecordId: id }, { session });
  });
}

export async function collectActivationPrivacy(
  id: string,
  input: z.infer<typeof activationPayload>,
  policy: LicensingPolicy,
) {
  const p = input.privacy;
  if (!p?.consented) {
    await eraseActivationPrivacy(id, input.actor.uuid ?? undefined);
    return;
  }
  if (
    !policy.collectPlayerIp ||
    !p?.consented ||
    !p.playerIp ||
    !isIP(p.playerIp) ||
    p.consentVersion !== policy.consentVersion ||
    !p.consentedAt ||
    input.actor.executionType !== "PLAYER"
  )
    return;
  if (
    input.authentication.authenticationMode !== "DIRECT_ONLINE" &&
    !input.authentication.trustedProxyForwarding
  )
    return;
  const consentedAt = new Date(p.consentedAt);
  if (Math.abs(Date.now() - consentedAt.getTime()) > 365 * 86400000) return;
  const installation = await LicenseServer.findById(id)
    .select({ privacyRevision: 1 })
    .lean();
  if (!installation) return;
  const privacyRevision = installation.privacyRevision ?? 0;
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      env.BETTER_AUTH_SECRET,
      "pluginsx",
      "activation-ip-v1",
      32,
    ),
  );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(p.playerIp, "utf8"),
    cipher.final(),
  ]);
  const encryptedIp = Buffer.concat([
    nonce,
    cipher.getAuthTag(),
    encrypted,
  ]).toString("base64");
  let location: null | {
    country: string | null;
    region: string | null;
    city: string | null;
  } = null;
  const token = process.env.IPINFO_TOKEN;
  if (policy.geolocationEnabled && token) {
    try {
      const response = await fetch(
        `https://ipinfo.io/${encodeURIComponent(p.playerIp)}/json`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(2500),
        },
      );
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        const safe = (v: unknown) =>
          typeof v === "string" ? v.slice(0, 100) : null;
        location = {
          country: safe(data.country),
          region: safe(data.region),
          city: safe(data.city),
        };
      }
    } catch {
      /* Activation does not depend on optional geolocation. */
    }
  }
  await LicensingConfiguration.db.transaction(async (session) => {
    const current = await LicensingConfiguration.findById("current")
      .session(session)
      .lean();
    if (
      !current?.policy.collectPlayerIp ||
      current.policy.consentVersion !== p.consentVersion
    )
      return;
    // Administrative erasure writes the same document; either it wins first
    // and this retry observes the new policy, or it deletes this write afterward.
    await LicensingConfiguration.updateOne(
      { _id: "current" },
      { $inc: { privacyWriteRevision: 1 } },
      { session },
    );
    const locked = await LicenseServer.updateOne(
      {
        _id: id,
        state: { $in: ["PENDING", "ACTIVE"] },
        removedAt: { $exists: false },
        $or: [{ privacyRevision }, { privacyRevision: { $exists: false } }],
      },
      { $inc: { privacyRevision: 1 } },
      { session },
    );
    if (!locked.matchedCount) return;
    await LicenseServerPrivacy.findOneAndUpdate(
      { serverRecordId: id },
      {
        $set: {
          subjectUuid: input.actor.uuid,
          collectedAt: new Date(),
          encryptedIp,
          maskedIp: maskedIp(p.playerIp!),
          location: current.policy.geolocationEnabled ? location : null,
          consentVersion: p.consentVersion,
          consentedAt,
          expiresAt: new Date(
            Date.now() + current.policy.sensitiveRetentionDays * 86400000,
          ),
        },
      },
      { upsert: true, session },
    );
  });
}

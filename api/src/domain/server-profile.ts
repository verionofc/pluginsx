import { z } from "zod";

export const serverIconIds = ["grass", "chest", "diamond", "redstone", "crafting", "sword", "beacon", "portal"] as const;
export type ServerIconId = (typeof serverIconIds)[number];

const tag = z.string().trim().min(1).max(24).regex(/^[^\p{Cc}<>]+$/u);
export const serverProfileUpdate = z.object({
  displayName: z.string().trim().max(100).regex(/^[^\p{Cc}]*$/u).optional(),
  tags: z.array(tag).max(5).transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((value) => {
      const key = value.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }).optional(),
  icon: z.enum(serverIconIds).optional(),
  pinned: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe uma alteração.");
export type ServerProfileUpdate = z.infer<typeof serverProfileUpdate>;

type ProfileRecord = { _id: string; licenseId: string; state: string };
type ProfileServices<T> = {
  findServer: (id: string) => Promise<ProfileRecord | null>;
  ownsLicense: (userId: string, licenseId: string) => Promise<boolean>;
  ownsLiveTrial: (userId: string, licenseId: string) => Promise<boolean>;
  updateActiveServer: (id: string, licenseId: string, patch: ServerProfileUpdate) => Promise<T | null>;
};

/** A identificação só é editável pelo proprietário e enquanto o servidor está autorizado. */
export async function updateAuthorizedServerProfile<T>(
  userId: string, id: string, patch: ServerProfileUpdate, services: ProfileServices<T>,
): Promise<{ ok: true; server: T } | { ok: false; status: 404 | 409; message: string }> {
  const record = await services.findServer(id);
  if (!record) return { ok: false, status: 404, message: "Servidor não encontrado." };
  const owned = await services.ownsLicense(userId, record.licenseId) || await services.ownsLiveTrial(userId, record.licenseId);
  if (!owned) return { ok: false, status: 404, message: "Servidor não encontrado." };
  if (record.state !== "ACTIVE") return { ok: false, status: 409, message: "Apenas servidores autorizados podem ser personalizados." };
  const updated = await services.updateActiveServer(record._id, record.licenseId, patch);
  if (!updated) return { ok: false, status: 409, message: "A autorização mudou. Atualize a lista e tente novamente." };
  return { ok: true, server: updated };
}

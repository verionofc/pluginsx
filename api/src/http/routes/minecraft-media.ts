import { Elysia } from "elysia";
import { z } from "zod";
const cache = new Map<
  string,
  { bytes: Uint8Array; type: string; expires: number }
>();
const pending = new Map<
  string,
  Promise<{ bytes: Uint8Array; type: string; expires: number }>
>();
const fallback = () => ({
  bytes: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" shape-rendering="crispEdges"><path fill="#284837" d="M0 0h64v96H0z"/><path fill="#b7ce94" d="M16 8h32v32H16z"/><path fill="#243a2a" d="M20 20h8v6h-8zm16 0h8v6h-8zM26 30h12v5H26z"/><path fill="#688c68" d="M16 42h32v30H16zM4 44h10v28H4zm46 0h10v28H50z"/><path fill="#9daf88" d="M18 74h12v20H18zm16 0h12v20H34z"/></svg>',
  ),
  type: "image/svg+xml",
  expires: Date.now() + 60000,
});
async function image(uuid: string, kind: string) {
  const key = `${uuid}:${kind}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit;
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 8) return fallback();
  const work = (async () => {
    let result = fallback();
    try {
      const path =
        kind === "avatar"
          ? `avatars/${uuid}?size=128&overlay`
          : kind === "skin"
            ? `skins/${uuid}`
            : `renders/body/${uuid}?overlay`;
      const response = await fetch(`https://crafatar.com/${path}`, {
        signal: AbortSignal.timeout(3000),
        redirect: "error",
      });
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("image/png") &&
        Number(response.headers.get("content-length") ?? 0) < 2_000_000
      ) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 2_000_000 && bytes[0] === 137 && bytes[1] === 80)
          result = {
            bytes: Buffer.from(bytes),
            type: "image/png",
            expires: Date.now() + 3600000,
          };
      }
    } catch {
      /* A local pixel fallback works without third-party availability. */
    }
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
export const minecraftMediaRoutes = new Elysia({
  prefix: "/license/players",
}).get(
  "/:uuid/:kind",
  async ({ params }) => {
    const result = await image(params.uuid.replaceAll("-", ""), params.kind);
    return new Response(new Uint8Array(result.bytes).buffer, {
      headers: {
        "content-type": result.type,
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  },
  {
    params: z.object({
      uuid: z.string().uuid(),
      kind: z.enum(["avatar", "body", "skin"]),
    }),
  },
);

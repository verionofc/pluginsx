export type CapacityMode =
  | "inventory"
  | "network"
  | "unlimited"
  | "empty"
  | "unknown";

function safeCount(value: number) {
  return Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)))
    : 0;
}

/** Apenas capacidades pequenas viram slots; ilimitado não tem uma quota fictícia. */
export function getLicenseCapacity(
  usedValue: number,
  limitValue: number | null,
  unlimited = false,
) {
  const used = safeCount(usedValue);
  const limit =
    limitValue !== null && Number.isFinite(limitValue)
      ? safeCount(limitValue)
      : null;
  const mode: CapacityMode = unlimited
    ? "unlimited"
    : limit === null
      ? "unknown"
      : limit === 0
        ? "empty"
        : limit <= 12
          ? "inventory"
          : "network";
  return {
    mode,
    used,
    limit,
    percent:
      unlimited || limit === null || limit === 0
        ? 0
        : Math.min(100, (used / limit) * 100),
    cells: mode === "inventory" ? (limit ?? 0) : 0,
    filled: mode === "inventory" ? Math.min(used, limit ?? 0) : 0,
    available: unlimited || limit === null ? null : Math.max(0, limit - used),
    excess: unlimited || limit === null ? 0 : Math.max(0, used - limit),
  };
}

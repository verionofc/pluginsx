export type FulfillmentStatus =
  | "pending"
  | "processing"
  | "ready"
  | "review"
  | "revoked";

export type PurchaseProgressData = {
  reference: string;
  externalReference?: string;
  plan: string;
  planName?: string;
  status: string;
  paymentStatus?: string;
  fulfillmentStatus?: FulfillmentStatus;
  licenseRef?: string | null;
  licenseIssuedAt?: string | null;
  serverSlots?: number;
  checkoutUrl?: string;
  message?: string;
  amount?: number;
  currency?: string;
  createdAt?: string;
  upgradeCreditReversed?: boolean;
  entitlementCheckoutReserved?: boolean;
};

export type PurchaseStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
const referencePattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const watchPrefix = "pluginsx:purchase-watch:v1:";
const arrivalPrefix = "pluginsx:purchase-arrivals:v1:";

export const purchaseUpdatedEvent = "pluginsx:purchase-updated";
export const isPurchaseReference = (value: unknown): value is string =>
  typeof value === "string" && referencePattern.test(value);

/** A provider approval is only the payment step; an independent key must exist. */
export function purchaseIsReady(purchase: PurchaseProgressData): boolean {
  return (
    purchase.fulfillmentStatus === "ready" &&
    (purchase.paymentStatus ?? purchase.status) === "approved" &&
    !purchase.upgradeCreditReversed &&
    (purchase.plan === "server_slots" ||
      (typeof purchase.licenseRef === "string" &&
        /^[a-f0-9]{64}$/i.test(purchase.licenseRef)))
  );
}

export function purchasePhase(
  purchase: PurchaseProgressData,
): FulfillmentStatus {
  if (purchase.upgradeCreditReversed || purchase.fulfillmentStatus === "review")
    return "review";
  if (
    ["refunded", "charged_back"].includes(
      purchase.paymentStatus ?? purchase.status,
    ) ||
    purchase.fulfillmentStatus === "revoked"
  )
    return "revoked";
  if (purchaseIsReady(purchase)) return "ready";
  if (
    purchase.fulfillmentStatus === "processing" ||
    (purchase.paymentStatus ?? purchase.status) === "approved"
  )
    return "processing";
  return "pending";
}

export function safeCheckoutUrl(value: unknown, origin: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, origin);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(url.origin === origin && url.protocol === "http:"))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function rememberPurchase(
  storage: PurchaseStorage | undefined,
  ownerId: string,
  reference: string,
  now = Date.now(),
): void {
  if (!ownerId || !isPurchaseReference(reference)) return;
  try {
    storage?.setItem(
      watchPrefix + ownerId,
      JSON.stringify({ reference, savedAt: now }),
    );
  } catch {
    /* Tracking remains available in this visit. */
  }
}

export function restoredPurchase(
  storage: PurchaseStorage | undefined,
  ownerId: string,
  now = Date.now(),
): string | null {
  try {
    const value = JSON.parse(
      storage?.getItem(watchPrefix + ownerId) ?? "null",
    ) as { reference?: unknown; savedAt?: unknown } | null;
    return value &&
      isPurchaseReference(value.reference) &&
      typeof value.savedAt === "number" &&
      value.savedAt <= now + 60_000 &&
      now - value.savedAt <= 7 * 86400000
      ? value.reference
      : null;
  } catch {
    return null;
  }
}

export function forgetPurchase(
  storage: PurchaseStorage | undefined,
  ownerId: string,
): void {
  try {
    storage?.removeItem(watchPrefix + ownerId);
  } catch {
    /* Storage is optional. */
  }
}

function arrivals(
  storage: PurchaseStorage | undefined,
  ownerId: string,
): string[] {
  try {
    const value: unknown = JSON.parse(
      storage?.getItem(arrivalPrefix + ownerId) ?? "[]",
    );
    return Array.isArray(value) ? value.filter(isPurchaseReference) : [];
  } catch {
    return [];
  }
}

export function arrivalWasSeen(
  storage: PurchaseStorage | undefined,
  ownerId: string,
  reference: string,
): boolean {
  return arrivals(storage, ownerId).includes(reference);
}

export function markArrivalSeen(
  storage: PurchaseStorage | undefined,
  ownerId: string,
  reference: string,
): void {
  try {
    storage?.setItem(
      arrivalPrefix + ownerId,
      JSON.stringify([
        ...arrivals(storage, ownerId)
          .filter((id) => id !== reference)
          .slice(-49),
        reference,
      ]),
    );
  } catch {
    /* The mounted provider also deduplicates arrivals. */
  }
}

/** Discover a pending checkout, or a recent unacknowledged arrival, after returning without a query string. */
export function discoverPurchase(
  value: unknown,
  storage: PurchaseStorage | undefined,
  ownerId: string,
  now = Date.now(),
): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PurchaseProgressData>;
  const reference = row.reference ?? row.externalReference;
  if (!isPurchaseReference(reference)) return null;
  if (
    row.status === "pending" ||
    row.entitlementCheckoutReserved ||
    row.fulfillmentStatus === "processing"
  )
    return reference;
  const createdAt = Date.parse(row.licenseIssuedAt ?? row.createdAt ?? "");
  return row.fulfillmentStatus === "ready" &&
    Number.isFinite(createdAt) &&
    now - createdAt >= 0 &&
    now - createdAt < 30 * 60_000 &&
    !arrivalWasSeen(storage, ownerId, reference)
    ? reference
    : null;
}

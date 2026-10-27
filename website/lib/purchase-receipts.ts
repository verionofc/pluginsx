type ReceiptStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const storageKey = "pluginsx:settled-purchases:v1";
const validReference = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Deduplicate cart cleanup; license authorization always remains on the backend. */
export function claimPurchaseReceipt(
  reference: string,
  remembered: Set<string>,
  storage?: ReceiptStorage,
): boolean {
  if (!validReference.test(reference) || remembered.has(reference))
    return false;
  let receipts: string[] = [];
  try {
    const stored: unknown = JSON.parse(storage?.getItem(storageKey) ?? "[]");
    if (Array.isArray(stored))
      receipts = stored.filter(
        (value): value is string =>
          typeof value === "string" && validReference.test(value),
      );
  } catch {
    // In-memory deduplication still works when browser storage is unavailable.
  }
  remembered.add(reference);
  if (receipts.includes(reference)) return false;
  try {
    storage?.setItem(
      storageKey,
      JSON.stringify([...receipts.slice(-99), reference]),
    );
  } catch {
    // Keep the current page usable without persistent storage.
  }
  return true;
}

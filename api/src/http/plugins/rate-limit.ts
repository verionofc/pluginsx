import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import { getLicensingConfig } from "./licensing-config.js";

export async function consumeRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const result = await BillingRateLimit.collection.findOneAndUpdate(
    { key: `${action}:${userId}` },
    [
      {
        $set: {
          count: {
            $cond: [
              { $gt: ["$expiresAt", now] },
              { $add: [{ $ifNull: ["$count", 0] }, 1] },
              1,
            ],
          },
          expiresAt: {
            $cond: [{ $gt: ["$expiresAt", now] }, "$expiresAt", expiresAt],
          },
        },
      },
    ],
    { upsert: true, returnDocument: "after", includeResultMetadata: false },
  );
  return Number(result?.count ?? 0) <= limit;
}

export async function allowAccountRequest(userId: string, action: string) {
  return consumeRateLimit(
    userId,
    `account:${action}`,
    (await getLicensingConfig()).policy.privateRequestsPerMinute,
    60_000,
  );
}

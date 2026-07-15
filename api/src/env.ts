import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().length(32),

  BETTER_AUTH_URL: z.string(),
  BETTER_AUTH_DOMAIN: z.string().optional(),
  DEFAULT_PORT: z.coerce.number().default(3333),

  DISCORD_CLIENT_ID: z.string(),
  DISCORD_CLIENT_SECRET: z.string(),

  URL: z.string(),
  DEV_URL: z.string(),

  MONGODB_URI: z.string().startsWith("mongodb+srv://"),
  MONGODB_DB_NAME: z.string(),
});

export const env = envSchema.parse(process.env);

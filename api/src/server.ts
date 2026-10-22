import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import z from "zod";

import { env } from "./env.js";
import { Package } from "./config/package.js";

import { indexRoutes } from "./http/routes/index.js";
import { aboutRoutes } from "./http/routes/about.js";

import { logger } from "./utils/logger.js";
import { connectDatabase } from "./database/connect.js";
import { pluginRoutes } from "./http/routes/plugins.js";

await connectDatabase();

// Better Auth uses the already-open Mongoose MongoDB connection.
const [
  { betterAuthPlugin },
  { userRoutes },
  { licenseRoutes },
  { License },
] = await Promise.all([
  import("./http/plugins/better-auth.js"),
  import("./http/routes/user.js"),
  import("./http/routes/license.js"),
  import("./database/models/License.js"),
]);

// Create the unique owner index before accepting premium key requests.
await License.init();

// Normalize configured site URLs so a trailing slash does not prevent an
// otherwise valid browser Origin from matching the CORS allowlist.
const trustedWebOrigins = [env.DEV_URL, env.URL].map(
  (url) => new URL(url).origin,
);

const app = new Elysia({ name: "PluginsX API", adapter: node() })
  .use(
    cors({
      origin: ({ request }) =>
        trustedWebOrigins.includes(request.headers.get("origin") ?? ""),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    }),
  )
  .use(
    openapi({
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
      documentation: {
        info: {
          title: "PluginsX API",
          version: Package.version,
          description:
            "API do PluginsX voltada exclusivamente a servidores PaperMC. Downloads e metadados de plugins são publicados para Paper.",
        },
        tags: [
          {
            name: "Default",
            description: "Default routes",
          },
          {
            name: "User",
            description: "Authenticated user profile",
          },
          {
            name: "License",
            description: "License related routes",
          },
          {
            name: "Plugins",
            description:
              "Metadados e downloads de versões compatíveis com PaperMC.",
          },
        ],
      },
    }),
  )
  .use(betterAuthPlugin)

  // Routes
  .use(indexRoutes)
  .use(userRoutes)
  .use(aboutRoutes)
  .use(licenseRoutes)
  .use(pluginRoutes)

  .listen(
    {
      port: env.DEFAULT_PORT,
    },
    (info) => {
      logger(`🔥 api is running at ${info.hostname}:${info.port}`);
    },
  );

export type App = typeof app;

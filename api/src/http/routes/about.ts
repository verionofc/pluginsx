import { Elysia } from "elysia";
import { Package } from "../../config/package.js";
import { env } from "../../env.js";


export const aboutRoutes = new Elysia({ prefix: "/about" })
  .get(
    "/",
    () => ({
      name: Package.name,
      version: Package.version,
      author: Package.author,
      authProviders: {
        github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
        discord: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
      },
    }),
    {
      detail: {
        summary: "About the API",
        tags: ["Default"],
      },
    },
  );

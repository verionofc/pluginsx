import { Elysia } from "elysia";

export const indexRoutes = new Elysia()
  .get(
    "/",
    () => ({
      message: "Hello, PluginsX.",
    }),
    {
      detail: {
        summary: "Health check",
        tags: ["Default"],
      },
    },
  );

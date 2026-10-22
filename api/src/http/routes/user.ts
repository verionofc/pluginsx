import { Elysia } from "elysia";

import { authSessionPlugin } from "../plugins/better-auth.js";

export const userRoutes = new Elysia({ prefix: "/me" })
  .use(authSessionPlugin)
  .get(
    "/",
    ({ user }) => user,
    {
      auth: true,
      detail: {
        summary: "Get the authenticated user's profile",
        tags: ["User"],
      },
    },
  );

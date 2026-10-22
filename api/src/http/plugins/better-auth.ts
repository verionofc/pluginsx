import { Elysia } from "elysia";

import { auth } from "../../config/auth.js";

export const authSessionPlugin = new Elysia({ name: "auth-session" }).macro({
  auth: {
    async resolve({ request: { headers }, status }) {
      const session = await auth.api.getSession({ headers });

      if (!session) {
        return status(401, {
          code: "AUTH_REQUIRED",
          message: "Faça login para gerar uma key Premium.",
        });
      }

      return {
        user: session.user,
        session: session.session,
      };
    },
  },
});

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .use(authSessionPlugin);

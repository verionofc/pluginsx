// import type { User } from "better-auth/types";
// import { Elysia } from "elysia";
// import { z } from "zod";

// import { betterAuthPlugin } from "#/http/plugins/better-auth";

// export const userRoutes = new Elysia({ prefix: "/me" })
//   .use(betterAuthPlugin)
//   .get(
//     "/",
//     ({ user }) => {
//       return user;
//     },
//     {
//       auth: true,
//       detail: {
//         summary: "Get current user profile",
//         tags: ["User"],
//       },
//       response: {
//         201: z.object<User>(),
//         401: z.object({ message: z.string() }),
//       },
//     },
//   );

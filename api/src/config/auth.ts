// import { betterAuth } from "better-auth";
// import { admin, openAPI } from "better-auth/plugins";
// import { Database } from "bun:sqlite";

// import { env } from "#env";

// export const auth = betterAuth({
//   basePath: "/auth",
//   baseURL: env.BETTER_AUTH_URL,

//   trustedOrigins: [env.DEV_URL, env.URL],

//   database: new Database("database.sqlite"),

//   plugins: [admin(), openAPI()],

//   advanced: {
//     database: {
//       generateId: false,
//     },

//     crossSubDomainCookies: {
//       enabled: true,
//     },
//   },

//   session: {
//     expiresIn: 60 * 60 * 24 * 7,
//   },

//   socialProviders: {},
// });

import { mongodbAdapter } from "@better-auth/mongo-adapter";
import type { Auth } from "better-auth";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";

import { env } from "../env.js";
import { getDb } from "../database/connect.js";
import mongoose from "mongoose";

const trustedOrigins = [env.URL, env.DEV_URL].map(
  (url) => new URL(url).origin,
);
const authBaseURL =
  process.env.NODE_ENV === "production" ? env.URL : env.DEV_URL;

// This module is loaded after connectDatabase() in server.ts so the shared
// MongoDB connection is ready before Better Auth creates its adapter.
const authOptions = {
  appName: "PluginsX",
  baseURL: authBaseURL,
  basePath: "/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: mongodbAdapter(getDb(), {
    client: mongoose.connection.getClient(),
  }),
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      scope: ["user:email"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
} satisfies BetterAuthOptions;

export const auth: Auth<typeof authOptions> = betterAuth(authOptions);

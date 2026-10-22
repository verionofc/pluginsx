import { createAuthClient } from "better-auth/react";

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
).replace(/\/$/, "");

export const authClient = createAuthClient({
  basePath: "/auth",
  fetchOptions: {
    credentials: "include",
  },
});

export { apiUrl };

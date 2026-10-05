import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./schema";

// Keep in sync with scripts/gen-auth-schema.mjs, which regenerates the
// auth tables in lib/schema.ts from this same config.
export const authOptions = {
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
  plugins: [bearer(), deviceAuthorization({ verificationUri: "/device" })],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

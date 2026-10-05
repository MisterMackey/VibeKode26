import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { CLI_CLIENT_ID } from "@todo-cat/contract";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./schema";

// Keep in sync with scripts/gen-auth-schema.mjs, which regenerates the
// auth tables in lib/schema.ts from this same config.
export const authOptions = {
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
  plugins: [
    bearer(),
    // The CLI's login (tech-docs/cli.md); app/device is where the user approves.
    deviceAuthorization({
      verificationUri: "/device",
      validateClient: (clientId) => clientId === CLI_CLIENT_ID,
    }),
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

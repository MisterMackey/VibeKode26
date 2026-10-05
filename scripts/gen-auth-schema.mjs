// Regenerates the Better Auth table definitions in lib/schema.ts.
//
// Better Auth's own CLI (the `auth` package) generates this normally via
// `npx auth generate --adapter drizzle --dialect sqlite`, but installing a
// package literally named `auth` trips this sandbox's package-name checks.
// @better-auth/drizzle-adapter already ships the same generator internally
// (not part of its public API, so imported by relative path); this script
// calls it directly with the same options as lib/auth.ts.
//
// Run with plain `node`, not `tsx`/esbuild: esbuild's transform mangles the
// `/* @__PURE__ */ new Date()` annotation in the upstream source into a bare
// `new Date` reference, which breaks the generated `$onUpdate()` calls.
//
// Usage: node scripts/gen-auth-schema.mjs > /tmp/auth-schema.ts
// Review the output, then merge it into lib/schema.ts by hand.
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { generateDrizzleSchema } from "../node_modules/@better-auth/drizzle-adapter/dist/generate-drizzle-schema-iWvrXnu0.mjs";

// Keep in sync with the plugins/options in lib/auth.ts.
const options = {
  emailAndPassword: { enabled: true },
  plugins: [bearer(), deviceAuthorization({ verificationUri: "/device" })],
};

const result = await generateDrizzleSchema({
  options,
  provider: "sqlite",
  adapterConfig: {},
  file: "lib/schema.ts",
});

console.log(result.code);

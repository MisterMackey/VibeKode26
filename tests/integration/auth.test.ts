import { convertSetCookieToCookie } from "better-auth/test";
import { afterAll, beforeAll, expect, test } from "vitest";
import { migrateTempDb } from "../../scripts/with-temp-db";

const tempDb = { url: "", cleanup: () => {} };
const credentials = {
  name: "Lissie",
  email: "cat@example.com",
  password: "whiskers123",
};

beforeAll(() => {
  Object.assign(tempDb, migrateTempDb());
  process.env.DATABASE_URL = tempDb.url;
}, 60_000);

afterAll(() => tempDb.cleanup());

test("sign-up creates a user", async () => {
  const { auth } = await import("@/lib/auth");

  const result = await auth.api.signUpEmail({ body: credentials });
  expect(result.user.email).toBe(credentials.email);
});

test("the right password signs in", async () => {
  const { auth } = await import("@/lib/auth");

  const result = await auth.api.signInEmail({
    body: { email: credentials.email, password: credentials.password },
  });
  expect(result.user.email).toBe(credentials.email);
});

test("a wrong password is rejected", async () => {
  const { auth } = await import("@/lib/auth");

  await expect(
    auth.api.signInEmail({
      body: { email: credentials.email, password: "not-the-password" },
    }),
  ).rejects.toThrow();
});

test("the session helper resolves a cookie, a bearer token, and neither", async () => {
  const { auth } = await import("@/lib/auth");
  const { getUserId } = await import("@/lib/session");

  const { response, headers } = await auth.api.signInEmail({
    body: { email: credentials.email, password: credentials.password },
    returnHeaders: true,
  });

  const cookieHeaders = convertSetCookieToCookie(headers);
  expect(await getUserId(cookieHeaders)).toBe(response.user.id);

  const bearerToken = headers.get("set-auth-token");
  expect(bearerToken).toBeTruthy();
  expect(
    await getUserId(new Headers({ authorization: `Bearer ${bearerToken}` })),
  ).toBe(response.user.id);

  expect(await getUserId(new Headers())).toBeNull();
});

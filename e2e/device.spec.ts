import { expect, test } from "@playwright/test";

// The human half of `todo-cat login`: open the printed link while logged out,
// log in, check the code, approve. The CLI half is covered by
// tests/integration/cli.test.ts; here a cookie-less request context stands in
// for it.
test("approve a CLI login code on /device", async ({
  page,
  playwright,
  baseURL,
}) => {
  const email = `device-${Date.now()}@example.com`;
  const password = "whiskers123";
  const signUp = await playwright.request.newContext({ baseURL });
  expect(
    (
      await signUp.post("/api/auth/sign-up/email", {
        data: { name: "Lissie", email, password },
      })
    ).ok(),
  ).toBe(true);

  const cli = await playwright.request.newContext({ baseURL });
  const codeResponse = await cli.post("/api/auth/device/code", {
    data: { client_id: "todo-cat-cli" },
  });
  expect(codeResponse.ok()).toBe(true);
  const code = await codeResponse.json();

  await page.goto(code.verification_uri_complete);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/device\?user_code=/);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(code.user_code)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Device approved")).toBeVisible();

  const token = await cli.post("/api/auth/device/token", {
    data: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: code.device_code,
      client_id: "todo-cat-cli",
    },
  });
  expect(token.ok()).toBe(true);
  expect((await token.json()).access_token).toBeTruthy();
});

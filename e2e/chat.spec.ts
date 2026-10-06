import { expect, test } from "@playwright/test";

test("the chat on / talks to the runtime as the signed-in user", async ({
  page,
  request,
}) => {
  // Without a session the runtime refuses everything.
  expect((await request.get("/api/copilotkit/info")).status()).toBe(401);

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Max");
  await page.getByLabel("Email").fill(`max-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("whiskers123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/");

  await expect(page.getByText("keeping Max's list")).toBeVisible();
  await expect(page.getByText("Tell me about your list")).toBeVisible();

  // The model may be unreachable in e2e (no real key); the run request still has
  // to reach the runtime on the user's own thread and be accepted.
  const run = page.waitForResponse((r) =>
    r.url().endsWith("/api/copilotkit/agent/lissie/run"),
  );
  await page.getByRole("textbox").first().fill("Remind me to buy tuna");
  await page.getByRole("textbox").first().press("Enter");
  expect((await run).status()).toBe(200);
  await expect(page.getByText("Remind me to buy tuna")).toBeVisible();
});

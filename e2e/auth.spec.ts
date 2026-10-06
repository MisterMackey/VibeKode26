import { expect, test } from "@playwright/test";

test("sign-up, sign-out, and sign-in", async ({ page }) => {
  const email = `cat-${Date.now()}@example.com`;
  const password = "whiskers123";

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lissie");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("keeping Lissie's list")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("keeping Lissie's list")).toBeVisible();
});

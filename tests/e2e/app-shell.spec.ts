import { expect, test } from "@playwright/test";

test("home shows chat-first workspace shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("workspace-title")).toHaveText(/EngGo/i);
  await expect(page.getByTestId("active-exam-target")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByText("遵从怎么说")).toBeVisible();
});

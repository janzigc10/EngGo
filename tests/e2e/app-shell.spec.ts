import { expect, test } from "@playwright/test";

test("home shows Today shell and chat remains available", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "今天从哪里开始" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Learn/ })).toHaveAttribute(
    "href",
    "/learn",
  );
  await expect(page.getByRole("link", { name: /^Review/ })).toHaveAttribute(
    "href",
    "/review",
  );
  await expect(page.getByRole("link", { name: /^Chat/ })).toHaveAttribute(
    "href",
    "/chat",
  );

  await page.goto("/chat");

  await expect(page.getByTestId("active-exam-target")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByPlaceholder("问点什么")).toBeVisible();
  await expect(page.getByText("遵从怎么说")).toHaveCount(0);
});

test("drawer, wordbook icon, and progress compatibility route use the new shell", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "打开主导航" }).click();

  const drawer = page.getByRole("dialog", { name: "ENGGO" });

  await expect(drawer.getByRole("link")).toHaveText([
    "Today",
    "Learn",
    "Review",
    "Chat",
  ]);
  await expect(drawer.getByRole("link", { name: "Today" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await drawer.getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("dialog", { name: "ENGGO" })).toHaveCount(0);

  await page.getByRole("link", { name: "打开词书" }).click();
  await expect(page).toHaveURL(/\/wordbook$/);
  await expect(page.getByRole("heading", { name: /ECDICT 基础词书 V1/ })).toBeVisible();

  await page.goto("/progress");
  await expect(page).toHaveURL(/\/wordbook$/);
});

test("mobile shell avoids horizontal overflow and keeps the wordbook icon clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat");

  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByRole("button", { name: /发送/i })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const wordbookLink = document.querySelector<HTMLAnchorElement>(
      'a[aria-label="打开词书"]',
    );
    const chatInput = document.querySelector<HTMLElement>('[data-testid="chat-input"]');
    const submitButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("发送"),
    );

    if (!wordbookLink || !chatInput || !submitButton) {
      return null;
    }

    const viewport = {
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
    };
    const wordbookBox = wordbookLink.getBoundingClientRect();
    const inputBox = chatInput.getBoundingClientRect();
    const buttonBox = submitButton.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right
      && a.right > b.left
      && a.top < b.bottom
      && a.bottom > b.top;

    return {
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wordbookInViewport:
        wordbookBox.left >= 0
        && wordbookBox.right <= viewport.width
        && wordbookBox.top >= 0
        && wordbookBox.bottom <= viewport.height,
      overlapsInput: overlaps(wordbookBox, inputBox),
      overlapsSubmit: overlaps(wordbookBox, buttonBox),
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics?.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(metrics?.wordbookInViewport).toBe(true);
  expect(metrics?.overlapsInput).toBe(false);
  expect(metrics?.overlapsSubmit).toBe(false);
});

test("wordbook selection is shared by Learn and Review without old management blocks", async ({
  page,
}) => {
  await page.goto("/wordbook");

  await page.getByRole("button", { name: /高考/ }).click();

  await expect(
    page.getByRole("heading", { name: "高考 ECDICT 基础词书 V1" }),
  ).toBeVisible();

  await page.goto("/learn");
  await expect(page.getByText("当前词书：高考 ECDICT 基础词书 V1")).toBeVisible();
  await expect(page.getByText("选择词书")).toHaveCount(0);
  await expect(page.getByText("Learn 每组")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "管理词书" })).toHaveAttribute(
    "href",
    "/wordbook",
  );

  await page.goto("/review");
  await expect(page.getByText("当前词书：高考 ECDICT 基础词书 V1")).toBeVisible();
  await expect(page.getByText("选择词书")).toHaveCount(0);
  await expect(page.getByText("Review 每组")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "管理词书" })).toHaveAttribute(
    "href",
    "/wordbook",
  );
});

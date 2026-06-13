import { expect, test } from "@playwright/test";

test("chat answer stays plain and collections route remains available", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "CET-4 这题先看 comply with，再顺手对比 conform to。",
        requestId: "req_collection_flow",
        providerRequestId: "resp_collection_flow",
        grounding: {
          activeExamTarget: "cet4",
          activeExamTargetLabel: "CET-4",
          query: "遵从怎么说",
          queryMode: "meaning_lookup",
          mainAnswer: [
            {
              entryId: "comply",
              lemma: "comply",
              meaningsZh: ["遵从，遵守"],
              matchedAlias: "comply with",
              scopeCodes: ["cet4", "cet6"],
              inScope: true,
              reason: "in-scope main answer",
              score: 10,
            },
          ],
          confusionBoundary: [
            {
              entryId: "conform",
              lemma: "conform",
              meaningsZh: ["符合，遵守"],
              matchedAlias: "conform to",
              scopeCodes: ["cet4", "cet6"],
              inScope: true,
              reason: "nearby confusion",
              score: 8,
            },
          ],
          scopeReminder: "这次先以 CET-4 范围内答案为主。",
          followUpPrompt: "如果你愿意，我可以继续拆一下 comply / conform 的区别。",
          comparisonView: null,
        },
      }),
    });
  });

  await page.goto("/chat");
  await page.getByRole("combobox", { name: "当前词书" }).selectOption("cet4");
  await page.getByTestId("chat-input").fill("遵从怎么说");
  await page.getByRole("button", { name: /发送/i }).click();

  await expect(page.locator("article").filter({ hasText: /comply/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入收藏" })).toHaveCount(0);

  await page.goto("/collections");

  await expect(
    page.getByText("收藏词条会按考试范围分组保存", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/现在还没有收藏任何词条/)).toBeVisible();
});

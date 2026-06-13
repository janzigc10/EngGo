import { expect, test } from "@playwright/test";

test("chat MVP flow can switch targets and render a plain answer", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "CET-4 这题先看 comply with，再顺手区分 conform to。",
        requestId: "req_chat_mvp",
        providerRequestId: "resp_chat_mvp",
        grounding: {
          activeExamTarget: "cet4",
          activeExamTargetLabel: "CET-4",
          query: "遵从怎么说？",
          queryMode: "meaning_lookup",
          mainAnswer: [
            {
              entryId: "comply",
              lemma: "comply",
              meaningsZh: ["遵从", "服从"],
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
              meaningsZh: ["符合", "遵守"],
              matchedAlias: "conform to",
              scopeCodes: ["cet4", "cet6"],
              inScope: true,
              reason: "nearby confusion",
              score: 8,
            },
          ],
          scopeReminder: "先以 CET-4 范围内答案为主。",
          followUpPrompt: "如果你想，我可以继续拆 comply / conform 的区别。",
          comparisonView: null,
        },
      }),
    });
  });

  await page.goto("/chat");

  await page.getByRole("combobox", { name: "当前词书" }).selectOption("cet4");
  await expect(page.getByTestId("active-exam-target")).toContainText("CET-4");
  await page.getByTestId("chat-input").fill("遵从怎么说？");
  await page.getByRole("button", { name: /发送/i }).click();

  const answer = page.locator("article").filter({ hasText: /comply/i });
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("comply");
  await expect(answer.getByRole("button", { name: /加入收藏/i })).toHaveCount(0);
});

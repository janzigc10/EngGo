# Chat Answer Display Tools Spec

Date: 2026-04-30

## Summary

EngGo 的聊天回答展示已经完成第一刀：assistant answer 可以渲染受控 Markdown 子集，包括标题、加粗、列表和 Markdown 表格。

下一刀不重做页面，而是处理宽召回场景里的重复信息。对于 `tion 结尾的词有哪些`、`con 开头的词有哪些` 这类 root-family 宽召回，答案正文已经包含完整学习表格；下方 grounding 面板不应该再铺一遍主答案长串，收藏动作也不应该默认展开成第二份词表。

采用 B 方案：**学习材料 + 工具条**。

## Problem

当前宽召回答案会出现三层重复：

- `AnswerContent` 正文里有完整表格。
- grounding 面板里再显示 `主答案` 的 lemma 长串。
- `AnswerActions` 再显示逐词收藏列表。

这让移动端页面变长，也削弱了“答案正文就是学习材料”的感觉。

## Product Principle

答案正文是学习材料本体。

grounding 面板只承担操作与状态职责：

- 告诉用户当前是否稳定命中。
- 给一个自然下一步。
- 提供收藏工具入口。

不要把 grounding 面板做成另一份搜索结果列表。

## Desired Behavior

### Resolved Answer

For resolved assistant messages:

- Continue rendering `message.content` through `AnswerContent`.
- Show a compact support panel under the answer.
- If `grounding.mainAnswer.length > 1`, show a summary such as `已命中 16 个当前范围词`.
- If `grounding.mainAnswer.length === 1`, show a concise summary such as `已命中 1 个当前范围词：generate`.
- Do not render a long `主答案` lemma string by default.
- Keep `下一步` visible, because it helps the learner continue.

### Collection Tools

For collection actions:

- `AnswerActions` should render as a compact tools block by default when there are many candidates.
- If candidate count is greater than 5, show a button such as `展开收藏工具`.
- Do not show any individual word rows before the user expands.
- After expand, show the existing first-5 collapsed behavior, with the existing `展开全部 N 个` behavior if needed.
- For short answers with 1-5 candidates, keep direct per-word collection buttons visible.

This keeps ordinary lookup fast while keeping broad root-family recall compact.

### No Match

No-match messages should keep the current explanation card:

- show `暂未稳定命中`
- do not show `主答案`
- do not show collection actions
- keep `下一步`

## UI Shape

Use restrained product UI, not a dashboard card stack:

- The answer bubble remains the primary surface.
- The support panel is a single light panel, not nested cards inside cards.
- Text labels should be utility labels, not marketing copy.
- The default mobile view should not show a second word list under a table answer.

## Non-Goals

- Do not change retrieval, grounding, or prompt logic.
- Do not add bulk collection yet.
- Do not add row-level buttons inside the rendered Markdown table.
- Do not introduce a third-party Markdown renderer.
- Do not redesign the whole chat page.

## Acceptance Criteria

- Broad root-family answer with 8+ main answers renders a table in the answer body.
- The support panel does not show the full lemma string by default.
- Broad root-family answer shows no individual `加入收藏` buttons until the user expands collection tools.
- After expanding collection tools, existing collection behavior still works.
- Short one-word answers still show the direct collection button.
- No-match answers still do not show collection actions.
- Component tests cover the compact support panel and collapsed collection tools.

# EngGo 滚动交接

## 当前状态（2026-06-15 Card Density V1）

- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 已提交基线：`9dc301e Add chat card shell streaming`。本轮仍是未提交 diff；不要提交 `.codex/`，除非用户明确要求，不要 commit/push。
- Chat `answerSurface` V1.1 final 合同仍是最终权威展示协议，`grounding` 继续作为 evidence/context 与 legacy fallback。
- Full Card Streaming V1 已作为技术 spike 停止推进。当前正式方向是 Card-Shell Streaming + final `answerSurface` 收敛，不维护 `surface_item` / `surface_member` / `surface_option` 这类 row-level SSE 中间事件。
- Card Density V1 已落地：默认卡片优先可扫读摘要层，长内容、长列表、证据与低优先级项通过展开/折叠按需显示。

## 本轮已完成

1. Card Density V1 展示规则
   - `candidate_list` 默认展示前 5 个，显示 `展开剩余 N 个`。
   - `compare` 默认展示一句话说明 + 每个词的短义摘要，词性/完整释义进入 `展开词性和细节`。
   - `expression_advice` / `context_choice` 默认展示前 4 行说明，选项默认前 3 个，剩余选项折叠。
   - `root_family` 默认展示核心项，`low_priority` 或旁支项进入 `展开旁支 N 个`。
   - `grounding/evidence` 默认收起，用户点 `查看依据` 后显示范围、问题、路径和候选。

2. 前端实现
   - `src/components/chat/assistant-answer.tsx` 改为 client component，新增通用折叠列表、密度正文、compare 摘要、root family 核心项和 evidence 折叠组件。
   - `src/components/chat/chat-input.tsx` 去掉 sticky 输入框，避免桌面和移动端长卡片展开后被输入框覆盖。
   - 没有改 `answerSurface` final 合同、后端 schema、Next `/api/chat` proxy、词库 scope closure、Learn/Review/App Shell/Prisma/schema/source lemma 数据。

3. 测试覆盖
   - 新增 `src/components/chat/assistant-answer.test.tsx`，覆盖 candidate top-N 展开、compare 说明/详情折叠、expression 说明/选项折叠、root family 旁支折叠、evidence 默认收起。
   - 保留并增强 `ChatWorkspace` stream shell 测试，继续断言 final 后不丢 `conversationContext`、`resolvedFollowUp`、收藏副作用和 transcript。
   - 保留 `chat-api-client` card-shell SSE parser 测试，事件范围仍是 `meta` / `surface_start` / `answer_delta` / `final`。

## 当前验证

- `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_chat_contract.py -o cache_dir=.runlogs/pytest-cache --basetemp=.runlogs/pytest-basetemp` -> 39 passed。
- `corepack pnpm test -- src\components\chat\chat-workspace.test.tsx src\features\chat\chat-api-client.test.ts src\components\chat\assistant-answer.test.tsx` -> 33 files / 268 tests passed。
- `corepack pnpm lint -- src\components\chat\assistant-answer.tsx src\components\chat\assistant-answer.test.tsx src\components\chat\chat-input.tsx src\components\chat\chat-workspace.test.tsx src\features\chat\chat-api-client.test.ts` -> passed。
- `corepack pnpm build` -> passed，Next 16.2.4 compiled，TypeScript passed，11 static pages generated。
- Playwright 真实 `/chat` 视觉探针已通过，证据保存在 `output/playwright/card-density-evidence.json` 和同目录截图：
  - desktop/mobile `tran开头的单词有哪些`：默认 5 个候选 + `展开剩余 13 个`，展开后 18 个候选完整可见。
  - desktop/mobile `access assess excess 怎么区分`：默认一句话核心区别 + 短义摘要，展开后完整说明和词性细节可见。
  - desktop/mobile `more formal way to say follow`：默认 3 个推荐表达 + `展开更多说明`。
  - 6 组默认/展开组合均无水平溢出，输入框不再覆盖最后一张回答卡片。

## 下一步

1. 让用户用本地页面实际试一轮密度默认值。若仍觉得多，优先只调 `assistant-answer.tsx` 顶部常量：`candidateListPreviewLimit`、`expressionOptionPreviewLimit`、`rootFamilyCorePreviewLimit`、正文 preview 行数。
2. 若要继续优化体感，建议做轻量交互 polish：展开/收起区域的过渡、按钮文案统一、evidence 入口位置微调。不要回到 row-level card streaming。
3. Streaming 后续只作为等待感管理层：provider-backed 路径保留轻量 card shell、状态、可选正文 delta；deterministic 卡片追求快速 final，不伪造逐行流式。

## 环境注意

- Windows PowerShell 直接发中文 JSON 或中文正则到本地 API/Playwright 时仍可能乱码；真实探针优先用 Node，并对中文 query 或正则使用 Unicode escape。
- 本地 Browser QA 优先打开 `http://localhost:3000`；若使用 `127.0.0.1:3000` 遇到 hydration/HMR 异常，先按 `bugs.md` 判断 Next dev origin 坑。
- 启动 dev stack 前建议显式设置 `ENGGO_ECDICT_PATH=C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv`，并确认 `ENGGO_USE_STRUCTURED_RUNTIME=false`。

## 稳定基线

- 聊天式 MVP、真实词库 smoke、易混词辨析、词根/碎片检索、聊天回答渲染层、Answer Policy v1 松绑 spike 已完成。
- 聊天式学习上下文 V1 / V2 / V3 已进入维护状态：继续保护范围切换、`还有吗`、受控 `怎么背`、收藏页继续追问、候选内语境选择和有边界聊天兜底。
- ECDICT 是运行时默认大词库底座；structured DB 仍是可选覆盖层，默认不启用。
- Wordbook Learn / Review V1、体验打磨、V2 产品硬化、V2.1 active session persistence 与 Review 可见词数修复均已完成。

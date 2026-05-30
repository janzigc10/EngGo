# EngGo 滚动交接

## 当前状态（2026-05-30 Wordbook Learn/Review Experience Polish V1 完成）
- 已完成计划：`docs/superpowers/plans/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- Source spec：`docs/superpowers/specs/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- 当前分支 / worktree：`codex/wordbook-learn-review-v1`，隔离 worktree `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`
- 本轮保持 client-only，只改 Wordbook Learn/Review 前端体验、状态机和本地持久化；未碰 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。

## 本轮完成
1. 新增本地学习设置 `enggo.wordbookStudySettings.v1`，支持 Learn/Review 每组 10/20/30 词、非法值归一化、订阅和快照。
2. `targetCount` 已贯穿 Dashboard、StudySession、收藏入口和 session engine；session 创建后分母冻结，进度仍是 `completedTargetLemmas.length / totalTargets`。
3. Learn 失败不再自动完成、不降灯、不清空 mastery dots；第一灯失败延迟 2 个目标回四选一，第二/三灯失败延迟 3 个目标回原灯位。
4. Review 改为 one-light verification；新增 `reviewLapsed`，Review 失败仍留在 Review 队列，rescue pass 间隔短于 clean pass，Learn 不再选入 Review 失败词。
5. Learn 四选一错误先进入 wrong-choice contrast，再进入详情；主动失败仍直接进入详情。
6. Learn 详情按阶段分层：第一灯只给核心释义和 1 个例句，第二灯增加 collocations，第三灯/真正通过页展示完整详情；“本轮已通过”只在 `passDetail` 出现。

## 最新验证
- Focused bundle：`corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-study-settings-store.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx` -> 10 files / 80 tests passed。
- Fix verification：`corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx` -> 2 files / 45 tests passed。
- Focused lint：`corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx` -> passed，0 warnings。
- Diff check：`git diff --check` -> passed；仅出现 Windows LF/CRLF warning。
- Browser QA：Playwright 390px 通过，覆盖 `/learn` 设置 20 词、`0 / 20` 分母、wrong-choice contrast、Learn 三灯失败保留当前灯位、Review 失败仍留在 Review 并延后返回、390px 无水平溢出。
- Subagent review gates：Task 1-6 的 spec reviewer 和 code reviewer 均已通过；其中 Task 2、Task 4、Task 5、Task 6 按 reviewer 要求补过修正并复测。

## 下一步
1. 如要进入主线，先做最终 merge/review 决策；当前分支已经是可验收状态，但还未推送。
2. 不要把本轮行为反向套回聊天主舞台；词书学习仍是本地 client-only 能力。
3. 后续新任务先写新的 plan 或明确“只做验收/合并/推送”，不要从本计划 Task 1 重开。

## 边界与风险
- 本轮未做完整 SRS、账号/云同步、全量词书、收藏词自定义词书或 UI 视觉精修。
- `reviewLapsed` 是 Review-owned 状态；不要让 Learn 队列重新吞掉 Review 失败词。
- 进度语义必须继续是 `completedTargetLemmas.length / totalTargets`，不要把曝光次数、详情页或错误次数计入完成数。
- 本地 dev server 验证使用 `http://localhost:3000`，不要用 `127.0.0.1`；Windows + pnpm/Prisma 环境坑仍按 `bugs.md` 恢复路径处理。

# EngGo 滚动交接

## 当前状态（2026-05-30 Wordbook Learn/Review V2 计划已落成）
- 当前活跃计划：`docs/superpowers/plans/2026-05-30-wordbook-learn-review-v2-product-hardening.md`
- 已完成上一轮计划：`docs/superpowers/plans/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- Source specs：
  - `docs/superpowers/specs/2026-05-30-wordbook-learn-review-state-machine-design.md`
  - `docs/superpowers/specs/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- 当前分支 / worktree：`codex/wordbook-learn-review-v1`，隔离 worktree `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`
- 当前仍保持 client-only；后续 V2 计划不改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。

## 已完成基线
1. Wordbook Learn/Review V1 已完成并通过手测：Learn 三灯队列式推进；Review 干净通过是一灯快速验收；Review 失败留在 Review 内走三灯补救链路。
2. 体验打磨 V1 已完成：本地学习设置支持 Learn/Review 每组 10/20/30 词，session 分母冻结；Learn 失败保留当前灯位；Learn 四选一错误先进入 wrong-choice contrast；Learn 详情按灯位分层；Review 新增 `reviewLapsed` 并按已过灯位恢复。
3. 用户已手测确认当前 Learn/Review 手感“挺好”，可以作为 V2 hardening 基线。
4. 本轮只新增轻量 V2 plan，并更新 `docs/README.md` / `progress.md`；尚未开始 V2 代码实现。

## 最近验证基线
- Focused bundle：`corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-study-settings-store.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx` -> 10 files / 83 tests passed。
- Fix verification：`corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\study-session.test.tsx` -> 2 files / 48 tests passed。
- Focused lint：`corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx` -> passed，0 warnings。
- Diff check：`git diff --check` -> passed；仅出现 Windows LF/CRLF warning。
- Browser QA：Playwright 390px 通过，覆盖 `/learn` 设置 20 词、`0 / 20` 分母、wrong-choice contrast、Learn 三灯失败保留当前灯位、Review 失败后三灯补救和 Review 完成。
- 注意：以上是 V1 完成时的验证基线；本次 docs-only plan 更新未重跑测试。

## 下一步
1. 若继续实现，严格从 `docs/superpowers/plans/2026-05-30-wordbook-learn-review-v2-product-hardening.md` 的 Task 0 开始：重读文档、确认 git 状态、重跑 Wordbook focused tests，并把验证基线写回 `progress.md`。
2. Task 0 通过后再进入 Task 1 词书选择入口；不要跳过 baseline 直接改状态机。
3. 本轮 V2 重点顺序是：词书选择、Review 调度语义、数据解释、恢复/空状态；UI 视觉精修、完整 SRS、账号/云同步、全量词书和主线 merge 都不在本计划内。
4. 不要把 Wordbook 行为反向套回聊天主舞台；词书学习仍是本地 client-only 能力。

## 边界与风险
- `reviewLapsed` 是 Review-owned 状态；不要让 Learn 队列重新吞掉 Review 失败词。Review 失败后的补救阶段可以复用 `recognitionChoice` / `guidedRecall` / `finalRecall` stage，但 `state.mode` 必须保持 `review`。
- 进度语义必须继续是 `completedTargetLemmas.length / totalTargets`，不要把曝光次数、详情页或错误次数计入完成数。
- V2 调度只能做可解释的轻量 policy/helper；不要直接引入复杂 SRS 参数或无法手测的黑盒算法。
- 本地 dev server 验证使用 `http://localhost:3000`，不要用 `127.0.0.1`；Windows + pnpm/Prisma 环境坑仍按 `bugs.md` 恢复路径处理。

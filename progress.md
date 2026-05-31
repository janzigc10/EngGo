# EngGo 滚动交接

## 当前状态（2026-05-31 Wordbook Learn/Review V2 hardening 执行中）
- 当前活跃计划：`docs/superpowers/plans/2026-05-30-wordbook-learn-review-v2-product-hardening.md`
- 当前分支 / worktree：`codex/wordbook-learn-review-v1`，隔离 worktree `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`
- 当前 HEAD 起点：`da3b0d6138c6c97d37909f0487f284becb2ca4a7`
- 本轮继续保持 client-only；不改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。
- Task 0 已完成：确认 V2 只做词书选择、Review 调度语义、学习数据解释、恢复/空状态四块硬化，不重写 V1 Learn/Review 核心流程。
- Task 1 已完成：新增 active wordbook registry/store，Dashboard 显示当前词书，Learn/Review session 启动时冻结 `wordbookId`，progress/session 读取不再只靠隐式默认词书。
- Task 2 已完成：新增 `wordbook-review-scheduling.ts`，区分新学通过、Review 干净通过、Review 补救通过、Review 补救未完成四种调度语义；Review 队列按补救词优先、到期时间优先排序。
- Task 3 已完成：`buildWordbookProgressSnapshot` 新增未学习、学习中、待复习、Review 补救中、未到期、内容不足等解释指标；Dashboard / Progress 页展示这些状态说明，session 分母仍保持 `completedTargetLemmas.length / totalTargets`。
- Task 4 已完成：Dashboard 对 Learn 无可学词、Review 无到期词、只剩补救/到期词等状态给出明确说明；StudySession 直接进入 0 目标时展示无任务状态，不再显示“本轮完成 0 / 0”。`reviewLapsed` 与 legacy `lapsed` 的恢复路径继续由状态机测试覆盖。
- Task 5 已完成：focused bundle、focused lint、`git diff --check` 和 390px 浏览器 QA 均通过。当前先不自动提交，等待用户手测确认后再做 V2 checkpoint commit。
- Review 节奏补丁已完成：复现到失败补救词在 session 后半段会因为剩余 pending 不足而把第二灯、第三灯挤在一起；根因是 Review session 只取固定目标数，没有保留间隔 buffer。当前修复为 Review session 额外保留 due reserve，仅在失败补救需要间隔且主队列不够时拉入 buffer 词。
- Review reserve 计数补丁已完成：用户手测发现 Review 会越复习越多、没有明确 end；根因是 reserve buffer 被拉入 pending 时也累加到 `totalTargets`。当前修复为 reserve 只做间隔词，不计入本轮 10/20/30 目标，不推进 `completedTargetLemmas`，且当只剩 reserve buffer 时直接完成本轮 Review。
- 临时手测入口已加入：开发环境下访问 `/review?seedReview=1` 会写入 40 个到期 Review 词并自动回到 `/review`；这是本地手测辅助，最终提交前需要确认保留为 dev-only helper 还是删除。
- 本地 dev server 已从正确 worktree 启动：`http://localhost:3000`，PID `34552`。

## 已完成基线
1. Wordbook Learn/Review V1 已完成并通过手测：Learn 三灯队列式推进；Review 干净通过是一灯快速验收；Review 失败留在 Review 内走三灯补救链路。
2. 体验打磨 V1 已完成：本地学习设置支持 Learn/Review 每组 10/20/30 词，session 分母冻结；Learn 失败保留当前灯位；Learn 四选一错误先进入 wrong-choice contrast；Learn 详情按灯位分层；Review 新增 `reviewLapsed` 并按已过灯位恢复。
3. 用户已手测确认当前 Learn/Review 手感“挺好”，可作为 V2 hardening 基线。

## 最新验证
- Git 状态：`git -c safe.directory=C:/tmp/enggo-worktrees/wordbook-learn-review-v1 -C C:\tmp\enggo-worktrees\wordbook-learn-review-v1 status --short --branch` -> `## codex/wordbook-learn-review-v1`。
- Baseline focused bundle：`corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-study-settings-store.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx` -> 10 files / 83 tests passed。
- Task 1 focused tests：`corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-active-store.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\collections\study-panels.test.tsx` -> 7 files / 71 tests passed。
- Task 2 focused tests：`corepack pnpm test src\features\wordbook\wordbook-review-scheduling.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\session-engine.test.ts` -> 3 files / 46 tests passed。
- Task 3 focused tests：`corepack pnpm test src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\wordbook\study-session.test.tsx` -> 4 files / 31 tests passed。
- Task 4 focused tests：`corepack pnpm test src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-progress-store.test.ts` -> 4 files / 68 tests passed。
- Final focused bundle：`corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-active-store.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-study-settings-store.test.ts src\features\wordbook\wordbook-review-scheduling.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx` -> 12 files / 97 tests passed。
- Focused lint：`corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx` -> passed，无 warnings。
- Diff check：`git -c safe.directory=C:/tmp/enggo-worktrees/wordbook-learn-review-v1 diff --check` -> passed，仅 Windows LF/CRLF warning。
- Browser QA：Playwright 390px 覆盖 `/learn` 20 词分母、wrong-choice contrast、`/review` clean pass、`/review` 失败后三灯补救、Learn empty state、Review empty state、30 词分母和无横向溢出。截图保存在：
  - `output/playwright/wordbook-v2-learn-390.png`
  - `output/playwright/wordbook-v2-review-rescue-390.png`
  - `output/playwright/wordbook-v2-empty-390.png`
- Review 节奏补丁验证：
  - `corepack pnpm test src\features\wordbook\session-engine.test.ts` -> 1 file / 36 tests passed。
  - `corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-active-store.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\wordbook-study-settings-store.test.ts src\features\wordbook\wordbook-review-scheduling.test.ts src\features\wordbook\distractors.test.ts src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\wordbook\wordbook-progress-summary.test.tsx src\features\collections\collection-store.test.ts src\features\collections\study-panels.test.tsx` -> 12 files / 98 tests passed。
  - `corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx src\app\learn\learn-client.tsx src\app\review\review-client.tsx` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warning。
- Review reserve 计数补丁验证：
  - `corepack pnpm test src\features\wordbook\session-engine.test.ts` -> 1 file / 38 tests passed。
  - `corepack pnpm test src\features\wordbook src\features\collections\study-panels.test.tsx` -> 11 files / 95 tests passed。
  - `corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warning。
  - 回归覆盖：reserve buffer 可被拉入做灯位间隔，但 `totalTargets` 保持 10/20/30；reserve buffer 完成时不推进本轮完成数；最后一个主目标完成后若只剩 reserve buffer，则本轮 Review 直接 complete。
- 临时 seed 入口验证：已打开 `http://localhost:3000/review?seedReview=1`，页面自动回到 `/review`，当前显示 `待复习 40` 和 `开始 Review (40)`。

## 下一步
1. 用户在当前 `/review` 继续手测 40 个到期 Review 词，重点观察失败补救后的灯位间隔是否自然，同时确认分母不再越复习越大、能正常 complete。
2. 若手测确认通过，决定临时 `/review?seedReview=1` helper 是删除还是保留为 dev-only 测试入口，再提交 V2 checkpoint；不要 merge 主线。
3. 若手测发现产品手感问题，优先记录具体路径和状态到 `progress.md` / `bugs.md`，不要重新改回 V1 或重写状态机。

## 边界与风险
- 不要把当前分支和主工作区 `codex/chat-shell-bootstrap` 混用；本轮只在 `C:\tmp\enggo-worktrees\wordbook-learn-review-v1` 工作。
- `reviewLapsed` 是 Review-owned 状态；不要让 Learn 队列重新吞掉 Review 失败词。
- 进度语义继续保持 `completedTargetLemmas.length / totalTargets`，不要把曝光次数、详情页或错误次数计入完成数。
- V2 调度只做可解释的轻量 policy/helper，不引入复杂 SRS 参数或无法手测的黑箱算法。

# EngGo 滚动交接

## 当前状态（2026-05-31 Wordbook Learn/Review V2.1 手测通过）
- 当前分支 / worktree：`codex/wordbook-learn-review-v1`，隔离 worktree `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`。
- 最新已提交 checkpoint：当前 HEAD，`fix: cap review session visible words`；上一 V2.1 checkpoint 为 `352dd05eb7f6aa0db01d57fcce05bd56ce64af78`。
- 当前活跃计划：`docs/superpowers/plans/2026-05-31-wordbook-active-session-persistence-v2-1.md`。
- V2.1 active session persistence 已完成：Learn / Review 正在进行的 session 会 client-local 保存、恢复、继续/重开和完成清理；仍不做账号、云同步、完整 SRS、后端存储、聊天主舞台改造或 UI 大精修。
- 本轮修复用户手测发现的 Review 策略问题：旧 V2 reserve buffer 为了给失败词隔开间距，会把本轮目标外的 reserve 词拉入 `pending`，导致 UI 上一轮 10 词可能看到第 11 个不同词。
- 当前产品决策：Review 的 `targetCount` 同时约束分母和本轮可见唯一词数；失败词可以重复出现，但不能引入目标外新词。Review 不再创建可见 reserve；旧 active session 里的 legacy non-goal buffer 会被清理或跳过。
- 用户已手测确认 V2.1 当前状态可收口：就这样，不继续调 Learn / Review 状态机。
- 本轮继续保持 client-only；只改 `src/features/wordbook`，不改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。

## 已完成基线
1. Wordbook Learn/Review V1 已完成并通过手测：Learn 三灯队列式推进；Review 干净通过是一灯快速验收；Review 失败留在 Review 内走三灯补救链路。
2. 体验打磨 V1 已完成：本地学习设置支持 Learn/Review 每组 10/20/30 词，session 分母冻结；Learn 失败保留当前灯位；Learn 四选一错误先进入 wrong-choice contrast；Learn 详情按灯位分层；Review 新增 `reviewLapsed` 并按已过灯位恢复。
3. Wordbook Learn/Review V2 已提交：active wordbook 入口、Review 调度语义 helper、学习数据解释和恢复/空状态均已落地。V2 曾引入 Review reserve buffer，本轮已取消其可见调度用途，避免超过本轮目标词数。
4. 用户手测确认 V2 当前体验“还算过得去”，但指出 active session 状态管理不完整：Review 失败后退出再回来会基于 `reviewLapsed` 重新生成 `0 / N` 补救 session；Learn 基本没有整轮 session 恢复。

## 最新验证
- Review visible-word cap 红测：新增测试在修复前失败，额外显示目标外 `abundant`；修复后通过。
- Focused session/store：`corepack pnpm test src\features\wordbook\session-engine.test.ts src\features\wordbook\wordbook-active-session-store.test.ts` -> 2 files / 44 tests passed。
- Final focused bundle：`corepack pnpm test src\features\wordbook src\features\collections\study-panels.test.tsx` -> 12 files / 110 tests passed。
- Focused lint：`corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx` -> passed。
- Diff check：`git diff --check` -> passed，仅 Windows LF/CRLF warning。
- Browser QA（in-app Browser，`/review?seedReview=1`）：重新开始 10 词 Review，先点一次失败，再跑完整轮；总卡片展示 13 次，唯一词数 10，未超过目标数。
- V2.1 checkpoint commit：`352dd05eb7f6aa0db01d57fcce05bd56ce64af78`。
- V2.1 baseline：`corepack pnpm test src\features\wordbook src\features\collections\study-panels.test.tsx` -> 11 files / 95 tests passed。
- Task 1 focused：`corepack pnpm test src\features\wordbook\wordbook-active-session-store.test.ts` -> 1 file / 4 tests passed。
- Task 2 focused：`corepack pnpm test src\features\wordbook\study-session.test.tsx` -> 1 file / 20 tests passed。
- Task 3/4 focused：`corepack pnpm test src\features\wordbook\wordbook-active-session-store.test.ts src\features\wordbook\wordbook-dashboard.test.tsx src\features\wordbook\study-session.test.tsx src\features\collections\study-panels.test.tsx` -> 4 files / 41 tests passed。
- Final focused bundle：`corepack pnpm test src\features\wordbook src\features\collections\study-panels.test.tsx` -> 12 files / 109 tests passed。
- Focused lint：`corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx` -> passed。
- Diff check：`git diff --check` -> passed，仅 Windows LF/CRLF warning。
- Browser QA（in-app Browser，390px）：Learn exit -> continue restored；Learn refresh/path return -> continue restored；Review forgotten -> continue restored detail；Review complete clears active session。
- V2 最后验证：
  - `corepack pnpm test src\features\wordbook\session-engine.test.ts` -> 1 file / 38 tests passed。
  - `corepack pnpm test src\features\wordbook src\features\collections\study-panels.test.tsx` -> 11 files / 95 tests passed。
  - `corepack pnpm lint -- src\features\wordbook src\features\collections\study-panels.tsx` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warning。
- V2.1 当前已完成实现、自动验证和用户手测确认，尚未 merge 主线。

## 下一步
1. 不再继续调 Learn / Review 状态机；若后续发现问题，必须记录具体路径，不做泛化重写。
2. 下一步是决定是否把 `codex/wordbook-learn-review-v1` 合回主线；不要自动 merge。
3. merge 前重新跑 focused bundle、focused lint、`git diff --check`，并按需再做一轮浏览器冒烟。
4. `/review?seedReview=1` helper 仍保留为 dev-only 手测辅助；它只在非 production 下生效。

## 边界与风险
- 不要把当前分支和主工作区 `codex/chat-shell-bootstrap` 混用；本轮只在 `C:\tmp\enggo-worktrees\wordbook-learn-review-v1` 工作。
- `reviewLapsed` 是词级 Review-owned 状态，不等于 active session 恢复；V2.1 必须保存完整 `StudySessionState`，不能再靠词级 progress 推断队列上下文。
- `onExit` 在 V2.1 里应只退出界面，不销毁 active session；完成 session 才清理 active session。
- 设置变更只影响下一轮 session，不应改变已恢复 session 的 `totalTargets`。
- 进度语义继续保持 `completedTargetLemmas.length / totalTargets`，不要把曝光次数、详情页或错误次数计入完成数；Review 失败词重复曝光可以超过 10 次，但本轮唯一可见词不能超过 `totalTargets`。

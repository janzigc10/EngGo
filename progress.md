# EngGo 滚动交接

## 当前状态（2026-05-31 Wordbook Active Session Persistence V2.1 已完成）
- 当前分支 / worktree：`codex/wordbook-learn-review-v1`，隔离 worktree `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`。
- 最新已提交 checkpoint：`31faa2af18b0a64386a4d1e93fcb702b5661feca`，`feat: harden wordbook learn review v2`。
- 当前活跃计划：`docs/superpowers/plans/2026-05-31-wordbook-active-session-persistence-v2-1.md`。
- V2.1 边界已和用户确认：只补 Learn / Review 正在进行 session 的 client-local 保存、恢复、继续/重开和完成清理；不做账号、云同步、完整 SRS、后端存储、聊天主舞台改造或 UI 大精修。
- 本轮继续保持 client-only；不改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。
- Task 0 已完成：确认当前 worktree 为 `C:\tmp\enggo-worktrees\wordbook-learn-review-v1` / `codex/wordbook-learn-review-v1`，起点为 V2 checkpoint `31faa2af18b0a64386a4d1e93fcb702b5661feca`，并复跑 V2 focused baseline。
- Task 1 已完成：新增 `wordbook-active-session-store.ts`，用 `enggo.activeStudySessions.v1` 保存 Learn/Review active session snapshot；API 覆盖 load/save/clear/has，坏 JSON、版本不兼容、缺字段、mode/wordbook mismatch 会安全丢弃。
- Task 2 已完成：`StudySession` 初始化会优先恢复同 mode + wordbook 的 active session；每次 action 后先保存词级 progress，再保存 session state；complete / 0 目标会清 active session；`onExit` 只退出界面，不销毁 session；不兼容词书 state 会丢弃并重建。
- Task 3 已完成：Dashboard 检测当前 mode 的 active session，显示“继续 Learn/Review X / N”，提供“重新开始”和“放弃本轮”；放弃只清 active session，不回滚词级 progress。
- Task 4 已完成：测试覆盖刷新/重挂载恢复、退出到 dashboard 后继续、完成后清理、设置变更不改变旧 session 分母、Learn/Review session 隔离，以及 Review reserve buffer 恢复后不计入目标数。
- Task 5 已完成：focused bundle、focused lint、`git diff --check` 和 390px 浏览器 QA 均通过；浏览器覆盖 Learn 中途退出继续、Learn 路径返回/刷新后继续、Review 忘记后继续、Review clean complete 后清理 active session。
- 本轮顺手收敛 dev-only `/review?seedReview=1` helper：seed 仍保留用于本地手测，但移动到 `useEffect`，不再在 render 阶段 `history.replaceState`。

## 已完成基线
1. Wordbook Learn/Review V1 已完成并通过手测：Learn 三灯队列式推进；Review 干净通过是一灯快速验收；Review 失败留在 Review 内走三灯补救链路。
2. 体验打磨 V1 已完成：本地学习设置支持 Learn/Review 每组 10/20/30 词，session 分母冻结；Learn 失败保留当前灯位；Learn 四选一错误先进入 wrong-choice contrast；Learn 详情按灯位分层；Review 新增 `reviewLapsed` 并按已过灯位恢复。
3. Wordbook Learn/Review V2 已提交：active wordbook 入口、Review 调度语义 helper、学习数据解释、恢复/空状态、Review reserve buffer 和 Review reserve 不计入分母等均已落地。
4. 用户手测确认 V2 当前体验“还算过得去”，但指出 active session 状态管理不完整：Review 失败后退出再回来会基于 `reviewLapsed` 重新生成 `0 / N` 补救 session；Learn 基本没有整轮 session 恢复。

## 最新验证
- V2 checkpoint commit：`31faa2af18b0a64386a4d1e93fcb702b5661feca`。
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
- V2.1 当前已完成实现和验证，尚未 merge 主线。

## 下一步
1. 用户可在当前 worktree 的 dev server 上继续手测 `/learn` 和 `/review`，重点看 active session 是否符合预期。
2. 若手测确认通过，下一步是决定是否把 `codex/wordbook-learn-review-v1` 合回主线；不要自动 merge。
3. `/review?seedReview=1` helper 仍保留为 dev-only 手测辅助；它只在非 production 下生效。

## 边界与风险
- 不要把当前分支和主工作区 `codex/chat-shell-bootstrap` 混用；本轮只在 `C:\tmp\enggo-worktrees\wordbook-learn-review-v1` 工作。
- `reviewLapsed` 是词级 Review-owned 状态，不等于 active session 恢复；V2.1 必须保存完整 `StudySessionState`，不能再靠词级 progress 推断队列上下文。
- `onExit` 在 V2.1 里应只退出界面，不销毁 active session；完成 session 才清理 active session。
- 设置变更只影响下一轮 session，不应改变已恢复 session 的 `totalTargets`。
- 进度语义继续保持 `completedTargetLemmas.length / totalTargets`，不要把曝光次数、详情页或错误次数计入完成数。

# Wordbook Active Session Persistence V2.1 Plan

## Goal
补齐 Wordbook Learn / Review 的“正在进行 session”状态管理，让用户退出、刷新或回到页面后能继续原来的学习轮次，而不是只依赖词级 progress 重新生成一轮 session。

## Product Boundary
- 只做 client-local active session persistence。
- 不做账号、云同步、跨设备恢复、完整 SRS 参数化或后端存储。
- 不重写 V2 的 Learn / Review 状态机；只给现有 `StudySessionState` 增加保存、恢复、废弃和完成清理。
- 不改聊天主舞台、`/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。
- 设置变更只影响下一轮 session，不改正在恢复的 session 分母。

## Current Problem
- Review 点“忘记了”后，词级 progress 会立刻写成 `reviewLapsed`，但当前 session 的 `current / pending / reserve / completedTargetLemmas / totalTargets` 没有保存。
- 用户退出再回来时，页面基于 `reviewLapsed` 重新创建新 Review session，表现为直接进入补救三灯的第 0 灯，并且分母变成重新选出的目标数。
- Learn 也只保存单词 progress，不保存本轮队列，所以退出或刷新后无法继续原本的 session。

## Task 0 - Baseline And Scope Lock
- [x] 确认当前分支 / worktree 仍为 `codex/wordbook-learn-review-v1` 和 `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`。
- [x] 记录 V2 checkpoint commit：`31faa2af18b0a64386a4d1e93fcb702b5661feca`。
- [x] 跑或引用最近 focused tests，确认从 V2 checkpoint 开始。
- [x] 更新 `progress.md`，进入 V2.1 active session persistence 阶段。

Acceptance:
- 开工前明确 V2.1 只解决 active session 持久化，不继续扩大 Review 算法或 UI 精修。

## Task 1 - Active Session Store
- [x] 新增 `wordbook-active-session-store.ts`，用 localStorage 保存 active session snapshot。
- [x] snapshot 至少包含：`version`、`mode`、`wordbookId`、`targetCount`、`sessionId`、`startedAt`、`updatedAt`、`state`。
- [x] 提供 `loadActiveStudySession`、`saveActiveStudySession`、`clearActiveStudySession`、`hasActiveStudySession` 等最小 API。
- [x] 解析失败、版本不兼容、缺少必要字段时安全丢弃，不让页面卡死。
- [x] 补单元测试覆盖正常保存/恢复、坏 JSON、版本不兼容、mode/wordbook mismatch。

Acceptance:
- session store 可独立测试，不依赖 React 组件。
- 旧坏数据不会破坏 Learn / Review 页面。

## Task 2 - StudySession Restore And Persist
- [x] `StudySession` 初始化时优先恢复同 `mode + wordbookId` 的 active session。
- [x] 如果没有可恢复 session，再按当前 progress 创建新 session。
- [x] 每次 `applyStudyAction` 后，先保存 progress updates，再保存新的 active session state。
- [x] session complete 后清掉对应 active session。
- [x] `onExit` 只退出界面，不清 active session。
- [x] 如果当前 session 的词书不存在或 state 不兼容，丢弃 active session 并重新创建。

Acceptance:
- Learn 中途退出再回来，仍回到同一个词、同一灯位、同一完成数和同一分母。
- Review 失败后退出再回来，不会重新生成 `0 / N` 的补救 session，而是继续原本队列。

## Task 3 - Dashboard Continue / Restart Surface
- [x] Dashboard 检测当前 mode 的 active session。
- [x] 有 active session 时显示“继续 Learn/Review X / N”入口。
- [x] 保留“重新开始”或“放弃本轮”入口，避免用户被旧 session 困住。
- [x] 放弃本轮只清 active session，不回滚已保存的词级 progress。
- [x] 设置面板继续说明：变更只影响下一轮 session。

Acceptance:
- 用户能明确知道当前是继续旧 session 还是开启新 session。
- 放弃 session 不会误删已学词、Review 调度或 blockedContent 状态。

## Task 4 - Recovery Edge Cases
- [x] 覆盖刷新页面后的恢复行为。
- [x] 覆盖退出到 dashboard 后继续。
- [x] 覆盖完成 session 后 active session 被清理。
- [x] 覆盖设置从 10 改 20 后，旧 session 分母仍冻结，新 session 使用新设置。
- [x] 覆盖 Learn / Review 各自 session 不互相覆盖。
- [x] 覆盖旧版 Review buffer 恢复/重排后不会进入可见卡片。

Acceptance:
- active session 恢复不会破坏 V2 的三灯、Review rescue、旧 buffer 清理和空状态逻辑。

## Follow-up Fix - Review Visible Word Cap
- [x] 复现用户手测反馈：修复前 10 词 Review 在失败补救路径会显示目标外第 11 个词。
- [x] 移除新 Review session 的可见 reserve 选词，不再用目标外词给失败词做间隔。
- [x] `advanceToNextTarget` / `requeueWithDelay` 跳过 legacy non-goal buffer，避免旧 active session 继续显示目标外词。
- [x] active session store 恢复 Review snapshot 时清理 legacy buffer；如果当前卡片本身是 legacy buffer，则丢弃该 snapshot。
- [x] 补回归测试，断言 10 词 Review 可以重复失败词，但唯一可见词数不能超过 10。
- [x] 复跑 focused tests、lint、`git diff --check` 和浏览器 Review 路径。

## Task 5 - Focused QA And Handoff
- [x] 跑 focused unit/component tests：active session store、session engine、StudySession、WordbookDashboard、study panels。
- [x] 跑 focused lint。
- [x] 跑 `git diff --check`。
- [x] 用浏览器验证：
  - Learn 中途退出再继续。
  - Learn 刷新后继续。
  - Review 点“忘记了”后退出再继续。
  - Review complete 后回 dashboard 不再显示继续旧 session。
- [x] 更新 `progress.md` 和 `docs/README.md`。
- [x] 视手测结果决定是否提交 V2.1 checkpoint；不自动 merge 主线。

Acceptance:
- 用户手测不再感到“有状态但不完整”。
- 若仍有 session 恢复疑点，明确记录到 `progress.md` / `bugs.md`，不伪装成已完成。

## Execution Order
1. Task 0
2. Task 1
3. Task 2
4. Task 3
5. Task 4
6. Task 5

这个顺序的原因是：先把持久化边界独立出来，再接入 StudySession，随后补 Dashboard 的继续/重开入口，最后统一验证退出、刷新、完成和设置变更。

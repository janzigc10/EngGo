# Wordbook Learn/Review V2 Product Hardening Plan

## Goal
把已经手感成型的 Wordbook Learn/Review V1 推到更稳定的日常使用版本：补齐词书选择、复习调度语义、学习数据解释和边界恢复。范围仍然是 client-only，不进入聊天主舞台、账号系统或完整 SRS。

## Current Baseline
- Branch / worktree：`codex/wordbook-learn-review-v1` / `C:\tmp\enggo-worktrees\wordbook-learn-review-v1`
- 已完成依据：
  - `docs/superpowers/specs/2026-05-30-wordbook-learn-review-state-machine-design.md`
  - `docs/superpowers/specs/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
  - `docs/superpowers/plans/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
- 当前行为基线：
  - Learn 是三灯队列式推进。
  - Review 干净通过是一灯快速验收。
  - Review 失败仍留在 Review 内，走三灯补救链路。
  - Learn/Review 每组词数已有 10/20/30 本地设置。

## Non-Goals
- 不做完整 SRS 或真实记忆曲线产品化，只做可解释、可测试的轻量复习调度。
- 不新增全量商业词书、不导入大规模词库、不做自定义词书编辑器。
- 不做账号、云同步、多端同步或后端持久化。
- 不改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。
- 不做大 UI 视觉精修；必要 UI 只服务于状态可见和流程可用。
- 不重写已通过手测的 Learn/Review 核心三灯流程，除非测试暴露明确 bug。

## Task 0 - Baseline And Scope Lock
- [x] 重读本计划、`progress.md`、`docs/README.md` 和两个 Wordbook 有效 spec。
- [x] 确认 git 分支和 worktree 状态干净，记录当前 HEAD。
- [x] 跑当前 Wordbook focused tests，确认 V1 基线未坏。
- [x] 更新 `progress.md`，记录进入 V2 hardening 的验证基线。

Acceptance:
- 开工前能明确本轮只做四块硬化：词书选择、复习调度语义、数据解释、边界恢复。
- 若基线测试失败，停止进入 Task 1，先记录问题。

## Task 1 - Wordbook Selection Surface
- [x] 引入轻量 active wordbook 概念：默认仍是 `cet6-foundation-v1`。
- [x] Dashboard 或学习入口展示当前词书，并提供可扩展的词书选择入口。
- [x] 如果当前只有一本词书，不伪造大量内容；只保留“未来可注册多本词书”的数据结构和 UI 边界。
- [x] 确保 Learn/Review/session/progress 都从 active wordbook 取数据，不再隐式写死单本词书。
- [x] 补测试覆盖 active wordbook 默认值、非法值回退、progress/session 使用当前词书。

Acceptance:
- 用户能看见当前正在学哪本词书。
- 未来新增一本静态词书时，不需要重写 Learn/Review 状态机。
- 单本词书场景不增加多余操作成本。

## Task 2 - Review Scheduling Semantics
- [x] 把 Review 时间策略从零散计算收敛成命名 policy/helper。
- [x] 明确区分：
  - 新学通过后的首次复习时间。
  - Review 干净通过后的下一次复习时间。
  - Review 失败补救通过后的下一次复习时间。
  - Review 补救未完成时继续留在 due/review 队列的规则。
- [x] 保持“中档、够用、可解释”的策略，不引入复杂 SRS 参数。
- [x] 补测试覆盖 due 排序、clean pass、rescue pass、失败中断恢复和当天无 due 状态。

Acceptance:
- Review 为什么今天出现、为什么下次出现，有明确代码入口可解释。
- Review 失败不会掉回 Learn，但会按 Review-owned 补救规则重新完成三灯。
- 调度策略能通过测试而不是依赖手测记忆。

## Task 3 - Progress Explainability
- [x] 梳理 progress snapshot 的指标语义，避免 Dashboard 上只有“已学/总数”这种粗粒度信息。
- [x] 优先补齐以下状态的可见解释：
  - 未学习。
  - 学习中。
  - 待复习。
  - Review 补救中。
  - 已掌握或已阶段性通过。
- [x] 保持 session 进度语义不变：`completedTargetLemmas.length / totalTargets`。
- [x] 补测试覆盖 `buildWordbookProgressSnapshot` 或等价汇总逻辑。

Acceptance:
- 用户能大致理解“我现在为什么还有 Review / 为什么 Learn 数没变 / 为什么有补救词”。
- 不把曝光次数、详情页浏览或错误次数误算成完成词数。

## Task 4 - Recovery And Empty States
- [x] 覆盖 Learn 无可学词、Review 无到期词、词书已学完、只剩补救词等状态。
- [x] 检查刷新、退出、设置变更后的 session 恢复逻辑。
- [x] 确保 `reviewLapsed` / legacy `lapsed` / active session 三类状态有清晰恢复路径。
- [x] 补 UI 文案和测试，避免用户进入空白页或看不懂的“0 / 10”。

Acceptance:
- 用户在 `/learn` 或 `/review` 不会因为没有候选词卡住。
- 退出后回来能继续当前合理阶段，或明确看到无任务状态。
- 边界状态不破坏 V1 已验证流程。

## Task 5 - Focused QA And Handoff
- [x] 跑 Wordbook focused test bundle。
- [x] 跑 focused lint。
- [x] 跑 `git diff --check`。
- [x] 用浏览器在 390px 验证：
  - `/learn` 正常三灯完成。
  - `/review` clean pass。
  - `/review` 失败后三灯补救。
  - 无 due / 无 learnable empty state。
  - 10/20/30 设置不破坏分母。
- [x] 更新 `progress.md` 和 `docs/README.md`。
- [x] 视当时结果决定是否提交为 V2 checkpoint；不自动 merge 主线。

Acceptance:
- 代码、测试、浏览器手感和交接文档一致。
- 若仍有产品疑点，写入 `progress.md` 下一步或 `bugs.md`，不把不确定行为伪装成已完成。

## Suggested Execution Order
1. Task 0
2. Task 1
3. Task 2
4. Task 3
5. Task 4
6. Task 5

这个顺序的原因是：词书选择决定数据入口，复习调度决定 Review 队列，数据解释依赖前两者，边界恢复最后统一兜住各种状态。

# EngGo 滚动交接

## 当前阶段
已完成 Task 1 至 Task 7、fuzzy retrieval follow-up plan Step 1-6、形近词簇 P0 seed 扩样本，以及 `EngGo Answer Style + Root Family Map` implementation plan 的 Task 1-5。当前已经落地两条回答主线：

- `confusion_untangle`：形近词、易混词对比、group compare 统一进入“先问一句 / 分流 / 题里抓”的回答风格
- `root_family_summary`：先用最小原型闭环支撑 `stitute` / `tempt` 两族，保持保守范围

下一阶段不建议先继续堆词库；优先把 EngGo 的“解混淆语言”和回答风格定下来。新的路线文档已落盘：

- [docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md)
- [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)

当前下一刀已确定：先做“小批次真实 provider 的 answer-style smoke”，先验证真实模型输出是否真的像 EngGo，再决定是否扩第二批 root prototype。

核心判断：EngGo 至少要区分两条完全不同的主线：

- 易混解团：用户脑子里混着几个词，需要判断入口和做题分流。
- 词根家族地图：用户有词根/前缀/碎片，需要结构化展开和优先级。

## 本 Session 已完成
- 重新阅读并确认当前阶段入口文档与相关计划：
  - `progress.md`
  - `bugs.md`
  - `context.md`
  - `docs/superpowers/specs/2026-04-21-exam-english-chat-design.md`
  - `docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md`
  - `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md`
- 阅读真实 provider / eval 相关实现入口，确认下一刀可以复用现有链路，而不是先改 schema 或扩 root：
  - `src/features/answering/chat-provider.ts`
  - `src/features/answering/chat-provider.test.ts`
  - `src/features/answering/chat-service.ts`
  - `src/app/api/chat/route.ts`
  - `scripts/run-answer-style-eval.ts`
  - `scripts/run-chat-batch-eval.ts`
  - `scripts/run-shape-neighbor-eval.ts`
- 新建下一轮正式 implementation plan：
  - [docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md)
  - 目标：用 8-10 条真实 provider smoke 验证 `confusion_untangle` / `root_family_summary` / guarded `no_match` 的真实输出形态
  - 明确暂不做：第二批 root prototype、root schema、typo 闸门放宽、把真实 smoke 接进 `verify`
- 本次仅完成计划与交接更新，未运行新的代码测试或真实 provider 验证命令。

- 先按用户要求做了 checkpoint commit：
  - `40cc4a0 chore: checkpoint shape-neighbor p0 work`
- 完成 `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md` Task 1-5：
  - `src/features/answering/build-grounding.ts` 新增 `answerStyle` / `rootFamilyView`
  - `src/features/answering/build-system-prompt.ts` 按 `standard_lookup / confusion_untangle / root_family_summary` 分支出不同 prompt guardrails
  - `src/features/retrieval/normalize-query.ts` 新增保守的 `root_family_summary` query-mode 识别
  - 新增 [src/features/retrieval/root-family-prototypes.ts](/C:/Users/Chen/Desktop/EngGo/src/features/retrieval/root-family-prototypes.ts:1)，首批只覆盖 `root-stitute` / `root-tempt`
  - `src/features/retrieval/retrieve-candidates.ts` 新增 `handleRootFamilySummary`
  - `src/features/answering/chat-service.ts` 为 `root_family_summary + no_match` 增加“先不硬凑规律”的专属兜底文案
  - 新增 [scripts/run-answer-style-eval.ts](/C:/Users/Chen/Desktop/EngGo/scripts/run-answer-style-eval.ts:1) 和 `corepack pnpm eval:answer-style`
- 为新行为补齐并转绿测试 / eval：
  - `corepack pnpm test src/features/answering/build-system-prompt.test.ts`：3 passed
  - `corepack pnpm test src/features/answering/chat-service.test.ts`：4 passed
  - `corepack pnpm test src/features/retrieval/root-family-prototypes.test.ts`：4 passed
  - `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`：32 passed
  - `corepack pnpm eval:answer-style`：8 passed / 0 failed
  - `corepack pnpm eval:shape`：34 passed / 0 failed
- 同步更新了 `scripts/run-shape-neighbor-eval.ts` 的碎片输入预期：
  - `re+con 的词根有什么词` 现在是 `root_family_summary -> no_match`
  - 不再是旧的 `fuzzy_recall -> no_match`
- 这轮验收中再次撞到已知 Prisma dev 环境毛刺：
  - `corepack pnpm verify` 首次失败点：`src/features/content/seed-content.test.ts`
  - 现象：`Received unexpected commandComplete message from backend`
  - 处理：按 `bugs.md` 已知路径执行 `prisma dev rm enggo --force` -> `prisma dev -n enggo ...` -> `corepack pnpm db:migrate` -> `corepack pnpm db:seed`
  - 恢复后 `seed-content.test.ts` 和整轮 `verify` 均通过
- 本次接力先复跑健康基线：
  - `corepack pnpm exec prisma dev ls`：`enggo` running
  - `corepack pnpm exec tsx scripts/check-seed-content.ts`：82 entries / 31 confusion groups
  - `corepack pnpm eval:shape`：34 passed / 0 failed，平均耗时约 131ms
- 已按 `2026-04-23-enggo-confusion-taxonomy-roadmap.md` 创建正式 implementation plan：
  - [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)
  - 第一阶段限定为 answer style / query mode / minimal root prototype / deterministic eval
  - 明确不新增 root 数据表、不扩 P1 seed、不放宽 `reqeust` / `recomand` typo 闸门
- 已阅读相关代码入口并把计划落到具体文件：
  - `src/features/answering/build-system-prompt.ts`
  - `src/features/answering/build-grounding.ts`
  - `src/features/answering/chat-service.ts`
  - `src/features/retrieval/normalize-query.ts`
  - `src/features/retrieval/retrieve-candidates.ts`
  - `scripts/run-shape-neighbor-eval.ts`
- 按交接先复跑基线：
  - `corepack pnpm exec prisma dev ls`：`enggo` running
  - `corepack pnpm db:seed`：成功
  - `corepack pnpm eval:shape`：初始基线 9 passed / 0 failed
- 创建下一轮 implementation plan：
  - [docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md)
  - 选择候选池 P0 全部 20 组入 seed，P1 暂不碰
- 按 TDD 红灯先加覆盖：
  - `scripts/run-shape-neighbor-eval.ts` 新增 25 个 P0 case：5 个 shape-neighbor list/misread case + 20 个 direct compare case
  - `src/features/retrieval/retrieve-candidates.test.ts` 新增 2 个 P0 集成测试：`access / assess / excess` 和 `breath / breathe`
  - 加 seed 前验证红灯：`eval:shape` 9 passed / 25 failed；retrieval test 24 passed / 2 failed，失败原因均为缺 seed grounding / comparisonView
- 完成 P0 seed 扩样本：
  - `data/exam-vocab/seed/entries.json` 新增 43 个词条
  - `data/exam-vocab/seed/confusion-groups.json` 新增 20 个 P0 confusion groups
  - 当前 seed 规模：82 entries / 31 confusion groups
  - 覆盖范围仍包含 gaokao / cet4 / cet6 / postgrad
- 修复扩样本后暴露的测试性能问题：
  - `corepack pnpm verify` 首次在 `src/features/content/seed-content.test.ts` 超时失败
  - 根因：该测试原本加载完整 seed 作为 broken fixture，P0 扩样本后执行时间超过 Vitest 默认 5s
  - 修复：改成最小 broken seed fixture，不再依赖完整 seed 数据量
  - 默认超时下该测试从 5s timeout 降到约 0.8s 通过
- 更新并勾选 P0 implementation plan 的已完成步骤。
- 结合真实 MiniMax smoke 和 DeepSeek 分享内容，整理下一阶段路线：
  - DeepSeek 的 `stitute` / `tempt` / `re- + con- 同根` 词根地图有参考价值，但太容易发散。
  - EngGo 应吸收“构词故事”和“不要硬凑规律”，同时收束成考试导向的结构化地图。
  - 明确新增混淆 taxonomy：形近解团、词根地图、中文同义分流、词性派生树、搭配锁、前缀方向图、发音近似、碎片召回、场景错配、逻辑关系。

## 当前结果
- 形近词簇 seed 从 39 entries / 11 groups 扩到 82 entries / 31 groups。
- 回答编排层现在有 3 种明确风格：
  - `standard_lookup`
  - `confusion_untangle`
  - `root_family_summary`
- `root_family_summary` 目前只做最小原型闭环：
  - `stitute 是什么` -> `root-stitute` resolved
  - `tempt 这一族怎么记` -> `root-tempt` resolved
  - `re+con 的词根有什么词` -> `root_family_summary` 命中，但仍返回 `no_match`
- P0 新增组：
  - `access / assess / excess`
  - `advice / advise`
  - `accept / except`
  - `aboard / abroad`
  - `angel / angle / ankle`
  - `assure / ensure / insure`
  - `complement / compliment`
  - `principal / principle`
  - `personal / personnel`
  - `economic / economical`
  - `conscious / conscience`
  - `precede / proceed`
  - `perspective / prospective`
  - `historic / historical`
  - `sensible / sensitive`
  - `considerable / considerate`
  - `stationary / stationery`
  - `device / devise`
  - `loose / lose`
  - `breath / breathe`
- 当前形近词簇闭环仍复用现有数据结构：query mode -> `confusion_group` -> retrieval result -> grounding/prompt -> UI 多主答案展示。
- 未新增表、未新增 `kind` 字段、未改变 UI 结构。
- 未新增 root Prisma schema / table；root family 仍是代码内 prototype，不是长期数据模型。

## 剩余关注点
1. `root_family_summary` 目前只覆盖 `stitute` / `tempt` 两族，仍然是验证回答形态的最小原型，不是可扩展数据方案。
2. `re+con`、`re...ct` 这类输入虽然已经进入 `root_family_summary` 主线，但仍是保守 `no_match`，没有真正展开检索。
3. `reqeust` / `recomand` 这类 typo 仍需要单独设计，不能简单放宽当前低置信度闸门。
4. 真实 MiniMax `/anthropic/v1/messages` 已通过临时命令跑通；正式接入前仍建议补 Anthropic-compatible provider adapter，并用真实 provider 做一次 answer-style smoke。
5. Windows + local Prisma Postgres (`prisma dev`) 仍不稳定；这轮 `verify` 过程中又复现了 backend protocol error，但已按 `bugs.md` 路径恢复。
6. `corepack pnpm exec tsc --noEmit` 这轮仍未重跑；此前已知失败，属于既有工程债，不纳入本轮完成标准。

## 下一 Session 第一件事
- 先读并确认：
  - [docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md)
  - [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)
  - 该 plan 现在已经执行完成；下轮不要再从 Task 1 重开。
- 下一刀不要再二选一摇摆；先按新 plan 做真实 provider smoke：
  - 用真实 provider 做 8-10 条 answer-style smoke，检查 `confusion_untangle` / `root_family_summary` / guarded `no_match` 输出是否真的像 EngGo
  - 只有 smoke 结果稳定后，再决定是补 prompt guardrail、补 provider adapter，还是扩第二批 root prototype
- 若继续本地验证，先检查 `corepack pnpm exec prisma dev ls`；一旦出现 backend protocol error，直接按 `bugs.md` 的 `enggo` 重建路径恢复。
- 继续保持串行验证；不要并行跑 `verify`、`eval:shape`、`eval:answer-style`、`eval:answer-style:provider`。

## 当前阻塞 / 风险
- 当前没有 shape-neighbor 测试阻塞。
- 不建议本地并行跑 `verify` 和 `eval:shape` 这类会访问 Prisma dev 的命令。
- 真实模型 batch eval 仍受 provider key、dev server、MiniMax 429 影响。
- 若下一轮继续扩 seed，`seed-content.test.ts` 已改为最小 fixture，应不再随 seed 规模线性变慢；若再次超时，先按 `bugs.md` 的 Prisma dev 健康检查路径排查。

## 最近验证基线
- `corepack pnpm exec prisma dev ls`
  - 当前状态：`enggo` running
- `corepack pnpm db:seed`
  - 当前状态：通过
- `corepack pnpm exec tsx scripts/check-seed-content.ts`
  - 当前状态：82 entries / 31 confusion groups
- `corepack pnpm eval:shape`
  - 当前状态：34 passed / 0 failed，平均耗时约 127ms
- `corepack pnpm eval:answer-style`
  - 当前状态：8 passed / 0 failed，平均耗时约 112ms
- `corepack pnpm test src/features/answering/build-system-prompt.test.ts`
  - 当前状态：3 passed / 3 passed
- `corepack pnpm test src/features/answering/chat-service.test.ts`
  - 当前状态：4 passed / 4 passed
- `corepack pnpm test src/features/retrieval/root-family-prototypes.test.ts`
  - 当前状态：4 passed / 4 passed
- `corepack pnpm test src/features/content/seed-content.test.ts`
  - 当前状态：1 passed / 1 passed
- `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`
  - 当前状态：32 passed / 32 passed
- `corepack pnpm exec eslint src/features/answering/build-grounding.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/retrieval/normalize-query.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/retrieval/root-family-prototypes.ts src/features/retrieval/root-family-prototypes.test.ts src/features/retrieval/types.ts scripts/run-answer-style-eval.ts scripts/run-shape-neighbor-eval.ts`
  - 当前状态：通过
- `corepack pnpm verify`
  - 当前状态：通过（lint、unit、integration、默认 Chromium E2E 均通过）
- `corepack pnpm exec tsc --noEmit`
  - 当前状态：本 session 未重跑；此前已知失败，集中在既有测试 fixture 类型收窄、`use-chat-session` 响应联合类型、`pg` ESM 声明缺失和其连带 row 隐式 any

# EngGo 滚动交接

## 当前阶段
已完成 Task 1 至 Task 7、fuzzy retrieval follow-up plan Step 1-6，以及形近词簇 P0 seed 扩样本首轮。当前形近词簇能力已经从 3 个新组扩到 P0 全部 20 组，并通过 retrieval / eval / verify 验证。

下一阶段不建议先继续堆词库；优先把 EngGo 的“解混淆语言”和回答风格定下来。新的路线文档已落盘：

- [docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md)
- [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)

核心判断：EngGo 至少要区分两条完全不同的主线：

- 易混解团：用户脑子里混着几个词，需要判断入口和做题分流。
- 词根家族地图：用户有词根/前缀/碎片，需要结构化展开和优先级。

## 本 Session 已完成
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

## 剩余关注点
1. `EngGo Answer Style + Root Family Map` implementation plan 已创建；下一步按该 plan 从 Task 1 Step 1 开始，不要先继续 P1 扩样本。
2. 词根 / 碎片检索仍未实现，`re+con`、`re...ct` 这类输入仍是 deferred；但路线已明确为 `root_family_summary` 主线。
3. `reqeust` / `recomand` 这类 typo 仍需要单独设计，不能简单放宽当前低置信度闸门。
4. 真实 MiniMax `/anthropic/v1/messages` 已通过临时命令跑通；key 未写入文件。正式接入前建议补 Anthropic-compatible provider adapter。
5. Windows + local Prisma Postgres (`prisma dev`) 仍不稳定；本 session 真实模型 smoke 前曾触发 `Connection terminated unexpectedly`，已按 `bugs.md` 路径重建并恢复。
6. `corepack pnpm exec tsc --noEmit` 本 session 未重跑；此前已知仍失败，剩余是既有工程债，不属于本轮 P0 shape-neighbor 回归。

## 下一 Session 第一件事
- 先读并严格执行：
  - [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)
- 从 `Task 1: Add Answer Style Contract And Prompt Guardrails` 的 `Step 1` 开始，先写 failing prompt tests。
- 每完成一个 step，立即把 plan 中对应 `- [ ]` 改成 `- [x]`。
- 执行时保持串行验证；不要并行跑 `verify`、`eval:shape`、`eval:answer-style` 这类会访问 Prisma dev 或完整链路的命令。
- 本阶段仍不新建 root 数据表，不扩 P1 seed，不放宽 typo 闸门。

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
  - 当前状态：34 passed / 0 failed，平均耗时约 131ms
- `corepack pnpm test src/features/content/seed-content.test.ts`
  - 当前状态：1 passed / 1 passed
- `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`
  - 当前状态：26 passed / 26 passed
- `corepack pnpm exec eslint scripts/run-shape-neighbor-eval.ts src/features/retrieval/retrieve-candidates.test.ts`
  - 当前状态：通过
- `corepack pnpm verify`
  - 当前状态：通过（lint、unit、integration、默认 Chromium E2E 均通过）
- `corepack pnpm exec tsc --noEmit`
  - 当前状态：本 session 未重跑；此前已知失败，集中在既有测试 fixture 类型收窄、`use-chat-session` 响应联合类型、`pg` ESM 声明缺失和其连带 row 隐式 any

# EngGo 文档索引

## 必读入口
- `README.md`：面向 GitHub 访问者和招聘方的项目介绍。
- `AGENTS.md`：协作入口、高频规则、当前焦点。
- `progress.md`：滚动交接，只看当前阶段、下一步、阻塞和最新验证基线。
- `bugs.md`：本地环境坑、产品残留、防回归提醒。
- `context.md`：长期项目地图和代码地图。

## 当前有效设计
- `docs/superpowers/specs/2026-05-10-fastapi-backend-split-design.md`
  - Python FastAPI 后端拆分设计：Next 前端保留，`/api/chat` 当前默认代理 FastAPI；`ENGGO_BACKEND_URL` 仅用于覆盖默认后端地址。
- `docs/superpowers/specs/2026-05-09-ecdict-basic-lookup-design.md`
  - ECDICT 外部基础释义源、词/连字符词/短语边界，以及普通查词的 source priority。
- `docs/superpowers/specs/2026-05-01-answer-policy-v1.md`
  - 当前 answer policy 产品原则：范围优先，不范围专制。
- `docs/superpowers/specs/2026-04-30-chat-answer-display-tools.md`
  - 聊天回答展示、命中状态、收藏工具折叠。
- `docs/superpowers/specs/2026-05-11-source-aware-chat-support-panel-design.md`
  - FastAPI 迁移后，聊天支持面板区分结构化词条、来源词表命中和外部基础词典释义。
- `docs/superpowers/specs/2026-04-27-root-fragment-condition-parser.md`
  - 结构化词形过滤：`prefix / suffix / contains / start_end / ordered_contains`。
- `docs/superpowers/specs/2026-04-25-confusion-cluster-layering-design.md`
  - 易混词层次和回答组织方向。
- `docs/superpowers/specs/2026-04-21-exam-english-chat-design.md`
  - 初始产品设计。
- `docs/superpowers/specs/2026-04-21-enggo-technical-architecture-design.md`
  - 初始技术设计。

## 已完成或历史计划
这些 plan 大多已经执行完成。继续任务时不要从 Task 1 重开，除非用户明确要求复盘或重做。

- `docs/superpowers/plans/2026-05-01-answer-policy-v1.md`
  - Answer Policy v1 loosening spike，已完成。
- `docs/superpowers/plans/2026-05-09-ecdict-basic-lookup.md`
  - ECDICT basic profile 与 source-lemma 普通查词接入，已完成。
- `docs/superpowers/plans/2026-05-10-fastapi-backend-split-stage-1.md`
  - FastAPI 后端拆分 Stage 1：FastAPI contract、health/chat 契约、Next optional proxy，已完成。
- `docs/superpowers/plans/2026-05-10-fastapi-backend-split-stage-2.md`
  - FastAPI 后端拆分 Stage 2：普通 exact lookup / source lemma / ECDICT basic / ordinary no-match 最小切片，已完成；compare/root/fragment/provider 仍留在后续阶段。
- `docs/superpowers/plans/2026-05-10-fastapi-full-chat-backend-migration.md`
  - FastAPI 全量 `/api/chat` 迁移，已完成；Next `/api/chat` 已默认代理 FastAPI，默认地址为 `http://127.0.0.1:8000`。
- `docs/superpowers/plans/2026-05-11-fastapi-dev-workflow-hardening.md`
  - FastAPI-first 开发启动、默认 smoke 和 legacy TypeScript 后端边界固化，已完成。
- `docs/superpowers/plans/2026-05-11-source-aware-chat-support-panel.md`
  - 聊天支持面板来源感知与收藏说明，已完成。
- `docs/superpowers/plans/2026-04-30-chat-answer-display-tools.md`
  - 聊天回答展示第二刀，已完成。
- `docs/superpowers/plans/2026-04-27-root-fragment-condition-parser.md`
  - root fragment condition parser，已完成。
- `docs/superpowers/plans/2026-04-26-black-box-product-smoke.md`
  - 黑盒产品 smoke，已完成。
- `docs/superpowers/plans/2026-04-26-real-smoke-foundation-vocab-batch-3.md`
  - `real-smoke` batch 3，已完成。
- `docs/superpowers/plans/2026-04-24-real-vocab-scope-aware-lookalike-smoke.md`
  - source-backed real vocab + lookalike smoke，已完成。
- `docs/superpowers/plans/2026-04-24-real-smoke-foundation-vocab-expansion.md`
  - `real-smoke` 初始扩库，已完成。
- `docs/superpowers/plans/2026-04-24-real-smoke-foundation-vocab-batch-2.md`
  - `real-smoke` batch 2，已完成。
- `docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md`
  - answer-style provider smoke，已完成。
- `docs/superpowers/plans/2026-04-25-confusion-cluster-v1.md`
  - confusion cluster v1，已完成。
- `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md`
  - answer style + root map，已完成。
- `docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md`
  - confusion taxonomy roadmap，历史路线。
- `docs/superpowers/plans/2026-04-23-enggo-fuzzy-retrieval-followup.md`
  - fuzzy retrieval follow-up，历史路线。
- `docs/superpowers/plans/2026-04-23-shape-neighbor-candidate-pool.md`
  - shape-neighbor 候选池，历史路线。
- `docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md`
  - P0 形近词 seed 扩样，已完成。
- `docs/superpowers/plans/2026-04-21-enggo-chat-mvp.md`
  - 早期聊天 MVP，已完成。

## 个人成长复盘
- `docs/engineering-growth-log.md`
  - 只在个人成长复盘、简历素材或沟通方式总结相关任务中读取。
  - 不作为当前实现状态依据。

## 维护规则
- 新的长期产品结论写入 `context.md` 或相关 spec。
- 新的当前状态和下一步写入 `progress.md`。
- 新的环境坑、失败方案和延期项写入 `bugs.md`。
- 新的多步实现任务先写 spec / plan，再执行。
- 已完成 plan 保留历史，不反复从 Task 1 重开。

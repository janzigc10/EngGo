# EngGo 文档索引

## 必读入口
- `README.md`：面向 GitHub 访问者和招聘方的项目介绍。
- `AGENTS.md`：协作入口、高频规则、当前焦点。
- `progress.md`：滚动交接，只看当前阶段、下一步、阻塞和最新验证基线。
- `bugs.md`：本地环境坑、产品残留、防回归提醒。
- `context.md`：长期项目地图和代码地图。

## 当前有效设计
- `docs/superpowers/specs/2026-05-18-ecdict-backbone-structured-overlay-design.md`
  - 最新词库主干方向：ECDICT 作为默认大词库底座，旧 structured DB 降级为冻结覆盖层 / 回归样例 / 可选增强；后续只做轻量人工 override，不再维护全量复杂结构化词库。
- `docs/superpowers/specs/2026-05-12-dynamic-light-grounding-design.md`
  - 8k 词库后的 dynamic light grounding 设计：用动态候选 grounding 接管泛问主流程，旧 `confusion_group` / `root_family` 只做 boost、fixture 和 regression baseline。
- `docs/superpowers/specs/2026-05-16-collection-organizer-design.md`
  - 学习闭环第一刀：把聊天收藏沉淀为可整理的本地生词本，保留结构化元数据、删除和回到聊天追问入口。
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

## 当前活跃计划
- 暂无。

## 已完成或历史计划
这些 plan 大多已经执行完成。继续任务时不要从 Task 1 重开，除非用户明确要求复盘或重做。

- `docs/superpowers/plans/2026-05-20-meaning-lookup-scope-tag-filter.md`
  - 中译英 / `meaning_lookup` 的 ECDICT 当前 scope tag 主答案过滤已完成：`gre` / 无标签候选不再进入 `gaokao` 等当前词书的 meaning lookup main answer；普通英文 lookup 继续保持全局 ECDICT fallback。Task 4 未新增 smoke case，原因是稳定断言已有 fixture pytest 覆盖，而新增 real smoke 需要同步改精确矩阵测试。
- `docs/superpowers/plans/2026-05-19-p1-intent-regression-fixes.md`
  - 三个最新 P1 intent regression 已完成：中译英表达召回清理请求噪声并回到 ECDICT-first grounding；A/B 很像集合召回优先 `shape_neighbor_search` 且保留 focused compare；英文 seed 拓展词/相关词措辞进入 `word_family`，同时排除语义近邻、写作、搭配、翻译、同义/近义等非词族意图。
- `docs/superpowers/plans/2026-05-19-remove-structured-runtime-flow.md`
  - structured runtime 默认移出实验已完成：保留旧 structured 数据，但默认运行链路改为 ECDICT-first + `NullStructuredLookupRepository`；structured overlay 仅在显式 `ENGGO_USE_STRUCTURED_RUNTIME=1` 时启用，并已用 bad-DB/no-DB smoke 覆盖 exact lookup、direct compare、shape neighbor、word family、fragment/root 和 meaning lookup。
- `docs/superpowers/plans/2026-05-18-ecdict-backbone-db-fallback-and-shape-intent.md`
  - ECDICT 主底座 DB fallback 与 shape intent 计划已完成：ordinary lookup 在 structured DB 不可用时继续走 ECDICT/source fallback，plain “像 X 的词”学生问法归到 shape-neighbor / broad recall，并已补 focused no-DB smoke 覆盖 ordinary lookup、direct compare、broad fragment 和 plain similar-word wording。
- `docs/superpowers/plans/2026-05-17-student-intent-normalization.md`
  - 学生式意图归一化计划已完成：few-shot 风格样例已固化为 deterministic intent matrix 和 Next proxy smoke，覆盖 `con开头表示共同或一起`、`e开头表示评估评价`、`表示限制或约束的con开头单词`、`desert dessert 还有没有相似的词`、`sign这组词怎么背`、`sign的派生词有哪些`、`produce的同根词或派生词`、`pre开头表示提前或预先的单词`，并保护普通 exact lookup 不回流到 broad vocab。
- `docs/superpowers/plans/2026-05-17-learning-intent-plan.md`
  - 学习意图层实现计划已完成：`normalize_query` 现在附带 `LearningIntentPlan`，dynamic grounding 消费硬约束和扩展策略，broad answer plan 按任务输出 strict inventory / teacher table / word-family table / shape-neighbor table，并已通过 direct FastAPI 与 Next proxy migrated smoke。
- `docs/superpowers/plans/2026-05-15-broad-vocab-confusion-organizer.md`
  - Broad vocab 易混词整理第二刀：把 `collection_map` 从 loose learning map 收敛为“先易混核心组，再补充同形候选”的回答契约，已完成；只改 broad answer 计划/提示和回归句柄，未改普通 `standard_lookup` 模板。
- `docs/superpowers/plans/2026-05-16-collection-organizer.md`
  - 收藏生词本整理 1.0：localStorage 收藏元数据升级、收藏页删除/来源展示/继续追问入口、聊天 draft 预填，已完成。
- `docs/superpowers/plans/2026-05-12-dynamic-light-grounding.md`
  - Dynamic light grounding 第一刀实现计划：后端动态候选 builder、`broad_vocab_summary` grounding、direct compare / advanced lookup 接入，已完成。
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
- `docs/superpowers/plans/2026-05-11-compact-chat-support-panel.md`
  - 聊天支持面板轻量化：来源提示一行化、单候选收藏动作紧凑化，已完成。
- `docs/superpowers/plans/2026-05-11-grounding-strategy-probe.md`
  - 学生泛问场景下 current grounded / model direct / light grounding + model 三路对比实验，已完成。
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

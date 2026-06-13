# EngGo 文档索引

## 必读入口
- `README.md`：面向 GitHub 访问者和招聘方的项目介绍。
- `AGENTS.md`：协作入口、高频规则、当前焦点。
- `progress.md`：滚动交接，只看当前阶段、下一步、阻塞和最新验证基线。
- `bugs.md`：本地环境坑、产品残留、防回归提醒。
- `context.md`：长期项目地图和代码地图。

## 当前有效设计
- `docs/superpowers/specs/2026-06-12-app-shell-redesign-v1-design.md`
  - 当前前端 UI 重设计方向：顶部不再放主导航；左上角三条杠 / 左滑打开抽屉，抽屉只放 `Today / Learn / Review / Chat`；底部只放一个词书图标，进入 `/wordbook`；词书页集中承载词书切换、学习设置、总词数、已学、复习次数和每日背词量曲线；`Progress` 从主导航退役，数据并入词书详情页。具体风格定为 Ink Amber：冷白背景、墨黑主文字 / 主按钮、少量 amber 强调。V1 保持 client-only，不改 Learn / Review 状态机，不做强制 daily priority。
- `docs/superpowers/specs/2026-06-07-affix-semantic-gate-v1-design.md`
  - 当前活跃设计：按用户意图区分“字母开头 / 结尾”和“前缀 / 后缀真的表达某个意思”。`anti 开头` 是词形问题，`anti 表示反对` 是词缀语义问题；语义题主答案必须有释义证据，不能只靠 `startsWith` / `endsWith`。
- `docs/superpowers/specs/2026-06-07-frontend-direct-fastapi-v1-design.md`
  - 当前活跃架构收口设计：Next.js 保留为 React 前端壳，浏览器聊天请求通过 `NEXT_PUBLIC_ENGGO_FASTAPI_URL` 直连 FastAPI `/api/chat`；Next `/api/chat` proxy 退役，默认验证路径改为 FastAPI direct。
- `docs/superpowers/specs/2026-06-05-ecdict-tag-scope-closure-design.md`
  - 当前活跃设计：直接使用 ECDICT exam tags 作为词书事实源，前端词书和聊天检索统一走 scope closure。`gaokao` 只含高考基础词，`cet4` 继承高考，`cet6` 继承高考 + CET-4，`postgrad` 继承高考 + CET-4 + CET-6 + 考研；词条数据保留直接 tag 来源，不把继承结果写回原始 `examScopes`。`anti` / `sub` / `re` 等词缀语义纯度已由 `2026-06-07-affix-semantic-gate-v1-design.md` 单独收口。
- `docs/superpowers/specs/2026-06-03-model-assisted-intent-routing-v1-design.md`
  - 当前活跃设计：不做完整 ReAct Agent；在 Controlled Tool Router V1 上新增规则置信度、灰区 provider classifier、参数来源校验、semantic expression 分支和 grounding / observation 质量闸门。目标是让明确查词/辨析继续走确定性规则，让 `more formal way to say...`、`同义词/近义词`、`还有更适合作文的吗` 这类灰区由模型辅助识别，但最终仍由代码验收参数和工具证据。
- `docs/superpowers/specs/2026-06-01-controlled-tool-router-v1-design.md`
  - 当前已完成的类 Agent 化第二步：不引入完整 LangChain / LangGraph，不做开放 agent；先把已有 ordinary lookup、direct compare、advanced lookup 抽成统一内部 tool 协议，用 rule-first route planner 显式决定工具顺序，并继续复用上一版的自然续问与 no-match recovery。V1 不对每轮都新增 provider intent-classification 调用，避免延迟和误判面过早扩大。
- `docs/superpowers/specs/2026-06-01-controlled-chat-orchestrator-v1-design.md`
  - 当前类 Agent 化设计：不引入完整 LangChain / LangGraph，不做开放 agent；在现有查词、辨析、语义检索和上下文能力外加一层受控 orchestrator，优先解决 hard no-match 和自然多轮追问断片。稳定 exact lookup / direct compare 继续保留，no-match 和弱续接路径先进入 provider-backed recovery 或 bounded clarification。
- `docs/superpowers/specs/2026-06-01-ecdict-grounded-direct-compare-design.md`
  - 当前 direct compare 设计：不再依赖人工 `quickDistinction`、confusion graph 或人工 pair/group 元数据作为主能力；用户问两个英文词区别时，优先解析用户明确提到的词，使用 ECDICT-backed candidates 作为 grounding，让 provider 组织短中文辨析；provider 不可用或失败时只退回干净的并列词典释义。已有人工组最多保留为历史数据，不再作为 direct compare 扩展策略。
- `docs/superpowers/specs/2026-05-31-ecdict-backed-wordbook-expansion-design.md`
  - 历史背词内容扩展设计：Wordbook Learn/Review 状态机不重做，默认词书继续使用 `cet6-foundation-v1` ID；后续已由 `2026-06-05-ecdict-tag-scope-closure-design.md` 修正为直接使用 ECDICT exam tags 生成 compact JSON，不再以 source lemma manifests 作为当前词书事实源。
- `docs/superpowers/specs/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
  - Wordbook Learn/Review 已落地的体验打磨设计：聚焦学习节奏、Learn 三灯失败不降级、三灯详情分层、Review 干净通过一灯快速验收、Review 失败后留在 Review 内走四选一 + 带提示回忆 + 无提示最终确认三灯补救链路、错因对比页，以及学习设置里的每组学习/复习词数 10/20/30 三档。本轮不做 UI 精修、完整 SRS、账号同步、全量词书或主线 merge。
- `docs/superpowers/specs/2026-05-30-wordbook-learn-review-state-machine-design.md`
  - 当前词汇学习主线设计：借鉴不背单词的产品内核，但只抄 Learn / Review 两条队列背后的状态机；第一刀做 `cet6-foundation-v1` 词书、10 词 session、四选一新词识别、无提示复习判断、错误回流、3 点掌握进度和本地持久化，不复制商业词书内容、视觉资产或完整 SRS。
- `docs/superpowers/specs/2026-05-30-vocabulary-learning-first-direction.md`
  - 产品方向调整记录：聊天/模型多轮调试进入维护状态，下一阶段转向“词汇学习主流程 + AI 辅助入口”。其中“先做本地生词本复习闭环”的第一判断已被 `2026-05-30-wordbook-learn-review-state-machine-design.md` 修正为“先做词书驱动 Learn / Review 状态机”。
- `docs/superpowers/specs/2026-05-24-conversational-learning-context-design.md`
  - 聊天主舞台下一层核心能力：设计短期会话上下文、追问解析、resolved query routing、UI 上下文提示、失败反问和阶段拆分；当前已完成到 V3，后续进入维护状态，不再作为近期主线继续深挖模型多轮能力。
- `docs/superpowers/specs/2026-05-18-ecdict-backbone-structured-overlay-design.md`
  - 最新词库主干方向：ECDICT 作为默认大词库底座，旧 structured DB 降级为冻结覆盖层 / 回归样例 / 可选增强；后续只做轻量人工 override，不再维护全量复杂结构化词库。
- `docs/superpowers/specs/2026-05-12-dynamic-light-grounding-design.md`
  - 8k 词库后的 dynamic light grounding 设计：用动态候选 grounding 接管泛问主流程，旧 `confusion_group` / `root_family` 只做 boost、fixture 和 regression baseline。
- `docs/superpowers/specs/2026-05-16-collection-organizer-design.md`
  - 收藏页基础设计：把聊天收藏沉淀为可整理的本地生词本，保留结构化元数据、删除和回到聊天追问入口；它仍是学习资产来源之一，但不再是下一阶段核心背词流程的第一刀。
- `docs/superpowers/specs/2026-05-10-fastapi-backend-split-design.md`
  - Python FastAPI 后端拆分设计：Next 前端保留；2026-06-07 后 Next `/api/chat` proxy 已退役，浏览器默认直连 FastAPI。
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

## 当前计划状态
当前没有正在执行中的实现计划。下面几项是最近完成或仍作为防回归边界的计划，继续任务时不要从 Task 1 重开。

- `docs/superpowers/plans/2026-06-13-app-shell-redesign-v1.md`
  - 已完成实现计划：按 `2026-06-12-app-shell-redesign-v1-design.md` 落地 App Shell Redesign V1。已完成 Ink Amber app shell、抽屉式主导航、底部词书图标、Today/Chat/Wordbook 路由迁移、Learn/Review UI 收口、daily stats/词书数据页，并已补齐 Chat、Collections 兼容流的 Ink Amber 视觉断层。Focused tests、lint/build、Playwright route slice，以及 Browser/Computer Use 桌面和 390px 移动端 QA 均已通过。后续如继续，只做非阻塞 housekeeping，例如真实 icon package 或删除未使用旧入口，不要重开 IA。

- `docs/superpowers/plans/2026-06-07-structured-legacy-data-cleanup-v1.md`
  - 已完成清理计划：在 FastAPI + ECDICT wordbook 成为当前主线后，迁走 `real-smoke` 中仍有价值的少量人工 root-family 内容，退役 Prisma schema/migrations/seed、旧 TypeScript seed/repository 路径、旧 `real-smoke` 数据集和过时的 `eval:product-smoke` gate。保留 ECDICT wordbook、source lemma manifests 和 FastAPI 直接读取的 `data/exam-vocab/seed` curated 内容。
- `docs/superpowers/plans/2026-06-07-affix-semantic-gate-v1.md`
  - 本轮已完成计划：实现 Affix Semantic Gate V1，让 `anti / re / sub / trans` 等前缀和 `-less / -er` 等后缀查询先按意图区分词形与含义；词缀语义题的主答案必须同时满足拼写和释义证据，`antique`、`reconcile`、`water`、`administer` 这类只长得像或只有偶然释义噪声的词不能冒充语义命中。
- `docs/superpowers/plans/2026-06-07-frontend-direct-fastapi-v1.md`
  - 已完成架构收口计划：让浏览器聊天请求直接调用 FastAPI，删除 Next `/api/chat` proxy，补 CORS、direct smoke 和文档交接；不迁移 Vite React，不后端化 Learn / Review / Progress。
- `docs/superpowers/plans/2026-06-07-legacy-ts-backend-cleanup-v1.md`
  - 已完成清理计划：FastAPI 迁移后退役 legacy TypeScript retrieval / answering 后端实现，保留 Next 前端壳、FastAPI HTTP smoke、provider smoke 和 ECDICT wordbook 生成工具；当时暂留的 Prisma schema / seed 历史路径已由 `2026-06-07-structured-legacy-data-cleanup-v1.md` 接手退役。
- `docs/superpowers/plans/2026-06-05-ecdict-tag-scope-closure-v1.md`
  - 已完成范围收口计划：把 ECDICT tag-derived scope closure 作为 Learn / Review / Progress / Chat 的统一词书 membership，修复 CET-6 不继承高考 / CET-4 基础词导致的 `activity` 漏召回，并补 backend / frontend / E2E 防回归覆盖。2026-06-07 已追加清理 legacy TypeScript retrieval / answering 后端实现；后续验收不再依赖 Prisma-backed TS retrieval integration。
- `docs/superpowers/plans/2026-06-04-meaning-lookup-weak-resolved-quality-gate-v1.md`
  - 已完成质量闸门计划：给 `meaning_lookup` 增加弱候选质量闸门，防止 `表达观点`、`遵循`、`限制` 这类中译英 / 表达召回问题在只有偏离候选时仍被标成 source-backed `resolved`。本轮没有扩大 hard `no_match`，而是优先让 strong preferred candidates 进入 grounded resolved；只有 weak expression-like 且无强候选时才降级为 provider-assisted / bounded plain advice。
- `docs/superpowers/plans/2026-06-03-model-assisted-intent-routing-v1.md`
  - 最近完成计划：规则高置信路径直接执行；规则灰区才调用 provider 产出受限 intent / slots；代码校验 terms、style、context provenance；semantic expression / style follow-up 用受控工具承接；broad grounding 增加弱候选质量闸门，并输出 before/after comparison matrix 证明真实增强。

## 当前验收报告
- `docs/superpowers/reports/2026-06-04-meaning-lookup-quality-gate-v1-comparison.md`
  - Meaning Lookup Quality Gate V1 的 before/after matrix 摘要：36 total / 36 pass / 0 fail / 23 changed。关键差异包括 `表达观点的英文是什么` 从 `hiss` 变成 `express / state / voice / represent`，`遵循的英文是什么` 从 `disobedience / subdue / unwilling` 变成 `follow / observe / comply / obey / abide`，`限制的英文是什么` 从 `bridle` 变成 `restrict / limit / constrain`，`遵守规则用英文怎么说` 从 clear_context 变成 `follow / observe / comply / obey / abide`，`负责 / 承担责任` 从 `provost` 变成 `responsible / liable`。
- `docs/superpowers/reports/2026-06-03-model-assisted-intent-routing-v1-comparison.md`
  - 最近完成报告：Model-assisted Intent Routing V1 的 before/after matrix 与验证记录，覆盖 23 条 stable / regression probe / expected improvement E2E，包括 `formal 是什么意思` 防误伤、`more formal way to say follow`、`同义词/差不多意思`、`anti+dis` / `pre+sub` weak resolved、`还有更适合作文的吗` style follow-up，以及稳定路径防回归。

## 最近完成计划
- `docs/superpowers/plans/2026-06-01-controlled-tool-router-v1.md`
  - 受控工具路由层 V1 已完成：把 `/api/chat` 里的隐式 service loop 改成显式内部 tool route plan，保持 existing services 和 orchestrator 行为，提高入口结构可测性与后续模型分类扩展能力；浏览器 E2E 还修正了 `vs / versus / or` 被当作 compare 候选词的问题。
- `docs/superpowers/plans/2026-06-01-controlled-chat-orchestrator-v1.md`
  - 当前最近完成计划：受控类 Agent 聊天链路 V1 已从文档到代码、focused tests、smoke 和 in-app Browser 真实 E2E 完成。第一刀只接管 no-match recovery 和自然多轮 continuation，不重写稳定 exact lookup / direct compare，也不触碰 Learn / Review 状态机。

## 已完成或历史计划
这些 plan 大多已经执行完成。继续任务时不要从 Task 1 重开，除非用户明确要求复盘或重做。

- `docs/superpowers/plans/2026-05-31-ecdict-backed-wordbook-expansion-v1.md`
  - ECDICT-backed Wordbook Expansion V1 已完成验证：默认背词词书从 546 个 `real-smoke` 词条扩展到 generated ECDICT compact dataset，同时保持 `cet6-foundation-v1` ID 和现有 Learn/Review 状态机；补 ECDICT-only direct compare 保守短辨析；修首页 stale copy 和 chat transcript hydration mismatch。收藏、NotebookLM、完整 graph 和 UI 大精修均未纳入本轮。
- `docs/superpowers/plans/2026-06-01-ecdict-grounded-direct-compare-v1.md`
  - ECDICT-grounded Direct Compare V1 已完成验证：direct compare 不再依赖人工 `quickDistinction` 或 ECDICT-only "偏..." 伪辨析；resolved compare 优先用 ECDICT candidates 做 grounding，有 provider 时生成短中文辨析，provider 不可用或失败时退回并列释义；真实浏览器 E2E 已确认 `comparisonView=null`、`mainAnswer` 为 ECDICT candidates、`providerRequestId` 非空且 UI 无旧 fallback 文案。
- `docs/superpowers/plans/2026-05-30-wordbook-learn-review-v2-product-hardening.md`
  - Wordbook Learn/Review V2 轻量产品硬化已完成并提交为 `31faa2af18b0a64386a4d1e93fcb702b5661feca`。已补齐 baseline 验证、active wordbook 入口、Review 调度语义 helper、学习数据解释、恢复/空状态和 focused QA。遗留产品缺口是 active session persistence 不完整，已转入 V2.1 计划。
- `docs/superpowers/plans/2026-05-31-wordbook-active-session-persistence-v2-1.md`
  - Wordbook Learn/Review V2.1 active session persistence 已完成：新增 client-local active session store，`StudySession` 可保存/恢复正在进行的 Learn/Review 轮次，Dashboard 提供继续、重新开始和放弃本轮入口；完成 session 会清理 active session，放弃本轮不回滚词级 progress。后续已修复 Review reserve buffer 可见化问题：10 词 Review 可以重复失败词，但唯一可见词数不超过 10，旧 active session buffer 会被清理或跳过。范围继续保持 client-only，未改账号、云同步、完整 SRS、后端存储、聊天主舞台或 `enggo.collectedWords`。

- `docs/superpowers/plans/2026-05-30-wordbook-learn-review-experience-polish-v1.md`
  - Wordbook Learn/Review 体验打磨已完成：新增本地学习设置 10/20/30 词、冻结 session target count、Learn 三灯失败保留当前灯位、Review one-light clean pass 与 `reviewLapsed`、Review 失败后三灯补救链路、wrong-choice contrast、详情分层和 390px browser QA。实现保持 client-only，未改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`。
- `docs/superpowers/plans/2026-05-30-wordbook-learn-review-v1.md`
  - Wordbook Learn/Review V1 初版已完成并进入体验打磨：新增 `cet6-foundation-v1` 静态词书、localStorage 进度、四选一干扰项、Learn/Review 状态机、Learn/Review session UI 和 Progress 词书摘要；后续补了 Learn 队列式间隔调度、三颗绿灯详情反馈对齐、Review 计数去重和若干文案修正。实现保持 client-only，未改 `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords`；当前仍不建议直接 merge 主线。
- `docs/superpowers/plans/2026-05-29-conversational-context-v3-bounded-fallback.md`
  - 聊天式学习上下文 V3 已完成：新增候选内 `context_choice` 追问、provider grounding 锁定上一轮候选、无上下文 clarification、正常聊天 200 plain 兜底、前端 `context_choice` 承载与可读错误展示；长期个人记忆、多主题并行、复习卡片和云同步仍不属于本轮。
- `docs/superpowers/plans/2026-05-28-conversational-learning-context-v2.md`
  - 聊天式学习上下文 V2 已完成：范围切换、`还有吗` continuation、受控 `怎么背` study guidance、收藏页继续追问 exam target 闭环均已落地；`更适合作文吗`、长期个人记忆、多主题并行、复习卡片和云同步仍留到后续独立 spec。
- `docs/superpowers/plans/2026-05-24-conversational-learning-context-v1.md`
  - 聊天式学习上下文 V1 已完成：后端 `ConversationalLearningContext`、确定性 Follow-up Resolver、FastAPI resolved query/action/clarification 路由、前端 session context 传递、轻量上下文提示、clarification options、local collection action，以及多轮 live smoke matrix 均已落地；长期个人记忆、复习卡片和多主题并行仍留到后续阶段。
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
  - FastAPI 全量 `/api/chat` 迁移，已完成；后续 Frontend Direct FastAPI V1 已把浏览器请求从 Next proxy 收口到 FastAPI direct。
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

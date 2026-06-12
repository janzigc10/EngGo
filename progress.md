# EngGo 滚动交接

## 当前状态（2026-06-08 下一主线判断：Wordbook Daily Loop V1）
- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 当前活跃实现计划：无；上一轮清理和词缀语义收口均已完成。
- 上一轮完成计划：
  - `docs/superpowers/plans/2026-06-07-structured-legacy-data-cleanup-v1.md`。
  - `docs/superpowers/plans/2026-06-07-affix-semantic-gate-v1.md`。
- 当前参考设计仍包括：`docs/superpowers/specs/2026-06-07-affix-semantic-gate-v1-design.md`，但它现在只作为防回归边界，不再是下一阶段主线。
- 上一轮已完成基线：Scope Closure + Legacy Cleanup + Frontend Direct FastAPI 已验证；Next.js 只保留 React 前端壳，浏览器聊天请求直连 FastAPI `/api/chat`。
- 上一轮目标已完成：退役仍残留的 Prisma / `real-smoke` / 旧 product-smoke 链路，只保留当前 FastAPI + ECDICT wordbook 主线需要的数据和工具。
- 当前进度：Structured Legacy Data Cleanup V1 已完成；少量有价值的人工 root-family 内容已迁入 `data/exam-vocab/seed`，旧 Prisma schema/migrations/seed、旧 TypeScript seed/repository、旧 `real-smoke` 数据集、旧 product-smoke gate 和 Node `pg` 依赖均已删除。
- 下一阶段主线：从“能查”转到“能每天学”。聊天、检索、辨析、范围控制和 Affix Semantic Gate 当前先进入维护；接下来优先把已经存在的 Wordbook Learn / Review / Progress 收成更自然的日常使用路径。
- 建议下一刀命名：Wordbook Daily Loop V1。
  - 不是从零重做 Learn / Review dashboard：当前 `WordbookDashboard` 已有计数、开始、继续、重新开始、放弃本轮和 10/20/30 设置。
  - 真正缺口更像是统一日常优先级入口：有未完成 Review 先继续 Review；有到期复习先 Review；否则继续 / 开始 Learn；都没有时显示今天已完成。
  - 第一刀应先做真实体验 audit，确认首页、Learn、Review、Progress 是否入口分散、优先级不清或移动端不顺，而不是直接堆新 UI。
  - Chat 查到的词要更自然地沉淀到收藏 / 词书 / 后续复习里，避免“查完就断”。
  - 数据补充只做轻量小批，优先服务学习闭环；不再为了前缀后缀继续扩大量规则或做完整词根理论。
  - 数据库、账号、云同步暂不作为下一主线；只有当产品明确要多设备或长期账号保存时再推进。
- 保留边界：
  - 顶层工具仍是 `ordinary_lookup`、`direct_compare`、`advanced_lookup` 三个。
  - 不做完整 ReAct Agent。
  - 不让 provider 自由扩词或决定工具参数。
  - 不做完整词根溯源或 morpheme analyzer。
  - 不改 Learn / Review / Progress 状态机。
  - 不迁移 Vite React。
  - 不回退 scope closure；`scopeCodes` 仍表示 direct ECDICT tag，词书 membership 由 closure helper 判断。
  - 不恢复 Prisma dev / `db:*` / `real-smoke` / 旧 `eval:product-smoke`。
  - `data/exam-vocab/seed` 不是 Prisma 专属数据；FastAPI 仍直接读取其中 curated expression / group 内容。

## 本轮已完成
1. Affix Semantic Gate V1 文档启动：
   - 新增 `docs/superpowers/specs/2026-06-07-affix-semantic-gate-v1-design.md`。
   - 新增 `docs/superpowers/plans/2026-06-07-affix-semantic-gate-v1.md`。
   - 更新 `docs/README.md`，把 Affix Semantic Gate V1 设为当前活跃设计 / 计划。
2. Affix Semantic Gate V1 focused tests：
   - 新增意图层、候选准入、服务层 ECDICT fallback、回答计划和 providerless E2E/smoke 用例。
   - 初次 focused 红灯：`C:\Users\Chen\anaconda3\python.exe -m pytest backend/tests/test_learning_intent.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py -q --basetemp tmp_pytest_affix_gate_tests -p no:cacheprovider` -> 15 failed / 134 passed。
   - 红灯集中在本轮实现范围：`anti/re/sub/trans/-less/-er` 语义别名、拼写-only 候选准入、`xyz` exact token 边界、semantic_filter 回答提示。
3. Affix Semantic Gate V1 实现：
   - `anti开头` 保持 form_filter，可按拼写列出 `antique / anticipate`，不声称这些词表达“反对”。
   - `anti/re/sub/trans/-less/-er` 语义题会同时检查词形和释义线索；拼写-only 候选不进主答案。
   - prefix / suffix exact token 边界已收紧：`xyz` 本身不算 `xyz开头的单词`。
   - 复审补洞：`anti表示反对的词`、`-less表示没有的词`、`-er表示人的词` 这类不显式写“前缀/后缀”的 literal 问法也会进入词缀语义 gate。
   - semantic_filter deterministic answer note 改为“这里只保留同时满足拼写和释义线索的词”。
   - focused 绿灯：`C:\Users\Chen\anaconda3\python.exe -m pytest backend/tests/test_normalize_query.py backend/tests/test_learning_intent.py backend/tests/test_dynamic_light_grounding.py backend/tests/test_advanced_lookup.py backend/tests/test_broad_vocab_answer.py -q --basetemp tmp_pytest_affix_gate_tests -p no:cacheprovider` -> 218 passed。
4. Affix Semantic Gate V1 验证：
   - `corepack pnpm test scripts/lib/fastapi-migrated-slice-smoke.test.ts` -> 1 file / 12 tests passed。
   - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_affix_semantic_gate_full -p no:cacheprovider` -> 390 passed。
   - `corepack pnpm lint` -> passed。
   - `C:\Users\Chen\anaconda3\python.exe scripts\run-model-routing-e2e-compare.py` -> 46 total / 46 pass / 0 fail / 32 changed。
   - `git diff --check` -> passed，仅 Windows LF/CRLF warnings。
5. Structured Legacy Data Cleanup V1：
   - 新增 `docs/superpowers/plans/2026-06-07-structured-legacy-data-cleanup-v1.md`。
   - 从旧 `real-smoke` 迁入 `constitute / substitute / attempt / tempt / temptation / contempt` 和 `root-stitute` / `root-tempt` 两个 curated group；`defer` 已在 seed 中，无需重复迁移。
   - 删除 `data/exam-vocab/real-smoke/*`、`prisma.config.ts`、`prisma/` schema/migrations/seed、`src/lib/db.ts`、旧 TypeScript seed/repository 模块与测试、旧 black-box product smoke runner/test。
   - `package.json` 删除 `db:*`、`eval:product-smoke*`、Prisma、Node `pg` 依赖；`pnpm-lock.yaml` 已用 `corepack pnpm install --lockfile-only --offline` 对齐。
   - 新增 `backend/tests/test_curated_seed_content.py`，保护迁入 seed 的 root-family groups 能被当前 FastAPI loader 读到。

## 上一轮已完成
1. 文档与计划：
   - 新增 `docs/superpowers/specs/2026-06-05-ecdict-tag-scope-closure-design.md`。
   - 新增 `docs/superpowers/plans/2026-06-05-ecdict-tag-scope-closure-v1.md`。
   - 更新 `docs/README.md`、`data/exam-vocab/ecdict-wordbook/README.md`。
2. ECDICT tag-derived wordbook：
   - `scripts/generate-ecdict-wordbook.ts` 不再读 source lemma manifests，改为直接读取 ECDICT exam tags。
   - `entries.json` 存 direct `examScopes`，不把 closure 结果写回数据。
   - 本地生成结果：7348 entries；direct scopes：Gaokao 3678 / CET-4 3832 / CET-6 5390 / Postgrad 4794。
3. App-level scope closure：
   - 新增前端 `src/features/exam-target/scope-closure.ts`，定义 `gaokao -> gaokao`、`cet4 -> gaokao+cet4`、`cet6 -> gaokao+cet4+cet6`、`postgrad -> all`。
   - `wordbook-data.ts` 从同一份 `entries.json` 生成四本词书；closure 规模：Gaokao 3678 / CET-4 5299 / CET-6 7046 / Postgrad 7348。
   - 保留 `cet6-foundation-v1` 默认 ID，避免破坏本地学习进度。
4. Learn / Review / Progress / Chat 对齐：
   - Learn / Review / Progress 继续用现有状态机，但当前词书来自 ECDICT tag closure registry。
   - Chat 切换考试目标会同步 active wordbook；词书页手动切换词书也会同步考试目标。
   - `/api/chat` 请求体新增 `activeWordbookId` 观测字段，后端仍以校验过的 `activeExamTarget` + closure 判断 membership。
5. 后端 scope closure：
   - `backend/app/content/ecdict.py` 的 preferred ECDICT tags 改为 closure tags，profile 仍保留 direct scope codes。
   - `ordinary_lookup`、`advanced_lookup`、`broad_vocab`、`dynamic_light_grounding`、`repository` 使用 closure 判断 in-scope。
6. E2E matrix：
   - `scripts/run-model-routing-e2e-compare.py` 增加 `expected_main_first`。
   - 新增 `meaning_activity_scope_closure_cn`：`活动的英文是什么` 在 CET-6 下必须 main first 为 `activity`。
7. Legacy TypeScript backend cleanup：
   - 前端消费的 `AnswerGrounding` / route enum 类型迁入 `src/features/chat/types.ts`。
   - 删除 `src/features/retrieval/` 与 `src/features/answering/`。
   - 删除旧 direct runners：`run-answer-style-eval`、`run-shape-neighbor-eval`、`run-real-vocab-lookalike-smoke`、`run-grounding-strategy-probe`、`run-source-only-lookup-sample`、`run-ecdict-source-only-audit` 等。
   - `package.json` 去掉 `test:integration` 对旧 Prisma-backed retrieval test 的依赖。
8. Frontend direct FastAPI：
   - 新增 `src/features/chat/chat-api-client.ts`，默认 `NEXT_PUBLIC_ENGGO_FASTAPI_URL=http://127.0.0.1:8000`，浏览器直接 POST FastAPI `/api/chat`。
   - `useChatSession` 改为调用 `postChatRequest()`；请求体 contract 不变，仍带 `activeExamTarget`、`activeWordbookId`、`history`、`conversationContext`。
   - FastAPI 新增本地 Next origin CORS，默认 `http://127.0.0.1:3000,http://localhost:3000`，可用 `ENGGO_CORS_ALLOW_ORIGINS` 覆盖。
   - 删除 Next `/api/chat` route、proxy tests、`src/lib/env.ts` 和 package 中的 proxy smoke scripts。
   - `corepack pnpm dev:fastapi` 会向 Next 注入 `NEXT_PUBLIC_ENGGO_FASTAPI_URL`；默认 smoke 改为 FastAPI direct conversation-context gate。

## 最新验证
- 生成：
  - `corepack pnpm exec tsx scripts\generate-ecdict-wordbook.ts` -> 7348 entries。
- Backend：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_ecdict.py backend\tests\test_ordinary_lookup_answer.py backend\tests\test_direct_compare_answer.py backend\tests\test_advanced_lookup.py backend\tests\test_chat_contract.py backend\tests\test_chat_tool_router.py backend\tests\test_learning_intent.py backend\tests\test_learning_context.py --basetemp tmp_pytest_scope_closure_backend -p no:cacheprovider` -> 229 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_scope_closure_full -p no:cacheprovider` -> 361 passed。
- Frontend focused：
  - `corepack pnpm test src\features\exam-target\scope-closure.test.ts src\features\wordbook\wordbook-data.test.ts src\components\chat\chat-workspace.test.tsx` -> 3 files / 33 tests passed。
  - `corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-active-store.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\study-session.test.tsx src\features\wordbook\session-engine.test.ts src\features\collections\study-panels.test.tsx` -> 6 files / 79 tests passed。
  - `corepack pnpm test src\features\exam-target\scope-closure.test.ts src\components\chat\chat-workspace.test.tsx src\features\chat\conversation-context.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 4 files / 43 tests passed。
- Legacy cleanup frontend / scripts：
  - `corepack pnpm test src\features\wordbook\wordbook-dashboard.test.tsx` -> 1 file / 12 tests passed。
  - `corepack pnpm test src\components\chat\answer-actions.test.tsx src\components\chat\chat-workspace.test.tsx scripts\lib\fastapi-migrated-slice-smoke.test.ts scripts\lib\answer-style-provider-smoke.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> route test 删除后，相关 frontend/script tests 继续通过。
- Structured legacy cleanup：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_curated_seed_content.py backend\tests\test_advanced_lookup.py --basetemp tmp_pytest_structured_cleanup -p no:cacheprovider` -> 61 passed。
  - `corepack pnpm test scripts\run-default-fastapi-smoke.test.ts scripts\lib\fastapi-migrated-slice-smoke.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 3 files / 25 tests passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_structured_cleanup_full -p no:cacheprovider` -> 391 passed。
  - `corepack pnpm test:unit` -> sandbox 里仍因 Windows 权限报 `EPERM ...\vitest.mjs`；提权后同一命令通过，26 files / 227 tests passed。
  - `corepack pnpm lint` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warnings。
  - `rg` 扫描 Prisma / DB scripts / product-smoke / real-smoke 活跃入口 -> source / scripts / package / lock 已无旧运行链路引用；剩余只在当前文档说明或历史 docs 中。
- Frontend direct FastAPI：
  - `corepack pnpm test src\features\chat\chat-api-client.test.ts src\components\chat\chat-workspace.test.tsx scripts\lib\dev-fastapi-stack.test.ts scripts\run-default-fastapi-smoke.test.ts scripts\lib\fastapi-migrated-slice-smoke.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 6 files / 60 tests passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_config.py backend\tests\test_cors.py -p no:cacheprovider --basetemp tmp_pytest_frontend_direct` -> 5 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_frontend_direct_full -p no:cacheprovider` -> 363 passed。
  - `corepack pnpm test:unit` -> sandbox 里仍因 Windows 权限报 `EPERM ...\vitest.mjs`；提权后同一命令通过，31 files / 244 tests passed。
  - 临时 FastAPI `127.0.0.1:8000` + `corepack pnpm eval:default-fastapi-smoke` -> FastAPI direct conversation-context smoke 13 total / 13 pass / 0 fail。
- Lint / stale references / diff：
  - `corepack pnpm lint` -> passed。
  - `rg` 扫描旧 `features/answering` / `features/retrieval`、`retrieveCandidates`、`createChatService`、`source-lemma-sources` 等 -> source / scripts / package 已无旧运行时引用，仅剩文档里的已删除/已退役记录。
  - `rg` 扫描 `src/app/api/chat`、`ENGGO_BACKEND_URL`、proxy package scripts、Next proxy 当前入口 -> source / scripts / package 已无活跃 proxy 引用；剩余为历史 bug/doc 说明。
  - `git diff --check` -> passed，仅 Windows LF -> CRLF warnings。
- Live before/after E2E：
  - `C:\Users\Chen\anaconda3\python.exe scripts\run-model-routing-e2e-compare.py`。
  - baseline commit `52b7834` vs current working tree，同一批输入、同一本地 ECDICT CSV、`OPENAI_API_KEY=""`。
  - 37 total / 37 pass / 0 fail / 24 changed。
  - 分类：stable 12 / 12 pass / 1 changed；regression probe 2 / 2 pass / 1 changed；expected improvement 23 / 23 pass / 22 changed。
  - 新增关键差距：`活动的英文是什么` 从 `dormant / kinetic` 变成 `activity / event / action`，且 main first 为 `activity`。
## 下一步
1. 下一主线转为 Wordbook Daily Loop V1：先基于现有 `WordbookDashboard` / Learn / Review / Progress 做真实体验 audit，找入口分散、优先级不清和移动端体感问题。
2. 第一刀不要从零做新 dashboard，而是做统一日常优先级入口：未完成 session、到期 Review、新词 Learn、今日完成四种状态要在首页或词书入口清楚排序。
3. 第二刀再整理 Learn / Review 使用体感：空状态、失败回流、错词补救说明、进度反馈和移动端可用性。
4. 第三刀补 Chat -> Wordbook 桥接：聊天查到 / 收藏的词能更自然进入之后的学习，不让收藏页和聊天结果成为死胡同。
5. 数据和检索只做轻量维护：优先补服务学习闭环的小批词 / 小批正反例，不再为了前缀后缀扩大量 fallback 或完整词根理论。
6. Structured Legacy Data Cleanup V1 已完成；后续不要恢复 Prisma dev、`db:*`、旧 `real-smoke` 数据集或旧 `eval:product-smoke`。
7. Affix Semantic Gate V1 也已完成；后续如继续扩展词缀语义，优先补小范围正反例和 focused tests，不要回退到纯 `startsWith` / `endsWith`。
8. 词缀防回归重点样例：
   - `anti 开头表示反对的词`：`antique` / `anticipate` 不进主答案。
   - `anti 开头的词有哪些`：可以按拼写返回，但不能说这些词都表示“反对”。
   - `re开头cile结尾的单词`：继续 resolved 到 `reconcile`。
   - `re 开头表示再次的词`：不能只靠拼写把 `reconcile` 放进主答案。
   - `sub / trans / -less / -er`：正例与误判例已进 focused tests 并通过。
   - `xyz开头的单词`：不能因 exact `xyz` 条目误判为 prefix 列表。
9. 默认验证继续以 focused tests、full backend pytest、lint、FastAPI direct smoke 和 `scripts/run-model-routing-e2e-compare.py` 为准；旧 product-smoke 已删除。

## 上一轮完成内容
1. 新增 `docs/superpowers/specs/2026-06-01-controlled-chat-orchestrator-v1-design.md` 和 `docs/superpowers/plans/2026-06-01-controlled-chat-orchestrator-v1.md`。
2. 更新 `docs/README.md` 与本文件，将 Controlled Chat Orchestrator V1 设为当前活跃计划。
3. 新增 `backend/app/answering/chat_orchestrator.py`，把聊天链路里可恢复的普通 no-match 和不可恢复的高级边界 no-match 分开处理。
4. `/api/chat` 现在会在硬路由之前先接住自然上下文追问，例如 `这几个具体怎么用`；有候选上下文时给 provider 受控 grounding，无上下文时返回 clarification。
5. 普通学习问法 no-match 可进入 provider-backed recovery；随机英文 blob、词根族边界等仍保持保守收口。
6. no-match recovery 默认不复用旧候选；非上下文问题会返回 `clear_context` 元数据，前端据此清掉“正在追问”提示。
7. 自然续问识别支持英文 `how do I use these words` 这类表达，适配浏览器逐键输入和真实用户英文追问。
8. `scripts/lib/conversational-learning-context-smoke.ts` 已加入自然 group usage 与 learning-adjacent no-match recovery 用例。

## 再上一轮完成内容
1. 新增 `docs/superpowers/specs/2026-06-01-ecdict-grounded-direct-compare-design.md` 和 `docs/superpowers/plans/2026-06-01-ecdict-grounded-direct-compare-v1.md`。
2. `DirectCompareService` 已改为 resolved compare 有 provider 时调用 provider，并传入 ECDICT-backed `mainAnswer` grounding。
3. direct compare exact terms 现在优先用 ECDICT candidates；如果 ECDICT 缺失，才退回可用 structured exact entry。
4. direct compare 不再查询/依赖人工 confusion group，也不再把未问到的 group member 加进 `confusionBoundary`。
5. provider prompt 保持轻量：说明核心区别，可补常见语境或搭配直觉，不主动扩第三个词，不声称人工易混组。
6. provider 失败或无 provider 时返回 deterministic dictionary lines，并保持 `answerKind="grounded"` 与 `mainAnswer` 供后续追问使用。
7. GitHub README 维护：移除早期 `real-smoke` 作为主线的陈旧表述，补充 ECDICT-backed wordbook、学习闭环、当前数据说明和下一阶段路线。

## 上一轮验证
- Backend focused tests：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_learning_context.py backend\tests\test_ordinary_lookup_answer.py backend\tests\test_direct_compare_answer.py backend\tests\test_advanced_lookup.py backend\tests\test_chat_contract.py` -> 151 passed。
- Frontend / smoke unit：
  - `corepack pnpm test src\components\chat\chat-workspace.test.tsx src\features\chat\conversation-context.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 3 files / 40 tests passed。
- Lint / diff：
  - `corepack pnpm lint -- src\features\chat src\components\chat scripts\lib\conversational-learning-context-smoke.ts scripts\run-conversational-learning-context-smoke.ts` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warning。
- Runtime / E2E：
  - FastAPI health：`http://127.0.0.1:8000/health` -> `status=ok`。
  - 当时的 3000 代理 smoke（现已由 FastAPI direct smoke 取代）：`corepack pnpm eval:fastapi:conversation-context-smoke -- --base-url http://127.0.0.1:3000 --label next-proxy-controlled-orchestrator` -> 13 total / 13 pass / 0 fail。
  - in-app Browser：first-turn compare 可生成 `restrain / constrain` 追问上下文；英文自然续问 `how do I use these words` 接上旧候选且不 clarification；learning-adjacent no-match `how to learn English fast` 不 hard no-match、不暴露内部字段，并清掉旧“正在追问”提示；console error 为空。

## 上一轮已完成基线
1. 背单词词库已切到 generated ECDICT compact dataset：7890 entries；CET-6 7765；CET-4 6077；Gaokao 2978；不包含 postgrad scope。
2. 默认词书继续使用 `cet6-foundation-v1`，避免破坏既有本地进度和 active session。
3. Learn / Review / Progress 在浏览器中已验证使用 `CET-6 ECDICT 基础词书 V1`。
4. 首页 stale copy 和 chat transcript hydration mismatch 已修复。
5. 大词书性能修正已完成：session queue、progress snapshot 和学习题干预处理都改为 map / preflight 级别。

## 已完成长期基线
1. 聊天式 MVP、真实词库 smoke、易混词辨析、词根/碎片检索、聊天回答渲染层、Answer Policy v1 松绑 spike 已完成。
2. 聊天式学习上下文 V1 / V2 / V3 已完成并进入维护状态：保留范围切换、`还有吗`、受控 `怎么背`、收藏页继续追问、候选内语境选择和有边界聊天兜底。
3. ECDICT 已是运行时默认大词库底座；旧 structured DB 已降级为冻结覆盖层 / 可选增强 / 回归样例。
4. Wordbook Learn / Review V1、体验打磨、V2 产品硬化、V2.1 active session persistence 及 Review 可见词数修复均已完成并通过 focused tests、lint、`git diff --check` 和浏览器验证。

## 边界与风险
- 不要继续围绕 `real-smoke` 小词书扩写背词内容；旧目录已删除，少量值得保留的人工内容已迁入 `data/exam-vocab/seed`。
- 不要把 ECDICT 自动释义压缩当成人工 confusion graph；direct compare 要么走 provider 组织真实短辨析，要么干净退回并列释义。
- 不要在本轮基础上扩 Learn / Review 状态机、账号/云同步、完整 SRS、收藏体系或 NotebookLM 方向。
- 生成器依赖本地 `output/external-dictionaries/ecdict.csv`；该文件被 git ignore，提交的是 compact generated JSON。

# EngGo 滚动交接

## 2026-05-11 聊天支持面板来源感知

- 本轮从 FastAPI-first 默认路径回到聊天主舞台体验，新增 source-aware 支持面板：
  - structured / 普通结构化命中保留原有 compact 命中状态。
  - `source_lemma_exact` / `sourceKind=source_lemma` 显示“来源词表词”，并说明它还不是 EngGo 人工结构化词条。
  - `external_dictionary_exact` / `sourceKind=external_dictionary_basic` 显示“外部基础释义”，并说明它来自外部基础词典，不产生易混词、词根族或考试优先级判断。
- 收藏动作说明同步收口：
  - source-only 且无释义时显示“来源词表命中，待补结构化释义”，不再暴露 `source lemma exact match`。
  - 外部词典候选显示“外部基础词典释义：...”，避免看起来像人工结构化释义。
- 新增设计与计划文档：
  - `docs/superpowers/specs/2026-05-11-source-aware-chat-support-panel-design.md`
  - `docs/superpowers/plans/2026-05-11-source-aware-chat-support-panel.md`
- 本轮验证：
  - `corepack pnpm test src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx` -> 2 files / 15 tests passed。
  - `corepack pnpm lint src/components/chat/message-thread.tsx src/components/chat/answer-actions.tsx src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/features/retrieval/types.ts` -> passed。
- 下一步建议：继续围绕移动端真实阅读做一轮 browser smoke，重点看 source-aware 文案在 390px 宽度下是否挤压、收藏工具是否仍保持可扫读。

## 2026-05-11 FastAPI 开发流固化收口

- 本轮在全量迁移基础上补齐了默认 FastAPI 开发工作流：
  - `corepack pnpm dev:fastapi`：先检查 8000/3000 端口，启动 FastAPI，等待 `/health` 通过后再启动 Next。
  - `corepack pnpm eval:default-fastapi-smoke`：依次跑 Next proxy migrated smoke 和 HTTP product smoke，验证默认 Next `/api/chat` 确实穿到 FastAPI。
- 新增脚本与测试：
  - `scripts/lib/dev-fastapi-stack.ts` / `.test.ts`
  - `scripts/dev-fastapi-stack.ts`
  - `scripts/run-default-fastapi-smoke.ts` / `.test.ts`
- Windows 启动细节已修正：Node 不能直接 `spawn()` `corepack.cmd`；当前通过 `cmd.exe /d /s /c corepack ...` 包装 Corepack，不再使用 `shell: true`。
- 本轮确认旧 TypeScript 后端边界：`src/features/retrieval/` 与 `src/features/answering/` 仍可作为 legacy/reference，但不是 Next `/api/chat` 的运行时 fallback。
- 最终验证：
  - `corepack pnpm test scripts/lib/dev-fastapi-stack.test.ts scripts/run-default-fastapi-smoke.test.ts` -> 2 files / 10 tests passed。
  - `corepack pnpm lint scripts/lib/dev-fastapi-stack.ts scripts/lib/dev-fastapi-stack.test.ts scripts/dev-fastapi-stack.ts scripts/run-default-fastapi-smoke.ts scripts/run-default-fastapi-smoke.test.ts` -> passed。
  - `corepack pnpm test` -> 28 files / 241 tests passed。
  - `corepack pnpm lint` -> passed。
  - `corepack pnpm run build` -> passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests`（`TMP/TEMP` 与 `cache_dir` 指到 `C:\tmp`）-> 66 passed。
  - `corepack pnpm dev:fastapi` 冷启动成功，FastAPI `/health` 通过后 Next ready。
  - `corepack pnpm eval:default-fastapi-smoke` -> migrated proxy smoke 13/13 pass；HTTP product proxy smoke 38/38 pass。
- 收尾状态：`.env.local` 不存在；本轮 smoke 启动的 3000/8000 本地监听进程已清理。
- 环境注意：
  - 完整默认 smoke 包含 provider-backed cases，本轮成功运行约 209 秒；不要用 3 分钟以内的硬超时判断失败。
  - 如后端 pytest 命中 `C:\Users\Chen\AppData\Local\Temp\pytest-of-Chen` 或 `.pytest_cache` 的 `WinError 5`，把 `TMP/TEMP` 和 `cache_dir` 切到 `C:\tmp` 后重跑。

## 2026-05-10 FastAPI 全量迁移完成交接

- FastAPI `/api/chat` 已迁移完整聊天后端功能面：普通查词、source lemma、ECDICT 基础释义、direct compare、meaning/expression recall、shape-neighbor、typo/fuzzy、root family、root fragment、plain fallback、provider-backed generation、provider error contract，以及 Next `/api/chat` proxy。
- Next `/api/chat` 已正式切为默认代理 FastAPI：不配置 `ENGGO_BACKEND_URL` 时默认打 `http://127.0.0.1:8000/api/chat`；`ENGGO_BACKEND_URL` 只作为后端地址覆盖。旧 TypeScript chat service 不再是 Next route 的默认回退。
- FastAPI 启动命令必须使用 app factory：`C:\Users\Chen\anaconda3\python.exe -m uvicorn backend.app.main:create_app --factory --host 127.0.0.1 --port 8000`。
- 开发启动入口已固化为 `corepack pnpm dev:fastapi`：先检查端口，再启动 FastAPI，等 `/health` 通过后启动 Next。
- 默认验证入口已固化为 `corepack pnpm eval:default-fastapi-smoke`：依次跑 Next proxy migrated smoke 与 HTTP product smoke，验证默认 `/api/chat` 穿到 FastAPI。
- `src/features/retrieval/` 与 `src/features/answering/` 里的 TypeScript 后端逻辑现在视为 legacy/reference，不是 Next `/api/chat` 运行时 fallback。
- 最终验证：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests` -> 66 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_repository.py backend/tests/test_chat_contract.py backend/tests/test_advanced_lookup.py` -> 24 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests/test_provider.py backend/tests/test_chat_contract.py` -> 14 passed。
  - `corepack pnpm test` -> 26 files / 231 tests passed；`seed-content.test.ts` 已在 `afterAll` 恢复 `real-smoke`，避免污染后续 retrieval integration。
  - `corepack pnpm lint` -> passed。
  - `corepack pnpm run build` -> passed；仍有 Next/Turbopack NFT tracing warning，见 `bugs.md`。
  - FastAPI direct `corepack pnpm eval:fastapi:migrated-smoke` -> 13 total / 13 pass / 0 fail。
  - FastAPI direct `corepack pnpm eval:product-smoke:http` -> 38 total / 38 pass / 0 fail。
  - clean Next proxy `corepack pnpm eval:fastapi:migrated-smoke:proxy` -> 13 total / 13 pass / 0 fail。
  - clean Next proxy `corepack pnpm eval:product-smoke:http:proxy` -> 38 total / 38 pass / 0 fail。
  - clean Next proxy `corepack pnpm eval:standard-lookup:provider` -> 21 total / 21 pass / 0 fail, `providerCalled=0`, `providerSkipped=21`。
  - 默认 FastAPI route 切流后，`corepack pnpm test src/app/api/chat/route.test.ts` -> 1 file / 3 tests passed。
  - 默认 FastAPI route 切流后，`corepack pnpm lint src/app/api/chat/route.ts src/app/api/chat/route.test.ts` -> passed。
  - 默认 FastAPI route 切流后，`corepack pnpm run build` -> passed；本轮未再出现此前由 `/api/chat` legacy import trace 触发的 Turbopack/NFT warning。
  - 不带 `.env.local` 启动 Next 后，`corepack pnpm eval:fastapi:migrated-smoke:proxy` -> 13 total / 13 pass / 0 fail，证明默认 Next `/api/chat` 已打到 FastAPI。
  - 不带 `.env.local` 启动 Next 后，`corepack pnpm eval:product-smoke:http:proxy` -> 38 total / 38 pass / 0 fail。
  - 默认 FastAPI route 切流后，`corepack pnpm test` -> 26 files / 231 tests passed。
  - 默认 FastAPI route 切流后，`C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests` -> 66 passed。
  - 默认 FastAPI route 切流后，`corepack pnpm lint` -> passed。
  - 收尾状态：`.env.local` 不存在，3000/8000 无监听残留，本地 DB 为 546 entries / 34 confusion groups。
- 本轮修复的环境/可靠性点：
  - Python repository 对 Prisma dev 直连端口的瞬态 `psycopg.OperationalError` 做连接建立重试，避免长 smoke 中偶发 500。
  - Python provider 将 `httpx` timeout/network error 映射为 `ChatProviderError`，避免直接冒泡成 FastAPI 500。
  - Next smoke 应先启动 FastAPI；Next `/api/chat` 已默认代理 `http://127.0.0.1:8000`，不再需要 `.env.local` 只为切到 FastAPI。
  - 如需覆盖 FastAPI 地址，仍可临时写 `.env.local` / 环境变量 `ENGGO_BACKEND_URL`，Next 启动建议用 `Start-Job`，并按 3000 端口 owner 清理；`Start-Process corepack` 容易留下假启动/EADDRINUSE。
  - Vitest integration 会把本地 DB 留在小 fixture；跑 FastAPI product smoke 前要重新执行 `corepack pnpm db:seed:real-smoke`。
- 下一步建议：围绕默认 FastAPI 路径固化一键启动/端口清理/seed 流程，并把后续体验打磨都按前后端分离路径验证。

## 当前阶段
EngGo 已完成聊天式 MVP、真实词库 smoke、易混词辨析、词根/碎片检索、聊天回答渲染层，以及 Answer Policy v1 的松绑 spike。

当前稳定产品原则：

> 范围优先，不范围专制。

RAG / 词库负责提供证据、命中状态和收藏入口；它不应该成为所有回答的许可闸门。明确低风险的英语学习问题可以走 `plain`，但不能伪装成 grounded 命中。

## 2026-05-10 FastAPI 全量迁移进展

- 全量迁移计划已落地到 `docs/superpowers/plans/2026-05-10-fastapi-full-chat-backend-migration.md`；Task 1 已完成。
- FastAPI 已迁移 `direct_compare` / confusion group retrieval：支持 exact 多词对比、shared confusion group、`comparisonView`、`confusionBoundary`、`answerStyle=confusion_untangle`，并保持 `providerRequestId=null`。
- Next `/api/chat` proxy 分支改为 request-time 读取 `process.env.ENGGO_BACKEND_URL`，避免 dev server 模块缓存导致 proxy smoke 误走旧 TypeScript route。
- 新增 migrated-slice smoke case：`access assess excess 怎么区分`、`restrain constrain 怎么区分`，并开始检查 `answerStyle` 与 `comparisonView.id`。
- 本轮验证：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend/tests` -> 33 passed。
  - `corepack pnpm test src/app/api/chat/route.test.ts` -> 3 passed。
  - `corepack pnpm test scripts/lib/fastapi-migrated-slice-smoke.test.ts` -> 5 passed。
  - focused lint for changed route/smoke files -> passed。
  - `corepack pnpm eval:fastapi:migrated-smoke` -> 7 total / 7 pass / 0 fail。
  - temporary `.env.local` with `ENGGO_BACKEND_URL=http://127.0.0.1:8000` + Next proxy: `corepack pnpm eval:fastapi:migrated-smoke:proxy` -> 7 total / 7 pass / 0 fail。
- 临时 `.env.local` 已删除；当前没有保留 FastAPI/Next 临时 smoke job。

## 本 Session 文档整理
- 2026-05-03 整理核心文档职责：
  - `AGENTS.md`：保留协作入口、高频规则和当前焦点。
  - `context.md`：更新为长期项目地图，移除“尚无正式代码骨架”等过期信息。
  - `progress.md`：瘦身为当前状态、下一步、阻塞和验证基线，不再保留完整历史流水账。
  - `bugs.md`：整理为环境恢复路径、当前产品残留、已处理事项和不要重复走的失败路径。
  - `docs/README.md`：新增文档索引，说明 spec / plan / growth log 的阅读方式。
- 2026-05-03 面向 GitHub / HR 整理仓库首页：
  - `README.md` 已从开发启动说明改成项目展示型首页，包含项目亮点、本人完成工作、示例能力、技术栈、架构、数据说明、运行方式和验证基线。
  - `.gitignore` 新增 `.runlogs/` 与 `output/`，避免本地服务日志和 Playwright 截图误提交。
  - `docs/README.md` 补充 `README.md` 作为面向 GitHub 访问者和招聘方的入口。

## 当前已完成的主线
- 聊天主舞台：
  - Next.js chat workspace 已可提交问题、展示回答、显示 loading 进度和收藏入口。
  - assistant answer 已用受控 Markdown 子集渲染，支持段落、标题、加粗、code、列表和 Markdown 表格。
  - 宽召回的收藏动作默认折叠，移动端 390px smoke 未出现页面级横向溢出或原始 Markdown 表头泄露。
- 词库与检索：
  - `seed` 覆盖高考、四级、六级、考研。
  - `real-smoke` 当前约 546 entries / 34 confusion groups，只覆盖高考、四级、六级。
  - exact lookup、中文核心义召回、typo / fuzzy recall、shape-neighbor、expression recall、root / fragment recall 均已进入可验证状态。
- 回答风格：
  - `standard_lookup`：普通查词短答，避免主动扩未召回词、例句、范围尾巴和 Markdown 装饰。
  - `confusion_untangle`：四段辨析卡，信息满但不散，不再追求极限压短。
  - `root_family_summary`：用于碎片/家族召回，当前支持 `stitute` / `tempt` 原型和结构化词形过滤。
  - `plain`：用于 greeting、明确英语学习问题 fallback、spelling-assist 候选确认，不显示命中状态和收藏工具。
- Answer Policy v1 松绑 spike：
  - `你好` / `hi` 等 greeting 直接返回 `plain`，不走 retrieval/provider。
  - `complex 和 complicate 是一个意思吗`、`complex 是什么意思` 这类明确英语学习问题，在当前小词库未命中时可走 non-grounded provider fallback。
  - `reqxust 是什么意思` 这类疑似 typo no-match 已升级为 spelling-assist 候选确认，返回 `plain`，不带 grounding。
  - `re+con 的词根有什么词` 仍保守 no-match，不硬造词根家族。
- 2026-05-08 普通查词 exact lookup 污染验收：
  - 启动并复查本地 `enggo` Prisma dev；Next dev server 已用 `corepack pnpm dev --hostname 127.0.0.1 --port 3000` 跑通。
  - 首轮 `eval:standard-lookup:provider` 暴露 `effect` 带 `CET-4 范围内`，以及 provider 偶发 `例如`、Markdown 加粗、`没有需要区分` 等输出污染。
  - 已收紧 `standard_lookup` provider 输入：system prompt 不再直接暴露 `当前考试范围：CET-*`；发给 provider 的 standard lookup grounding 去掉 `activeExamTarget*`、`scopeCodes`、`reason`、`scopeReminder` 等范围元数据。
  - 已在 `chat-service` 的 `standard_lookup` 返回口做窄清理：移除 Markdown 装饰，并丢弃含范围提示、例句、下一步、无易混词说明的句子；只作用于普通查词。
  - 复跑 `corepack pnpm eval:standard-lookup:provider`：20 total / 20 pass / 0 fail。
  - 复跑 `corepack pnpm eval:product-smoke`：37 total / 37 pass / 0 fail。
- 2026-05-09 Scheme C source lemma fallback 第一版：
  - 新增文件级 source lemma loader，复用 `gaokao-2020-lemmas.txt` 和 `cet-2016-lemmas.tsv`；`cet4` sourceScope 同时计入 `cet4` 和 `cet6`，`cet6-extra` 只计入 `cet6`。
  - 普通英文查词在 structured entry miss 后，会用 exact source lemma membership 兜底；例如 `accent` 在 CET-4 下返回 resolved source-only candidate。
  - source-only 候选仍走 `standard_lookup`，不新增新的回答风格；provider grounding 只暴露窄字段和 `sourceKind`，不暴露 scope 元数据。
  - source-only 普通查词提示词已从“极短核心义”收紧为学生友好的微词典模板：核心义 + 简单理解；真实 provider smoke 中 `accent` 输出为“核心义是……；简单理解……”。
  - 普通查词词性展示统一改为 `n. / v. / adj. / adv.` 等英文缩写；`standard_lookup` 返回口会兜底清理“名词/动词/形容词/副词”，并补拦“无需要区分/无需区分”等易混词污染话术。
  - source-only 抽样 provider smoke 跑了 22 个未结构化词；首轮发现 `emphasis -> emphasize`、`frequency -> frequent`、`journal -> journey` 的检索优先级错误，已改为 exact source lemma 优先于 structured fuzzy neighbor，保留 structured exact 优先。
  - 新增 `eval:source-only:provider` 抽样工具：从 source lemma 中排除已结构化词和不适合 exact lookup 的短词/标点词，自动生成普通查词 provider cases，用于决定哪些词值得结构化。
  - 首轮 source-only 工具发现 `a.m` 这类标点 lemma 不适合普通 exact 抽样，以及 provider 偶发“检索未提供/无法进一步解释”泄露；已通过抽样过滤、source-only prompt 和 `standard_lookup` 返回口清理修掉。
  - 规模验收 v1 新增 seeded stratified sampling 和 JSON/Markdown 报告落盘；纯字母 source-only 候选池 7381 个，300 个分层真实 provider 抽样全部通过，说明普通查词不需要立刻大规模人工结构化。
  - 第一版不做持久化 generated profile cache、不做 source-only 易混词、不做 source-only 词根族、不做向量语义召回。
- 2026-05-09 ECDICT 基础释义源试验：
  - 方向已从“把 7000+ source-only 词先喂给模型生成释义”调整为“优先接合法基础词典源；模型只做词典缺失、库外词和复杂解释 fallback/enhancer”。
  - 新增 `eval:ecdict:audit` 审计工具，只评估覆盖率和释义噪声，不接主链路、不写正式词库。
  - ECDICT CSV 审计结果：当前 7381 个纯字母 source-only 候选中命中 7372 个，缺失 9 个，覆盖率约 99.88%；其中 direct_usable 4341，cleaned_usable 3003，noisy_or_empty 28。
  - 审计暴露原始 source lemma 里仍有少量短语拼接或非标准 lemma，例如 `accordingto`、`oughtto`、`owingto`、`instalation`；后续进入主链路前需要继续作为数据清洗项处理。
- 2026-05-09 ECDICT basic lookup 第一刀：
  - 已确认词汇边界：普通 word、hyphenated word、space phrase 分开；`well-known` / `x-ray` 这类连字符词仍是词，不归入 phrase；`makeup` / `make-up` / `make up` 不自动合并。
  - 新增设计与计划文档：`docs/superpowers/specs/2026-05-09-ecdict-basic-lookup-design.md`、`docs/superpowers/plans/2026-05-09-ecdict-basic-lookup.md`。
  - 新增独立 `ecdict-basic-profiles` 模块，支持 exact word、hyphenated word、space phrase 和显式 joined phrase alias。
  - 已把 profile 层接入普通查词路由：`standard_lookup + source_lemma_exact` 会先查 ECDICT profile，命中可用释义则模板返回，不再调用 provider。
  - `/api/chat` 现在创建 chat service 时注入 lazy ECDICT lookup；默认读取 ignored 路径 `output/external-dictionaries/ecdict.csv`，文件缺失时安全返回 `null` 并继续 provider fallback。
  - 接入边界仍保持很窄：只处理 source lemma exact 普通查词，不影响 structured entry、no-match、spelling-assist、plain fallback、易混辨析、词根族或表达召回。

- 2026-05-09 ECDICT routing review fix 后：
  - 修正实现/文档歧义：ECDICT 不是无边界主词库；structured entry 仍最高优先级，source lemma 负责考试范围门控，ECDICT 只提供外部基础释义。
  - `well-known` / `x-ray` / `t-shirt` / `up-to-date` 这类 hyphenated word 不再被 root fragment parser 抢走；真实 retrieval 里 `x-ray` 现在是 `direct_lookup + source_lemma_exact`。
  - `according to` / `ought to` / `owing to` 通过 explicit source lemma alias 映射到 `accordingto` / `oughtto` / `owingto`，再由 ECDICT 输出 canonical phrase。
  - `make up` 这类 direct phrase 不再 fuzzy 到无关单词；如果 structured/source lemma 都没有命中，但 ECDICT 有 exact phrase profile，则走 `external_dictionary_exact` 模板回答。
  - ECDICT CSV parser / translation cleaner 已抽到 runtime-safe 模块 `src/features/content/ecdict-csv.ts`；`scripts/lib/ecdict-source-only-audit.ts` 只复用并 re-export，不再让生产代码依赖 scripts。
- 2026-05-10 普通查词展示模板收口后：
  - 普通查词展示从“一整句话”改为块状输出：词头单独一行，空一行后按词性展示释义。
  - 结构化词条会从 retrieval candidate 带出 `partOfSpeech`，例如 `access` 现在展示为 `access` + `n./v. 进入权；使用权；访问`，且普通查词不再为这类确定性展示调用 provider。
  - ECDICT 普通词、短横线词和短语共用同一个展示格式；短语无词性时显示 `phr.`。
  - 这次只收口普通查词展示层，不改易混辨析、词根家族、表达召回或库外模型 fallback 的产品边界。
- 2026-05-10 普通查词真实链路验收后：
  - 本地 `enggo` Prisma dev 已从 `not_running` 恢复为 running；迁移确认无 pending，real-smoke seed 已重新跑过。
  - `eval:standard-lookup:provider` 已同步普通查词确定性模板的新期望：21 条普通查词全部 pass，`providerCalled=0`、`providerSkipped=21`。
  - `eval:product-smoke` 已同步普通结构化查词不进 provider 的断言：38 total / 38 pass / 0 fail。
  - 这次 smoke 更新只修正验证脚本对 provider 是否应被调用的判断，不改变检索或回答业务逻辑。

## 历史执行日志：2026-05-10 FastAPI 后端拆分 Stage 1 / Stage 2
以下记录保留为迁移过程证据；当前 `/api/chat` 切流状态以文件顶部“FastAPI 全量迁移完成交接”为准。

1. 新增并提交 `docs/superpowers/specs/2026-05-10-fastapi-backend-split-design.md`，确认迁移路线为：Next 前端保留，Next `/api/chat` 默认仍走 TypeScript 服务，仅在 `ENGGO_BACKEND_URL` 配置时代理到 FastAPI；Prisma migration/seed 与现有 smoke 暂时保留。
2. 新增并提交 `docs/superpowers/plans/2026-05-10-fastapi-backend-split-stage-1.md`，Stage 1 范围收紧为 FastAPI contract + optional proxy，不迁移普通查词/retrieval/provider。
3. Stage 1 Task 1 已完成：新增 `backend/requirements.txt`、`backend/app/main.py`、`backend/app/core/config.py`、`backend/tests/test_health.py`，并通过 FastAPI health TDD 红绿验证。
4. Stage 1 Task 2 已完成：新增 FastAPI chat contract、Pydantic 请求/响应模型、request id 中间件和 `/api/chat` router；当前只支持 greeting plain 短路，非 greeting 明确返回 501 `not_implemented`，不伪造 grounding。
5. Stage 1 Task 3 已完成：`src/app/api/chat/route.ts` 支持可选 `ENGGO_BACKEND_URL` 代理；未配置时仍走现有 TypeScript retrieval/service，配置时转发到 FastAPI，并保留状态码、响应体和 `x-request-id`。
6. Stage 1 Task 4 已完成：由于本机没有全局 `python` 命令，没有新增易失效的 `package.json` 后端启动脚本；使用 bundled Python 路径完成 FastAPI 直接 smoke，并临时停止旧 Next 进程后完成带 `ENGGO_BACKEND_URL` 的 Next proxy smoke；随后已恢复默认 Next dev server（不带 `ENGGO_BACKEND_URL`）到 `127.0.0.1:3000`，当前监听 PID 45780。
7. Stage 1 Task 5 已完成：Python 后端测试、Next proxy/front-end 聚焦测试、默认 Next TypeScript 路径 smoke、focused lint 与 `git diff --check` 均已跑过。
8. 当前验证：
   - `C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_health.py -q` -> 1 passed。
   - `C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_chat_contract.py -q` -> 3 passed。
   - `C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests -q` -> 4 passed。
   - `corepack pnpm test src/app/api/chat/route.test.ts` -> 1 file / 3 tests passed。
   - `corepack pnpm test src/app/api/chat/route.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/components/chat/answer-content.test.tsx` -> 4 files / 17 tests passed。
   - `corepack pnpm eval:product-smoke` -> 38 total / 38 pass / 0 fail。
   - `corepack pnpm eval:standard-lookup:provider` -> 21 total / 21 pass / 0 fail，`providerCalled=0`，`providerSkipped=21`。
   - `corepack pnpm lint src/app/api/chat/route.ts src/app/api/chat/route.test.ts src/lib/env.ts` -> 通过。
   - `git diff --check` -> exit 0，仅 CRLF warning。
   - FastAPI direct smoke：`GET /health` -> `{"status":"ok","service":"enggo-fastapi"}`；`POST /api/chat` greeting -> 200 plain，带 `requestId` / `providerRequestId:null`。
   - Next proxy smoke：带 `ENGGO_BACKEND_URL=http://127.0.0.1:8000` 临时启动 Next 后，`POST /api/chat` greeting -> 200，`x-request-id` 与 FastAPI `requestId` 透传一致。
9. 下一迁移阶段建议：进入 Stage 2，只迁移最小 deterministic ordinary lookup slice（direct lookup normalization、exact structured lookup、source lemma membership、ECDICT profile、标准查词模板和保守 no-match），不要同时迁移完整 compare/root/provider。
10. Stage 2 计划已通过独立 reviewer 复审：范围限定为普通 exact/source lemma/ECDICT/basic no-match；compare/root/fragment/provider 在 FastAPI Stage 2 仍返回 501，默认 Next TypeScript 路径继续受 `ENGGO_BACKEND_URL` 保护。
11. Stage 2 Task 1 已完成：`backend/requirements.txt` 新增 `psycopg[binary]` 与 `python-dotenv`；bundled Python 已安装依赖；`backend/app/core/config.py` 支持安全加载 `.env` 中的 `DATABASE_URL`，并暴露 source lemma 与 ECDICT 默认路径。
12. Stage 2 Task 1 验证：`C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_config.py -q` -> 2 passed。安装依赖时沙盒网络被拦截，已按授权流程用同一 bundled Python 执行 pip install。
13. Stage 2 Task 2 已完成：新增 `backend/app/retrieval/normalize_query.py`，只迁移普通 `direct_lookup` / `fuzzy_recall` 的最小 query normalization，并把 compare/root 查询显式标记为 FastAPI Stage 2 unsupported。
14. Stage 2 Task 2 验证：`C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_normalize_query.py -q` -> 5 passed。
15. Stage 2 Task 3 已完成：新增 `backend/app/content/source_lemmas.py` 与 `backend/app/content/ecdict.py`，复刻 source lemma membership、显式短语 alias、ECDICT CSV 基础释义清洗与缺文件安全返回。
16. Stage 2 Task 3 验证：`C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_source_lemmas.py backend\tests\test_ecdict.py -q` -> 6 passed。
17. Stage 2 Task 4 已完成：新增 `backend/app/retrieval/types.py` 与 `backend/app/retrieval/repository.py`，用只读 SQL 做 structured exact lemma/alias lookup，测试使用 fake cursor，不依赖本地 DB、不跑 migration/seed、不改 schema。
18. Stage 2 Task 4 验证：`C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_repository.py -q` -> 3 passed。
19. Stage 2 Task 5 已完成：新增 `backend/app/answering/ordinary_lookup.py`，支持 structured exact 普通查词模板、source lemma + ECDICT 基础释义、direct phrase ECDICT fallback、ordinary no-match，以及 compare/root unsupported exception；全程不接 provider。
20. Stage 2 Task 5 验证：`C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests\test_ordinary_lookup_answer.py -q` -> 5 passed。
21. Stage 2 Task 6 已完成：`/api/chat` 已接入普通查词服务；真实 FastAPI 链路中 `access 是什么意思` -> exact、`accent` -> source_lemma_exact、`make up` -> external_dictionary_exact，均为 200 grounded 且 `providerRequestId=null`；`re+con 的词根有什么词` -> 501 `not_implemented`。
22. Stage 2 Task 6 验证：`C:\Users\Chen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m pytest backend\tests -q` -> 26 passed；带 `ENGGO_BACKEND_URL=http://127.0.0.1:8000` 的 Next proxy smoke 中 `accent`、`access 是什么意思`、`make up` 均返回 FastAPI grounded 结果，`re+con 的词根有什么词` 仍 501。proxy smoke 后已停止临时 8000，并恢复默认 Next dev server 到 `127.0.0.1:3000`，当前监听 PID 70448。
23. Stage 2 Task 7 已完成：默认 Next dev server 已恢复为不带 `ENGGO_BACKEND_URL`；`docs/README.md` 已登记 Stage 2 plan，`bugs.md` 记录了 FastAPI/psycopg 复用 Prisma `.env` 的 BOM、Prisma-only query params 和 localhost/127.0.0.1 兼容坑。
24. Stage 2 Task 7 验证：默认 TypeScript 路径 `corepack pnpm eval:product-smoke` -> 38 total / 38 pass / 0 fail；`corepack pnpm eval:standard-lookup:provider` -> 21 total / 21 pass / 0 fail，`providerCalled=0`，`providerSkipped=21`。
25. Stage 2 migrated-slice smoke 已固化：
  - 新增 `scripts/lib/fastapi-migrated-slice-smoke.ts` / `.test.ts` 和 `scripts/run-fastapi-migrated-slice-smoke.ts`。
  - 新增 package scripts：`corepack pnpm eval:fastapi:migrated-smoke`（默认打 `http://127.0.0.1:8000`）和 `corepack pnpm eval:fastapi:migrated-smoke:proxy`（打 `http://127.0.0.1:3000` 的 Next proxy）。
  - case 覆盖 `accent`、`access 是什么意思`、`make up`、ordinary no-match、`re+con 的词根有什么词`；其中 `re+con` 期望 501，可防止 proxy 误走默认 TS root no-match。
26. migrated-slice smoke 验证：
  - 临时启动 FastAPI 后，`corepack pnpm eval:fastapi:migrated-smoke` -> 5 total / 5 pass / 0 fail。
  - 临时启动 FastAPI + 带 `ENGGO_BACKEND_URL` 的 Next 后，`corepack pnpm eval:fastapi:migrated-smoke:proxy` -> 5 total / 5 pass / 0 fail。
  - runner payload 类型修复后已复跑 direct 和 proxy 两条新 smoke，均为 5 total / 5 pass / 0 fail。
  - smoke 后已停止临时 8000，恢复默认 Next dev server 到 `127.0.0.1:3000`，当前监听 PID 60168。
  - 默认 TypeScript 路径复跑：`corepack pnpm eval:product-smoke` -> 38 total / 38 pass / 0 fail；`corepack pnpm eval:standard-lookup:provider` -> 21 total / 21 pass / 0 fail，`providerCalled=0`，`providerSkipped=21`。

普通查词现有 provider smoke 已清理到 21/21。词库扩容路线已从“继续人工 batch 4 结构化扩词”调整为“结构化优先 + 外部基础词典 + 模型兜底”：

1. 先用文件级 `source-lemmas` 做 source lemma membership，覆盖现有未结构化基础词。
2. structured entry miss 后，只对普通英文 exact 查词启用 source lemma fallback。
3. 对 source-only 普通查词，已优先尝试 ECDICT 这类基础词典释义；词典命中且清洗后可用时，走模板而不是 provider。
4. 只有 ECDICT 缺失、释义噪声不可用、库外正常英文词、复杂辨析/总结/追问时，才调用模型。
5. 小批真实链路验收已完成；普通 structured lookup 与 ECDICT/source lemma lookup 都不应再把确定性基础释义绕回 provider。
6. 下一步建议回到聊天主舞台体验：移动端阅读、命中状态/外部词典身份区分、收藏动作和后续复习入口。
7. 不急着把 ECDICT 升级为 structured entry；结构化工作继续聚焦中文召回、易混辨析和词根/表达召回真正需要的高价值词。

暂缓：
- 全量几千词一次性导入
- 把 7000+ source-only 词一次性喂给模型生成释义
- 为每个词人工写易混关系
- 继续扩 typo 闸门
- 把 embedding 作为主检索方案
- 把 `re+con` 这类语义词根理论问题混入词形 parser

## 当前阻塞 / 风险
- Windows + Prisma dev 不稳定；本地验证前先看 `bugs.md`。
- 不建议并行跑会访问本地 Prisma dev 的命令，例如 `verify`、`eval:shape`、`eval:answer-style`、`eval:lookalike:real-smoke`、`eval:answer-style:provider`。
- `postgrad` 缺 entry-level 可机读官方词表，暂不进入 `real-smoke` scope。
- MiniMax 临时 key 历史上出现 429；真实 provider smoke 优先用当前可用 provider，并小批量串行跑。
- `corepack pnpm exec tsc --noEmit` 仍是已知工程债，尚未纳入当前完成标准。

## 最近验证基线
- 2026-05-10 普通查词真实链路验收后：
  - `corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts`
    - 1 file / 24 tests passed
  - `corepack pnpm test scripts/run-answer-style-provider-smoke.test.ts`
    - 1 file / 8 tests passed
  - `corepack pnpm test scripts/lib/black-box-product-smoke.test.ts`
    - 1 file / 5 tests passed
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail；`providerCalled=0`，`providerSkipped=21`
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
- 2026-05-10 普通查词展示模板收口后：
  - `corepack pnpm test src/features/answering/chat-service.test.ts src/features/retrieval/retrieve-candidates.test.ts`
    - 2 files / 90 tests passed
  - `corepack pnpm lint src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/answering/chat-provider.ts src/features/retrieval/types.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts`
    - 通过
  - `git diff --check`
    - exit 0，仅 CRLF warning
  - 抽样链路：
    - `access` -> `access` + `n./v. 进入权；使用权；访问`，`providerRequestId=null`
    - `accent` -> `accent` + `n. 重音；口音；特点；注重点` / `vt. 重读；加重音号于；强调`
    - `x-ray` -> `adj.` / `vt.` / `vi.` 分行
    - `make up` -> `phr.` 分行
- 2026-05-09 ECDICT routing review fix 后：
  - `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`
    - 1 file / 68 tests passed
  - `corepack pnpm test src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.test.ts src/features/answering/chat-service.test.ts`
    - 3 files / 32 tests passed
  - focused eslint on ECDICT / source lemma / retrieval / answering files
    - 通过
  - 本地 Prisma dev 连接中断后，用 `corepack pnpm exec prisma dev --name enggo --detach`、`corepack pnpm exec prisma migrate deploy`、`corepack pnpm db:seed:real-smoke` 恢复；随后 retrieval 测试通过。
  - 抽样链路：
    - `x-ray` -> `direct_lookup + source_lemma_exact`，ECDICT 模板回答，`providerRequestId=null`
    - `according to` -> explicit alias `accordingto`，ECDICT canonical phrase 回答，`providerRequestId=null`
    - `make up` -> retrieval no_match 后 ECDICT phrase fallback，`matchType=external_dictionary_exact`，`providerRequestId=null`
    - `access` -> structured exact，仍走 provider，不被 ECDICT 抢答
- 2026-05-09 ECDICT profile 接入普通查词路由后：
  - `corepack pnpm test src/features/answering/chat-service.test.ts src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.test.ts`
    - 3 files / 31 tests passed
  - `corepack pnpm lint src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/content/ecdict-basic-profiles.ts src/app/api/chat/route.ts`
    - 通过
  - `corepack pnpm exec tsx -e "...createEcdictBasicProfileLookup...lookup('accent')..."`
    - 从本地 `output/external-dictionaries/ecdict.csv` 读到 `accent`，返回 `sourceKind=external_dictionary_basic`、`reviewStatus=unreviewed`
- 2026-05-09 ECDICT source-only 审计后：
  - 下载 ECDICT `ecdict.csv` 到本地 ignored 路径 `output/external-dictionaries/ecdict.csv`。
  - `corepack pnpm eval:ecdict:audit -- --report-name ecdict-source-only-v1`
    - source-only candidates=7381；dictionary rows=770611；matched=7372；missing=9；coverage=99.88%；direct_usable=4341；cleaned_usable=3003；noisy_or_empty=28。
    - 报告落盘：`output/ecdict-source-only-audit/ecdict-source-only-v1.json` 和 `.md`。
  - `corepack pnpm test scripts/lib/ecdict-source-only-audit.test.ts scripts/lib/source-only-lookup-sample.test.ts`
    - 2 files / 14 tests passed
  - focused eslint on ECDICT audit files
    - 通过
- 2026-05-09 ECDICT basic profile 第一刀后：
  - `corepack pnpm test src/features/content/ecdict-basic-profiles.test.ts scripts/lib/ecdict-source-only-audit.test.ts`
    - 2 files / 10 tests passed
  - `corepack pnpm lint src/features/content/ecdict-basic-profiles.ts src/features/content/ecdict-basic-profiles.test.ts`
    - 通过
- 2026-05-09 source-only 规模验收 v1 后：
  - `corepack pnpm test scripts/lib/source-only-lookup-sample.test.ts scripts/run-answer-style-provider-smoke.test.ts`
    - 2 files / 16 tests passed
  - focused eslint on source-only sampling files
    - 通过
  - `corepack pnpm eval:source-only:provider -- --limit 300 --report-name source-only-scale-v1-300-alpha`
    - 300 total / 300 pass / 0 manual / 0 fail；candidate pool=7381；avgElapsedMs=3716；p90 answer length=57；structuredEntryCandidates=0
    - 报告落盘：`output/source-only-lookup-sample/source-only-scale-v1-300-alpha.json` 和 `.md`
  - 首次 300 样本中 `x-ray` 触发 root parser no_match，已收紧 sample filter 为纯字母 lemma；重跑后通过。
- 2026-05-09 source-only 普通查词抽样工具后：
  - `corepack pnpm test scripts/lib/source-only-lookup-sample.test.ts scripts/lib/answer-style-provider-smoke.test.ts src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.test.ts scripts/run-answer-style-provider-smoke.test.ts`
    - 5 files / 62 tests passed
  - focused eslint on changed source-only sampling / answering / provider-smoke files
    - 通过
  - `corepack pnpm eval:source-only:provider -- --limit 10`
    - 10 total / 10 pass / 0 fail；候选池显示 7404 个 lookup-friendly source-only lemmas；样例包括 `abbreviation`、`abide`、`abolish`、`about`
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
- 2026-05-09 普通查词词性缩写与污染变体清理后：
  - `corepack pnpm test src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 3 files / 49 tests passed
  - focused eslint on changed answering/provider-smoke files
    - 通过
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail；真实输出中 `institute n.机构；v.设立，制定。`，`accent` 使用 `n./v.`
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
- 2026-05-09 source-only exact 优先级修复后：
  - `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts src/features/answering/chat-service.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 3 files / 101 tests passed
  - focused eslint on retrieval source/test files
    - 通过
  - 22 条 source-only provider 抽样 smoke（临时复用 `runAnswerStyleProviderSmoke`）
    - 22 total / 22 pass / 0 fail；`emphasis`、`frequency`、`journal` 均回到 source lemma exact grounding
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail
- 2026-05-09 source-only 普通查词输出模板收紧后：
  - `corepack pnpm test src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 3 files / 47 tests passed
  - focused eslint on changed answering/provider-smoke files
    - 通过
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail；`accent` 输出包含“核心义”和“简单理解”
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
- 2026-05-09 Scheme C source lemma fallback 后：
  - `corepack pnpm test src/features/content/source-lemma-sources.test.ts scripts/check-vocab-content.test.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/chat-service.test.ts src/features/answering/chat-provider.test.ts src/features/answering/build-system-prompt.test.ts scripts/lib/answer-style-provider-smoke.test.ts scripts/lib/black-box-product-smoke.test.ts`
    - 8 files / 125 tests passed
  - focused eslint on changed source/retrieval/answering/smoke files
    - 通过
  - `corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas`
    - 546 entries / 34 confusion groups / scopes=gaokao, cet4, cet6
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail（新增 source lemma `accent` case）
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail（新增 source lemma `accent` case）
- 2026-05-08 普通查词 exact lookup 污染验收后：
  - `corepack pnpm test src/features/answering/chat-provider.test.ts src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.test.ts`
    - 3 files / 26 tests passed
  - focused eslint on changed answering files
    - 通过
  - `corepack pnpm eval:standard-lookup:provider`
    - 20 total / 20 pass / 0 fail
  - `corepack pnpm eval:product-smoke`
    - 37 total / 37 pass / 0 fail
- 2026-05-03 Answer Policy / spelling-assist / UI smoke 后：
  - `corepack pnpm test src/features/answering/chat-service.test.ts`
    - 1 file / 12 tests passed
  - `corepack pnpm test src/features/answering/chat-service.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx`
    - 3 files / 23 tests passed
  - focused eslint
    - 通过
  - `corepack pnpm eval:product-smoke`
    - 37 total / 37 pass / 0 fail
  - API smoke：
    - `你好` -> `plain` / no grounding / no provider
    - `complex 和 complicate 是一个意思吗` -> `plain` / no grounding / provider called
    - `reqxust 是什么意思` -> `plain` / no grounding / provider called / spelling candidates
    - `tion 结尾的词有哪些` -> grounded resolved / 15 main answers
    - `access assess excess 怎么区分` -> grounded resolved / 3 main answers
    - `re+con 的词根有什么词` -> grounded no_match / no provider
  - 移动宽度 UI smoke：
    - 390px，无页面级横向溢出
    - plain 分支不显示 `命中状态`、`暂未稳定命中`、收藏工具
    - grounded 分支保留命中状态和收藏工具
- 2026-04-27 root fragment condition parser 后：
  - `corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-system-prompt.test.ts scripts/lib/black-box-product-smoke.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 5 files / 107 tests passed
  - `corepack pnpm eval:answer-style`
    - 20 pass / 0 fail
  - `corepack pnpm eval:answer-style:provider`
    - 16 total / 15 pass / 1 manual / 0 fail
- 2026-04-26 real-smoke batch 3 后：
  - `corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas`
    - 546 entries / 34 confusion groups / scopes=gaokao, cet4, cet6
  - `corepack pnpm eval:lookalike:real-smoke`
    - 14 pass / 0 fail
- 历史整体验证：
  - `corepack pnpm verify`
    - 曾通过 lint、unit、integration、默认 Chromium E2E
  - `corepack pnpm exec tsc --noEmit`
    - 已知未清，集中在测试 fixture 类型、`use-chat-session` 响应联合类型、`pg` ESM 声明缺失及其连带 row 隐式 any

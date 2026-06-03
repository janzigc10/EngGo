# EngGo 滚动交接

## 当前状态（2026-06-03 Model-assisted Intent Routing V1 已完成待 review）
- 当前分支 / worktree：`codex/controlled-tool-router-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 当前活跃计划：`docs/superpowers/plans/2026-06-03-model-assisted-intent-routing-v1.md`。
- 当前活跃设计：`docs/superpowers/specs/2026-06-03-model-assisted-intent-routing-v1-design.md`。
- 当前验收报告：`docs/superpowers/reports/2026-06-03-model-assisted-intent-routing-v1-comparison.md`。
- 本轮结果：已在 Controlled Tool Router V1 上完成“规则高置信直走 + 灰区 provider classifier + 参数来源校验 + grounding/observation 质量闸门”的混合意图路由 V1，并用 backend / frontend / live HTTP smoke / before-after matrix 验证。
- 保留边界：
  - 不做完整 ReAct Agent。
  - 不让模型自由规划多步工具或自由扩词。
  - 明确查词、明确 direct compare、明确词族/形近仍走确定性规则。
  - LLM 只补灰区 intent / slots，输出内容仍必须基于工具 observation / grounding。
  - 不改 Learn / Review / Progress 状态机。

## 本轮已完成
1. 文档：
   - 新增 `docs/superpowers/specs/2026-06-03-model-assisted-intent-routing-v1-design.md`。
   - 新增并完成 `docs/superpowers/plans/2026-06-03-model-assisted-intent-routing-v1.md`。
   - 新增 `docs/superpowers/reports/2026-06-03-model-assisted-intent-routing-v1-comparison.md`。
   - 更新 `docs/README.md`、`progress.md`、`bugs.md`。
2. 路由与 classifier：
   - `ChatToolRoutePlan` 增加 `source`、`confidence`、`ambiguityReasons`、`classified_intent`。
   - 新增 `backend/app/answering/intent_classifier.py`，灰区 provider classifier 只返回受限 JSON。
   - classifier 只在 semantic expression 灰区调用；terms 必须来自用户原文或上一轮 candidates，模型扩词会被丢弃。
3. semantic expression：
   - `normalize_query` / `LearningIntentPlan` 新增 `semantic_expression`。
   - 承接 `同义词 / 近义 / 意思差不多 / 写作表达 / formal way to say`。
   - `AdvancedLookupService.answer_semantic_expression()` 只做 provider-assisted expression advice，不声称词库命中；provider 不可用时返回 bounded plain fallback。
4. broad quality gate：
   - root combo `a+b` 必须有候选直接命中有序片段，才允许 broad resolved。
   - `anti+dis 的词根有什么词` 不再 resolved 到 `antique / anew / attic...` 弱候选。
   - `re+con 的词根有什么词` 仍保留已有动态候选能力。
5. semantic style follow-up：
   - `还有更适合作文的吗 / 还有更正式的吗 / 有没有更口语的` 先走上一轮候选内 `context_choice`。
   - 不再被普通 `show_more` 抢走；无上下文或候选不足仍 clarification。

## Before baseline：2026-06-02 no-match / weak-answer audit
1. 真实 Next proxy `/api/chat` 探测确认：当前 hard `resolution=no_match` 主要集中在随机/不稳定英文串、完全无候选的词根/词族/词形条件、形近 seed 本身不稳定，以及无上下文追问转 clarification。
2. 更大的产品风险不是 hard no-match，而是“误 resolved 但弱回答”：
   - `anti+dis 的词根有什么词` 会 resolved，但召回 `antique / anew / attic...` 一类弱相关候选。
   - `跟 abandon 意思差不多的词`、`responsible 的同义词` 被历史测试刻意排除出词族/形近后，没有新的近义/表达工具承接，容易退成普通查词。
   - `遵循的英文是什么` 后追问 `还有更适合作文的吗` 是已知 deferred 场景：当前 `还有吗` 动作优先，缺少 semantic style follow-up。
   - 英文整句 `more formal way to say follow` 会先被拆成多 token 普通查词，再靠 no-match recovery 接住；这说明英文表达/语域意图还没有进入显式工具路由。
3. 本轮将以这些样例作为 before/after comparison matrix 的核心行，证明增强不是只靠测试变绿。

## 最新验证
- Focused backend：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py backend\tests\test_chat_contract.py backend\tests\test_chat_tool_router.py backend\tests\test_learning_intent.py backend\tests\test_learning_context.py` -> 178 passed。
- Full backend：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_full -p no:cacheprovider` -> 346 passed。
  - 说明：默认用户临时目录和 `C:\tmp` 在当前 sandbox 下不可写，完整 pytest 使用 workspace 内 `tmp_pytest_full`，结束后已删除。
- Frontend unit：
  - `corepack pnpm test:unit` -> 42 files / 329 tests passed。
  - 首次 sandbox 内读取 `node_modules` 的 vitest 文件 EPERM，提权后通过。
- Lint / diff：
  - `corepack pnpm lint -- src scripts` -> passed。
  - `corepack pnpm lint` 全量会扫到历史 `.pytest-cache-codex` 目录并 EPERM；该目录是 2026-05-16 旧缓存，不属于本轮代码问题。
  - `git diff --check` -> passed，仅 Windows LF -> CRLF warnings。
- Live HTTP smoke：
  - 临时 FastAPI 子进程 `127.0.0.1:8000`，`OPENAI_API_KEY=""`，脚本结束后已终止。
  - 4 / 4 pass：`你好` plain；`more formal way to say follow` providerless semantic expression；`anti+dis 的词根有什么词` root no-match；`还有更适合作文的吗` 锁定 `follow / obey / comply` 走 `context_choice`。

## 下一步
1. review 时重点看：
   - grey-zone classifier 是否足够窄；
   - `semantic_expression` 是否清楚标注为 provider-assisted advice；
   - root combo quality gate 是否既压住 `anti+dis`，又不误伤 `re+con`；
   - `progress.md` / `bugs.md` / comparison report 是否足够支撑“相对上一版有真实增强”。

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
  - Next proxy smoke：`corepack pnpm eval:fastapi:conversation-context-smoke -- --base-url http://127.0.0.1:3000 --label next-proxy-controlled-orchestrator` -> 13 total / 13 pass / 0 fail。
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
- 不要继续围绕 `real-smoke` 小词书扩写背词内容；它现在只是历史开发切片和回归资产。
- 不要把 ECDICT 自动释义压缩当成人工 confusion graph；direct compare 要么走 provider 组织真实短辨析，要么干净退回并列释义。
- 不要在本轮基础上扩 Learn / Review 状态机、账号/云同步、完整 SRS、收藏体系或 NotebookLM 方向。
- 生成器依赖本地 `output/external-dictionaries/ecdict.csv`；该文件被 git ignore，提交的是 compact generated JSON。

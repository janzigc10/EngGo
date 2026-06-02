# EngGo 滚动交接

## 当前状态（2026-06-02 No-match / weak-answer audit 进行中）
- 当前分支 / worktree：`codex/controlled-tool-router-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 基线提交：`3899051 feat: add controlled chat orchestrator`。
- 最近完成计划：`docs/superpowers/plans/2026-06-01-controlled-tool-router-v1.md`。
- 当前目标：在 Controlled Tool Router V1 基础上定位真实运行态里还会 hard no-match 或“误 resolved 但弱回答”的场景，先定位根因，不先放宽闸门。
- 当前实现基线已完成：把 `/api/chat` 的隐式 service loop 改成显式内部 tool route plan，继续保持上一版 no-match recovery 和自然多轮 continuation。
- 本轮范围：
  - 新增 internal tool protocol / rule-first route planner。
  - 不引入 LangChain / LangGraph。
  - 不让 provider 每轮先做 intent classification。
  - 不改 Learn / Review / Progress 状态机。
- 已落地基线：
  - direct compare 不再把人工 `quickDistinction`、confusion graph 或人工 pair/group 元数据当主能力。
  - 主路径是：解析用户明确提到的英文词 -> 优先查 ECDICT-backed candidates -> provider 组织短中文辨析。
  - provider 不可用或失败时，只退回干净的并列词典释义。
  - 不再追加“当前没有人工易混组；先按核心义区分”这种低价值 fallback。
  - 已有人工组最多作为历史兼容，不再批量维护或扩成系统化 graph。
  - GitHub-facing `README.md` 已更新到当前产品状态：ECDICT 大词库、Learn / Review / Progress、FastAPI 主链路、ECDICT-grounded direct compare 和下一阶段类 Agent 化方向。

## 本轮完成内容
1. 已从 `codex/controlled-chat-orchestrator-v1` 切出 `codex/controlled-tool-router-v1`。
2. 新增 `docs/superpowers/specs/2026-06-01-controlled-tool-router-v1-design.md` 和 `docs/superpowers/plans/2026-06-01-controlled-tool-router-v1.md`。
3. 更新 `docs/README.md` 与本文件，将 Controlled Tool Router V1 设为当前活跃计划。
4. 新增 `backend/app/answering/chat_tool_router.py`，把 ordinary lookup、direct compare、advanced lookup 显式包装成内部 chat tools，并由 `normalize_query()` 生成 rule-first route plan。
5. `/api/chat` 已从隐式 service tuple loop 改为执行 `ChatToolRoutePlan`；direct compare、meaning / shape / root、ordinary lookup 会优先进入对应工具，同时保留 UnsupportedQueryMode fallback、provider error mapping、no-match recovery 和 conversation context 构造。
6. 已补 `backend/tests/test_chat_tool_router.py` 与 `/api/chat` contract 覆盖，确认 direct / advanced 不再依赖 ordinary preflight；当前 focused router tests：`41 passed`。
7. 浏览器 E2E 发现并修复 `restrain vs constrain` 中 `vs` 被误当作 compare candidate 的问题；`normalize_query()` 现在会在 compare terms 中过滤 `vs / versus / or`。

## 2026-06-02 no-match / weak-answer 定位结果
1. 真实 Next proxy `/api/chat` 探测确认：当前 hard `resolution=no_match` 主要集中在随机/不稳定英文串、完全无候选的词根/词族/词形条件、形近 seed 本身不稳定，以及无上下文追问转 clarification。
2. 更大的产品风险不是 hard no-match，而是“误 resolved 但弱回答”：
   - `anti+dis 的词根有什么词` 会 resolved，但召回 `antique / anew / attic...` 一类弱相关候选。
   - `跟 abandon 意思差不多的词`、`responsible 的同义词` 被历史测试刻意排除出词族/形近后，没有新的近义/表达工具承接，容易退成普通查词。
   - `遵循的英文是什么` 后追问 `还有更适合作文的吗` 是已知 deferred 场景：当前 `还有吗` 动作优先，缺少 semantic style follow-up。
   - 英文整句 `more formal way to say follow` 会先被拆成多 token 普通查词，再靠 no-match recovery 接住；这说明英文表达/语域意图还没有进入显式工具路由。
3. 当前定位到的结构性根因：
   - broad grounding 只用候选数量阈值，缺少“候选质量 / 约束强度”阈值，导致弱片段命中也可能被标成 resolved。
   - `同义 / 近义 / 意思差不多 / 写作表达` 方向被排除出 word family / shape neighbors，但尚未建成独立 semantic expression tool。
   - 多轮 resolver 只覆盖 `哪个...正式/自然/适合...`，对 `还有更适合作文的吗` 这类 continuation + style choice 混合问法没有安全改写。

## 最新验证
- Backend focused tests：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_learning_context.py backend\tests\test_learning_intent.py backend\tests\test_ordinary_lookup_answer.py backend\tests\test_direct_compare_answer.py backend\tests\test_advanced_lookup.py backend\tests\test_chat_tool_router.py backend\tests\test_chat_contract.py` -> 197 passed。
- Frontend / smoke unit：
  - `corepack pnpm test src\components\chat\chat-workspace.test.tsx src\features\chat\conversation-context.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 3 files / 40 tests passed。
- Lint / diff：
  - `corepack pnpm lint -- src\features\chat src\components\chat scripts\lib\conversational-learning-context-smoke.ts scripts\run-conversational-learning-context-smoke.ts` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warning。
- Runtime / E2E：
  - 已重启本地 dev stack，当前监听：Next `127.0.0.1:3000` PID `35652`，FastAPI `127.0.0.1:8000` PID `40052`。
  - FastAPI health：`http://127.0.0.1:8000/health` -> `status=ok`。
  - Next proxy smoke：`corepack pnpm eval:fastapi:conversation-context-smoke -- --base-url http://127.0.0.1:3000 --label next-proxy-controlled-tool-router-restarted` -> 13 total / 13 pass / 0 fail。
  - in-app Browser：`access` 普通查词通过；`restrain vs constrain` 只展示 `restrain / constrain` 两个候选，不再把 `vs` 当候选；`how do I use these words` 接住上一轮两个候选；`how to learn English fast` 不 hard no-match、不暴露内部字段；console error 为空。
- 2026-06-02 探测：
  - 重新启动本地 dev stack 后确认 Next `127.0.0.1:3000` PID `50784`、FastAPI `127.0.0.1:8000` PID `48408`，FastAPI health 200。
  - 真实 Next proxy probe 覆盖随机串、拼写疑似、词根/词形、形近、表达召回、作文/翻译、学习方法和多轮追问；确认上述 no-match / weak-answer 分类。

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

## 下一步
1. 第一优先级：给 broad grounding 增加弱候选质量闸门，`anti+dis 的词根有什么词` 这类没有强约束命中的结果应 no-match 或 bounded clarification，而不是 resolved 弱列表。
2. 第二优先级：补一个受控 semantic expression / synonym tool，承接 `意思差不多的词`、`同义词`、`写作里怎么表达...`、`more formal way to say...`，但仍不声称词库命中。
3. 第三优先级：补 semantic style follow-up resolver，覆盖 `遵循的英文是什么 -> 还有更适合作文的吗`，复用上一轮 candidates 并交给 provider 做候选内语域选择。
4. 如需进主线，review 后合并 `codex/controlled-tool-router-v1`；该分支基于 `codex/controlled-chat-orchestrator-v1`。

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

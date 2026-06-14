# EngGo 滚动交接

## 当前状态（2026-06-14 Chat answerSurface Contract V1.1 Hardening）
- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 当前活跃目标：Chat answerSurface Contract V1.1 已收口。FastAPI `/api/chat` 会在 `ChatSuccessResponse` 返回 `answerSurface`，前端 `AssistantAnswer` 优先按 `answerSurface.type` 渲染；`grounding` 继续保留为 evidence/context 和旧响应 fallback。
- 已覆盖并验证的 surface：`lookup`、`phrase_lookup`、`compare`、`expression_advice`、`candidate_list`、`root_family`、`plain`、`context_choice`、`clarification`。
- 保留边界：
  - 不重开 App Shell / IA。
  - 不改 Learn / Review 状态机。
  - 不做真 streaming。
  - 不恢复 Next `/api/chat` proxy。
  - 不恢复 Prisma dev / `db:*` / `real-smoke` / 旧 `eval:product-smoke`。
  - 不让 provider 自由扩词或决定工具参数。
  - `grounding` 仍是证据与上下文来源，`answerSurface` 只负责稳定展示协议。
- 本地验收入口：前端 `http://localhost:3000`，FastAPI `http://127.0.0.1:8000`。Next dev 仍优先用 `localhost`，不要改回 `127.0.0.1:3000` 做页面 QA。

## 本轮已完成
1. 后端 contract：
   - `backend/app/schemas/chat.py` 新增集中式 `answerSurface` builder，并在 `ChatSuccessResponse` 初始化时自动填充。
   - `compare` 可在 `comparisonView is None` 时从 `grounding.mainAnswer` 生成 `members`，解决 provider-backed direct compare 只能退成长段文本的问题。
   - `semantic_expression` 与 `meaning_expression_advice` 均输出 `expression_advice`，不再让 UI 把表达建议误当词库命中。
   - `shape_neighbor_search`、`root_family_summary`、`broad_vocab_summary`、`show_more` 可输出 `candidate_list`。
   - `lookup` 单项 resolved 现在固定输出 `lookup`，并从 answer body 修正 source-lemma 这类轻量候选的 `meaningZh`，避免显示 `source lemma exact match` 这类内部 reason。
   - `phrase_lookup` 现在按 surface type 明确输出；`make up`、`according to` 这类短语不再只靠前端从 lemma 猜。
   - `root_family` 现在从 `rootFamilyView.members[].modernMeaningZh` 生成 surface `members[].meaningZh`，并透出 `note`、`caution`、`source=root_family_view`。
   - 无 grounding 的寒暄/兜底输出 `plain`；无上下文追问输出 `clarification`。
2. 前端 contract：
   - `src/features/chat/types.ts` 新增 `AnswerSurface` 类型，并把 `semantic_expression` 纳入 `QueryMode` / `AnswerStyle`。
   - `src/features/chat/use-chat-session.ts` 透传 `payload.answerSurface` 到 assistant message。
   - `src/components/chat/assistant-answer.tsx` 优先按 `answerSurface.type` 渲染；旧 `grounding` 推断路径保留为 legacy fallback。
   - `phrase_lookup` 显示短语副标题；`root_family` surface 显示 note/caution 和成员中文义项。
   - `src/components/chat/answer-actions.tsx` 兼容轻量 `meaningZh` 与旧 `meaningsZh[]`。
3. 测试覆盖：
   - 后端补了 `lookup`、`phrase_lookup`、`root_family`、`compare`、`expression_advice`、`candidate_list`、`plain/clarification` 的 contract 断言。
   - 前端补了 `answerSurface` 驱动的 `lookup`、`phrase_lookup`、`candidate_list`、`compare`、`expression_advice`、`root_family`、`plain` 渲染用例，覆盖 `comparisonView=null` 的 compare 和 `rootFamilyView=null` 的 surface 渲染。

## 当前待办
1. answerSurface Contract V1.1 已完成。后续不建议继续在这一轮里扩字段；只在发现真实 matrix 漏洞时补小红测。
2. 若要做真 stream，单独开 Chat Streaming Contract V1：定义 FastAPI streaming contract、前端 incremental message state、最终 `answerSurface` 落地时机、错误/取消/重试语义。不要和 V1.1 surface 收口合并。
3. 本地环境注意：
   - `corepack pnpm dev:fastapi` 会因为已有 Next dev server 占用 3000 而拒绝启动；本轮曾改用单独 FastAPI + 单独 Next 方式验证。
   - Windows `Start-Process` 仍可能命中 `Path/PATH` 重复环境坑；按 `bugs.md` 先归一化再启动。
   - in-app Browser 如出现空 DOM / CDP 导航卡住，先重新获取 `iab` browser session 并重开 tab；本轮重连后已完成 `/chat` 真实发送验证，不是页面 Failed to fetch。
   - 本轮发现现有 `127.0.0.1:8000` 可能是 stale FastAPI 进程；验收当前代码时如结果不符合最新 contract，先重启 FastAPI 或临时起新端口验证，不要直接当成代码回归。

## 最新验证（本轮）
- Backend focused pytest：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_chat_contract.py backend\tests\test_ordinary_lookup_answer.py backend\tests\test_advanced_lookup.py -o cache_dir=.runlogs/pytest-cache --basetemp=.runlogs/pytest-basetemp` -> 115 passed。
- Frontend focused Vitest：
  - `corepack pnpm test -- src\components\chat\chat-workspace.test.tsx` -> 32 files / 260 tests passed。
- Lint / build / diff：
  - `corepack pnpm lint -- src\features\chat\types.ts src\components\chat\assistant-answer.tsx src\components\chat\chat-workspace.test.tsx` -> passed。
  - `corepack pnpm build` -> passed；Next 16.2.4 compiled, TypeScript passed, 11 static pages generated。
  - `git diff --check` -> passed，只有 Windows LF/CRLF warnings。
- Real FastAPI `/api/chat` probes（临时 current-code FastAPI, Node fetch, `http://127.0.0.1:8010`，跑完已停止）：
  - `access 是什么意思` -> 200, `answerSurface.type=lookup`, title `access`, source-lemma body 修正为真实释义。
  - `make up 是什么意思` -> 200, `answerSurface.type=phrase_lookup`, title `make up`, subtitle `短语`。
  - `tran开头的单词有哪些` -> 200, `answerSurface.type=candidate_list`, 18 items。
  - `re+con+sub 的词根有什么词` -> 200, `answerSurface.type=plain`, `queryMode=root_family_summary`, `resolution=no_match`。
- in-app Browser `/chat` probe（`http://localhost:3000/chat` + current-code FastAPI `127.0.0.1:8000`）：
  - 发送 `make up 是什么意思`；页面显示 `短语`、`make up` 和释义；无 Failed to fetch；console error 为空；`scrollWidth=clientWidth=1265`。

## 上一轮已完成
1. 按用户要求使用 `design-taste-frontend` 的 redesign / audit 口径和 Brainstorm visual companion；没有直接改实现代码。
2. 重新审计当前渲染 UI：确认主要问题是大 header 卡、顶部 pill nav、Learn / Review / Progress 重复词书切换和嵌套卡片，整体不像一个稳定 app shell。
3. 通过 visual companion 逐步收敛方案：
   - 否定常驻顶部主导航。
   - 否定常驻左侧导航。
   - 确认抽屉式主导航。
   - 确认抽屉只放 `Today / Learn / Review / Chat`。
   - 确认词书页单独做路由，不进入抽屉导航。
   - 确认底部工具组 V1 只放一个词书图标。
   - 确认具体配色为 Ink Amber，并记录白字压 amber 对比度不足的约束。
4. 写入正式设计文档 `docs/superpowers/specs/2026-06-12-app-shell-redesign-v1-design.md`。
5. 更新 `docs/README.md`，把 App Shell Redesign V1 加入当前有效设计。

## 上一轮验证
- Browser visual companion：`http://localhost:64986` 已展示最终确认稿，用户回复“嗯”确认；随后又确认 Ink Amber 配色。
- 该轮只产出设计文档；实现与验收已在本轮 App Shell Redesign V1 中完成。

## 上一轮完成内容（Wordbook Daily Overview V1）
1. 重新扫了当前首页、Wordbook dashboard、progress store、active session store、study settings store 和相关测试，确认 Learn / Review / Progress 已经可用，缺口主要是首页右侧仍是静态工作区文案。
2. 新增 `src/features/wordbook/wordbook-daily-overview.ts` 和 `src/features/wordbook/wordbook-daily-overview-panel.tsx`，首页右侧改成“今日学习概览”，并行展示继续复习、继续学习、学习新词和查看进度等入口，不输出单一 daily priority。
3. `ChatWorkspace` 已移除旧静态 aside，改为挂载 Wordbook Daily Overview panel；相关 focused tests、lint、unit、build、`git diff --check` 和 Browser QA 当时均已通过。
4. 新增 `bugs.md` 环境坑：Next 16 dev 下 Browser QA 应优先用 `http://localhost:3000`，`127.0.0.1:3000` 会被 `allowedDevOrigins` 拦截 dev resources，可能造成误判。

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

# EngGo 滚动交接

## 当前状态（2026-06-12 Wordbook Daily Overview V1）
- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 当前活跃目标：完成首页 Wordbook Daily Overview V1，并用浏览器验收。
- 产品口径已改：不做“系统告诉用户今天必须先做什么”。用户可以自由选择查词、学习、复习或看进度；首页只把当前词书状态和入口讲清楚。
- 当前实现方向：复用现有 `WordbookDashboard`、progress records、study settings、active session store 和 active wordbook，不改 Learn / Review / Progress 状态机。
- 上一轮已完成基线：Scope Closure + Legacy Cleanup + Frontend Direct FastAPI + Affix Semantic Gate 均已验证；聊天、检索、辨析和词缀语义 gate 先进入维护。
- 保留边界：
  - 不做完整 ReAct Agent。
  - 不让 provider 自由扩词或决定工具参数。
  - 不做完整词根溯源或 morpheme analyzer。
  - 不改 Learn / Review / Progress 状态机。
  - 不迁移 Vite React。
  - 不恢复 Prisma dev / `db:*` / `real-smoke` / 旧 `eval:product-smoke`。

## 本轮已完成
1. 重新扫了当前首页、Wordbook dashboard、progress store、active session store、study settings store 和相关测试，确认 Learn / Review / Progress 已经可用，缺口主要是首页右侧仍是静态工作区文案。
2. 新增 `src/features/wordbook/wordbook-daily-overview.ts`：
   - 输入当前词书、词书进度、学习设置、未完成 Learn / Review 轮次。
   - 输出自然语言概览、状态指标和入口列表。
   - 不输出单一 daily priority；Review、新词、继续学习和进度可以并列出现。
3. 新增 `src/features/wordbook/wordbook-daily-overview-panel.tsx`，把首页右侧改成“今日学习概览”：
   - 展示待复习、可学习、学习中、已通过。
   - 根据本地状态展示 `继续复习`、`继续学习`、`复习到期词`、`学习新词`、`查看进度`。
   - 文案避开“推荐 / 优先 / 必须 / 先做什么”的强制排序。
4. `ChatWorkspace` 已移除旧静态 aside，改为挂载 Wordbook Daily Overview panel。
5. 已补 focused tests：
   - helper 层验证复习和新词并列出现，不被压成一个强制选择。
   - panel 层验证从 localStorage 读取 due review 和 active learn session。
   - ChatWorkspace 层验证旧静态文案已退役。
6. Browser 验收时发现并修复首页概览的 hydration mismatch：服务端先稳定渲染默认词书概览，客户端 mount 后再读取 localStorage 中的 active session / progress。
7. 新增 `bugs.md` 环境坑：Next 16 dev 下 Browser QA 应优先用 `http://localhost:3000`，`127.0.0.1:3000` 会被 `allowedDevOrigins` 拦截 dev resources，可能造成误判。
8. `corepack pnpm build` 暴露既有 `use-chat-session.ts` assistant message 类型推断问题；已用显式 `ChatMessage` 注解修掉，生产 build 通过。

## 最新验证（本轮）
- `corepack pnpm test src\features\wordbook\wordbook-daily-overview.test.ts src\features\wordbook\wordbook-daily-overview-panel.test.tsx src\components\chat\chat-workspace.test.tsx` -> 3 files / 32 tests passed。
- `corepack pnpm lint` -> passed。
- `corepack pnpm test:unit` -> 28 files / 233 tests passed。
- `corepack pnpm build` -> passed；`/`、`/collections`、`/learn`、`/progress`、`/review` 均完成静态生成。
- `git diff --check` -> passed，仅 Windows LF -> CRLF warnings。
- Browser / computer use：
  - `http://127.0.0.1:3000` 首次验收暴露 Next 16 dev resource origin 拦截，已改用 `http://localhost:3000` 并记录到 `bugs.md`。
  - 首页右侧显示“今日学习概览”，真实本地状态下同时出现 `继续复习`、`继续学习`、`查看进度`，没有输出一个唯一推荐动作。
  - 概览链接可进入 `/review`、`/learn`、`/progress`；目标页可见对应 dashboard / progress 内容。
  - 修复 hydration gate 后，新标签页重新打开首页没有新的 console error / warning。
  - 390px viewport 下无横向溢出，概览卡片和入口链接宽度正常。

## 下一步
1. 本轮可提交。
2. 后续如果继续 Wordbook 产品线，下一刀再处理 Chat -> Wordbook 的沉淀入口：查词 / 收藏后的词如何更自然进入之后的 Learn / Review。
3. 不要把本轮概览扩成强制 daily priority；保留“用户想干什么就点什么”的产品口径。

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

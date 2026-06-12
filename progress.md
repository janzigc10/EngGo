# EngGo 滚动交接

## 当前状态（2026-06-12 App Shell Redesign V1 Design）
- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 当前活跃目标：前端 UI 从“几个独立页面 + 顶部 pill nav + 层层卡片”收成一个移动优先的 app shell；已完成设计确认，尚未开始实现。
- 当前有效设计：`docs/superpowers/specs/2026-06-12-app-shell-redesign-v1-design.md`。
- 用户已确认的信息架构：
  - 顶部不放主导航，只保留三条杠菜单按钮和当前页面标题。
  - 三条杠 / 左滑唤醒抽屉，抽屉只放 `Today / Learn / Review / Chat`。
  - 词书入口不进抽屉；底部只放一个 book icon，进入 `/wordbook`。
  - `/wordbook` 集中承载词书切换、学习设置、总词数、已学、复习次数、每日背词量曲线。
  - `Progress` 从主导航退役，数据并入词书详情页。
  - Learn / Review 页面专注会话，不再塞词书切换和解释卡。
- 产品口径保持：不做“系统告诉用户今天必须先做什么”。用户自由选择 Today、Learn、Review、Chat 或进入词书页。
- 上一轮已完成基线：Scope Closure + Legacy Cleanup + Frontend Direct FastAPI + Affix Semantic Gate 均已验证；聊天、检索、辨析和词缀语义 gate 先进入维护。
- 保留边界：
  - 不做完整 ReAct Agent。
  - 不让 provider 自由扩词或决定工具参数。
  - 不做完整词根溯源或 morpheme analyzer。
  - 不改 Learn / Review 状态机。
  - 不迁移 Vite React。
  - 不做账号、云同步或后端化学习进度。
  - 不恢复 Prisma dev / `db:*` / `real-smoke` / 旧 `eval:product-smoke`。

## 本轮已完成
1. 按用户要求使用 `design-taste-frontend` 的 redesign / audit 口径和 Brainstorm visual companion；没有直接改实现代码。
2. 重新审计当前渲染 UI：确认主要问题是大 header 卡、顶部 pill nav、Learn / Review / Progress 重复词书切换和嵌套卡片，整体不像一个稳定 app shell。
3. 通过 visual companion 逐步收敛方案：
   - 否定常驻顶部主导航。
   - 否定常驻左侧导航。
   - 确认抽屉式主导航。
   - 确认抽屉只放 `Today / Learn / Review / Chat`。
   - 确认词书页单独做路由，不进入抽屉导航。
   - 确认底部工具组 V1 只放一个词书图标。
4. 写入正式设计文档 `docs/superpowers/specs/2026-06-12-app-shell-redesign-v1-design.md`。
5. 更新 `docs/README.md`，把 App Shell Redesign V1 加入当前有效设计。

## 最新验证（本轮）
- Browser visual companion：`http://localhost:64986` 已展示最终确认稿，用户回复“嗯”确认。
- 本轮是 docs/design-only，未运行前端实现测试。

## 下一步
1. 本轮可提交设计文档与交接更新。
2. Brainstorm 规范的 subagent spec review 受当前 subagent 工具“必须由用户显式要求 delegation”限制；如果要严格跑 subagent review，需要用户明确授权。
3. 用户 review 当前 spec 后，下一步写实现计划。建议第一刀顺序：
   - App shell + drawer + route IA：`/` Today、`/chat` 迁移、`/learn`、`/review`、`/wordbook`。
   - Wordbook route：复用现有 active wordbook / settings / snapshot，集中词书切换和数据。
   - Daily stats store + compact activity chart。
   - Retire top pill nav and remove Learn / Review 内的词书切换块。
4. 不要把 Today 或 Wordbook 扩成强制 daily priority；保持用户自由选择。

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

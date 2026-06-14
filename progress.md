# EngGo 滚动交接

## 当前状态（2026-06-14 Chat Card-Shell Streaming V1 收口）
- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 已提交基线：`5e814d2 Harden chat answer surface contract`，收口 Chat `answerSurface` V1.1；`grounding` 继续作为 evidence/context 与 legacy fallback，`answerSurface` 是前端稳定展示协议。
- 本轮收口工作：Chat Card-Shell Streaming V1 已实现并验证，准备作为本次提交随当前分支推送。FastAPI `/api/chat/stream` 会在 provider-backed `compare` / `expression_advice` / `context_choice` 前发 `surface_start`，前端先显示 answerSurface 卡片壳，再把 `answer_delta` 写进卡片内 `surface.text`，`final` 后用完整 answerSurface 替换并显示 rows/options/items。
- 本轮仍是传输层 stream contract：后端复用现有 `/api/chat` 生成最终合同，再按最终 answer 切 chunk。还不是 upstream provider token streaming。
- 本地当前服务：FastAPI `http://127.0.0.1:8000` 和 Next `http://127.0.0.1:3000` 已重启到当前代码 / 当前 build。

## 本轮已完成
1. 后端 streaming contract：
   - `backend/app/api/chat.py` 的 `/api/chat/stream` 事件扩展为 `meta`、可选 `surface_start`、可选 `answer_delta`、`final`、`error`。
   - `surface_start.surface` 只保留卡片壳字段，例如 `type`、`title`、`subtitle`、`source`、`terms`、`meaningHint`、`style`，并把 `text` 置空。
   - `surface_start` 不带 `members` / `items` / `options`；这些结构化 rows 只随 final payload 落地。
   - deterministic `lookup` / `phrase_lookup` / `candidate_list` / `root_family` / `plain` / `clarification` 仍是 final-only，不恢复 Next `/api/chat` proxy。
2. 前端 card-shell streaming：
   - `src/features/chat/types.ts` 新增 `surface_start` stream event 和 `ChatMessage.isStreaming`。
   - `src/features/chat/chat-api-client.ts` 解析 `surface_start`。
   - `src/features/chat/use-chat-session.ts` 在 stream 过程中创建带 `answerSurface` 的 assistant draft；delta 更新 `answerSurface.text`，不再先显示纯文本消息再整体替换卡片。
   - `final` 后仍用完整 `ChatApiSuccessResponse` 替换 draft，并复用同一套 `grounding`、`conversationContext`、`resolvedFollowUp`、收藏副作用和 transcript 持久逻辑。
   - `src/components/chat/assistant-answer.tsx` 补了 `context_choice` surface 渲染，并修正 compare shell 无 rows 时正文重复渲染的问题。
   - `src/components/chat/message-thread.tsx` 保持 streaming assistant draft 出现后隐藏 loading skeleton。
3. 测试覆盖：
   - 后端断言 provider-backed compare stream 顺序为 `meta` -> `surface_start` -> `answer_delta...` -> `final`，且 shell 不包含 members。
   - 后端断言 deterministic lookup stream 仍只有 `meta` -> `final`。
   - 前端受控 SSE 测试证明：compare stream 中间态先出现 `Core difference` 卡片标题和增量正文，成员 rows 不出现；final 后 rows 稳定出现。

## 最新验证
- Backend focused pytest：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_chat_contract.py -o cache_dir=.runlogs/pytest-cache --basetemp=.runlogs/pytest-basetemp` -> 39 passed。
- Frontend Vitest：
  - `corepack pnpm test -- src\components\chat\chat-workspace.test.tsx` -> 32 files / 261 tests passed。
- Lint / build / diff：
  - `corepack pnpm lint -- src\features\chat\types.ts src\features\chat\chat-api-client.ts src\features\chat\use-chat-session.ts src\components\chat\assistant-answer.tsx src\components\chat\message-thread.tsx src\components\chat\chat-workspace.test.tsx` -> passed。
  - `corepack pnpm build` -> passed；Next 16.2.4 compiled, TypeScript passed, 11 static pages generated。
  - `git diff --check` -> passed，只有 Windows LF/CRLF warnings。
- Real FastAPI stream probes（当前代码 `127.0.0.1:8000`）：
  - `make up` -> `/api/chat/stream` 200, events `meta, final`, final `answerSurface.type=phrase_lookup`, `providerRequestId=null`。
  - `more formal way to say follow` -> `/api/chat/stream` 200, events `meta, surface_start, answer_delta... x10, final`；`surface_start.type=expression_advice`，shell 不带 rows/options，final `answerSurface.type=expression_advice`，`providerRequestId` 非空。
- Browser smoke：
  - Playwright headless 打开 `http://127.0.0.1:3000/chat`，输入 `make up` 并提交。
  - 页面向 `http://127.0.0.1:8000/api/chat` 发出 200 JSON；页面显示 `make up`、`短语` 和释义；console error 为空。

## 下一步
1. 下一轮若继续做流式，应进入 Full Card Streaming V1：先定义结构化增量事件和 final reconciliation 规则，再逐个 surface 家族实现。
2. 不建议继续扩大 stream heuristic；若要更强体感，应处理 upstream provider token streaming、取消/重试语义、以及错误时是否保留 partial draft。
3. 若要让中文 compare prompt 在真实运行时稳定出现 delta，需要确认后端运行时具备 structured compare surface；当前无 structured compare 时前端即使走 `/api/chat/stream` 也可能 final-only。
4. 不要在下一轮改 Learn / Review、App Shell、词书状态机、Prisma 或恢复 Next API proxy；这些都不是 card-shell streaming / full card streaming 的必要前提。

## 环境注意
- FastAPI CORS 当前对 3000 可用；临时非 3000 端口可能被 CORS 拦截，除非同步调整后端允许源。
- 本轮最终浏览器验证使用当前 build 的 `next start -p 3000`；如换回 Next dev，优先用 `http://localhost:3000`，不要用 `127.0.0.1:3000` 判断 dev hydration。
- Windows 上 `Start-Process` 启动 FastAPI / Next 时仍可能遇到旧的环境变量坑；如端口行为异常，先确认监听 PID 和 `.runlogs/*` 日志，不要直接判断为代码回归。
- `.codex/` 是既有未跟踪目录，当前任务不需要纳入提交。

## 稳定基线
- 聊天式 MVP、真实词库 smoke、易混词辨析、词根/碎片检索、聊天回答渲染层、Answer Policy v1 松绑 spike 已完成。
- 聊天式学习上下文 V1 / V2 / V3 已完成并进入维护状态：保留范围切换、`还有吗`、受控 `怎么背`、收藏页继续追问、候选内语境选择和有边界聊天兜底。
- ECDICT 是运行时默认大词库底座；旧 structured DB 降级为冻结覆盖层 / 可选增强 / 回归样例。
- Wordbook Learn / Review V1、体验打磨、V2 产品硬化、V2.1 active session persistence 及 Review 可见词数修复均已完成。

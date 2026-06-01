# EngGo 滚动交接

## 当前状态（2026-06-01 ECDICT-grounded Direct Compare V1 已完成验证）
- 当前分支 / worktree：`codex/ecdict-wordbook-expansion-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 最新完成计划：`docs/superpowers/plans/2026-06-01-ecdict-grounded-direct-compare-v1.md`。
- 当前产品决策已落地：
  - direct compare 不再把人工 `quickDistinction`、confusion graph 或人工 pair/group 元数据当主能力。
  - 主路径是：解析用户明确提到的英文词 -> 优先查 ECDICT-backed candidates -> provider 组织短中文辨析。
  - provider 不可用或失败时，只退回干净的并列词典释义。
  - 不再追加“当前没有人工易混组；先按核心义区分”这种低价值 fallback。
  - 已有人工组最多作为历史兼容，不再批量维护或扩成系统化 graph。

## 本轮完成内容
1. 新增 `docs/superpowers/specs/2026-06-01-ecdict-grounded-direct-compare-design.md` 和 `docs/superpowers/plans/2026-06-01-ecdict-grounded-direct-compare-v1.md`。
2. `DirectCompareService` 已改为 resolved compare 有 provider 时调用 provider，并传入 ECDICT-backed `mainAnswer` grounding。
3. direct compare exact terms 现在优先用 ECDICT candidates；如果 ECDICT 缺失，才退回可用 structured exact entry。
4. direct compare 不再查询/依赖人工 confusion group，也不再把未问到的 group member 加进 `confusionBoundary`。
5. provider prompt 保持轻量：说明核心区别，可补常见语境或搭配直觉，不主动扩第三个词，不声称人工易混组。
6. provider 失败或无 provider 时返回 deterministic dictionary lines，并保持 `answerKind="grounded"` 与 `mainAnswer` 供后续追问使用。

## 最新验证
- Backend focused tests：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_direct_compare_answer.py` -> 13 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_chat_contract.py -k "direct_compare or provider"` -> 8 passed / 18 deselected。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_direct_compare_answer.py backend\tests\test_chat_contract.py backend\tests\test_learning_context.py` -> 84 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py` -> 43 passed。
- Frontend lint / diff:
  - `corepack pnpm lint -- src\features\chat src\components\chat src\features\wordbook scripts\generate-ecdict-wordbook.ts` -> passed。
  - `git diff --check` -> passed，仅 Windows LF/CRLF warning。
- Runtime / E2E：
  - FastAPI 正在运行：`http://127.0.0.1:8000/health` -> `status=ok`。
  - Next 正在运行：`http://localhost:3000` -> 200 OK。
  - Node API smoke：`restrain 和 constrain 的区别` 返回 `providerRequestId` 非空、`queryMode=direct_compare`、`comparisonView=null`、`mainAnswer.sourceKind=["external_dictionary_basic","external_dictionary_basic"]`。
  - Playwright 浏览器 E2E：在首页输入 `restrain 和 constrain 的区别`，UI 渲染 provider 风格短辨析；无旧 fallback 文案；console errors 为空。

## 下一步
1. 用户手测 `http://localhost:3000` 首页聊天、`/learn`、`/review`、`/progress`。
2. 若手测认可，再决定是否提交 / 合并当前分支。
3. 后续如果要继续提升 direct compare，只应提升 ECDICT grounding 或 provider 输出质量，不要回到人工 graph / 批量 `quickDistinction` 路线。

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

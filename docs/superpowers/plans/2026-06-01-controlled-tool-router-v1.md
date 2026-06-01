# Controlled Tool Router V1 Plan

## Goal

把当前受控类 Agent 链路推进到显式内部 tool routing：不引入 LangChain / LangGraph，不让模型自由调用工具，先把已有查词、辨析和高级检索能力抽成统一路由协议，并保持 no-match recovery 与上下文续问能力。

## Scope

- 只改 `/api/chat` 后端链路、内部 router/helper、必要的 tests、smoke 和文档。
- 不改 Learn / Review / Progress。
- 不新增账号、收藏、NotebookLM、完整 SRS 或长期记忆。
- 不对每一轮都新增 provider intent-classification 调用。

## Task 0 - Docs And Branch
- [x] 从 `codex/controlled-chat-orchestrator-v1` 创建 `codex/controlled-tool-router-v1`。
- [x] 新增本 spec 和 plan。
- [x] 更新 `docs/README.md` 与 `progress.md`，把本轮设为当前活跃计划。

Acceptance:
- 新一轮工作有独立分支和明确交接文档，不混入上一版已推送基线。

## Task 1 - Internal Tool Protocol
- [ ] 新增内部 chat tool / route plan helper。
- [ ] 定义 `ordinary_lookup`、`direct_compare`、`advanced_lookup` 三个工具名和统一执行入口。
- [ ] 把 service result、unsupported mode、provider error 的处理集中在路由执行层。

Acceptance:
- `/api/chat` 不再手写普通 tuple service loop；工具调用边界可直接测试。

## Task 2 - Rule-first Route Planner
- [ ] 基于 `normalize_query()` 的 query mode 生成工具顺序。
- [ ] direct compare 直接进入 compare tool。
- [ ] meaning / shape / root 直接进入 advanced tool。
- [ ] direct lookup / fuzzy recall 直接进入 ordinary tool。
- [ ] 为 unknown / future mode 保留保守 fallback order。

Acceptance:
- 入口意图选择可以被单元测试断言，不再只能靠 service rejection 间接证明。

## Task 3 - Preserve Orchestrator Behavior
- [ ] 保留 bounded greeting / capability / learning mood 回答。
- [ ] 保留自然 context continuation 优先级。
- [ ] 保留 deterministic follow-up resolver 和 action handlers。
- [ ] 保留 no-match recovery、random blob 收口和 `clear_context` 元数据。

Acceptance:
- Controlled Chat Orchestrator V1 的浏览器可见改进不回退。

## Task 4 - Tests And Smoke
- [ ] 补 route planner 单元测试。
- [ ] 补 `/api/chat` contract tests，证明 direct / advanced 不再依赖 ordinary reject。
- [ ] 更新或保持 conversational context smoke。
- [ ] 跑 focused backend tests、frontend smoke unit、lint、`git diff --check`。

Acceptance:
- 新 router 的行为和旧稳定路径都被自动化覆盖。

## Task 5 - Real Browser E2E
- [ ] 复用或重启本地 FastAPI + Next。
- [ ] 用 in-app Browser 测 `/learn` 或首页聊天。
- [ ] 覆盖 ordinary lookup、first-turn compare、natural continuation、learning-adjacent no-match recovery。
- [ ] 检查 console error。

Acceptance:
- 真实页面能证明工具路由层没有只停留在代码结构层面。

## Task 6 - Handoff
- [ ] 更新 `progress.md`，压缩旧待办并记录最终验证。
- [ ] 更新 `docs/README.md` 当前计划索引。
- [ ] 提交并推送分支。

Acceptance:
- GitHub 分支、文档、代码和验证结果都能交接 review。

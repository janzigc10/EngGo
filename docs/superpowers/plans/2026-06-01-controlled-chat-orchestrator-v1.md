# Controlled Chat Orchestrator V1 Plan

## Goal

把聊天回答链路从单纯硬路由推进到受控类 Agent：先保持现有稳定查词/辨析能力，再为 no-match 和自然多轮追问增加一个可验证的内部工具编排恢复层。

## Scope

- 只改 `/api/chat` 后端链路、必要的 provider prompt / helper、contract tests、smoke / E2E 和文档。
- 不引入 LangChain / LangGraph。
- 不改 Learn / Review / Progress 状态机。
- 不做长期记忆、账号同步、web search 或完整开放 Agent。

## Task 0 - Docs And Scope
- [x] 新增本 spec 和 plan。
- [x] 更新 `docs/README.md` 与 `progress.md`，把本轮设为当前活跃计划。
- [x] 明确 V1 只接管 no-match recovery 和自然多轮 continuation，不重写稳定 exact lookup / direct compare。

Acceptance:
- 后续代码实现只围绕减少 hard no-match 和增强上下文续接，不扩大到背词状态机或完整 Agent 框架。

## Task 1 - Orchestrator Skeleton
- [x] 新增受控 orchestrator helper。
- [x] 把 existing service result 中的 no-match 识别为 recoverable / final 两类。
- [x] 从 `conversationContext` 构造候选 grounding。
- [x] 保持 primary service resolved result 的行为不变。

Acceptance:
- resolved lookup / compare 不被 orchestrator 改写；no-match 结果可以进入 recovery 分支。

## Task 2 - Provider-backed Recovery
- [x] 为 no-match recovery 增加 provider prompt。
- [x] provider 可用时，基于 service grounding 和 context candidates 生成短回答或澄清。
- [x] provider 不可用或失败时，退回 bounded deterministic fallback。
- [x] 对随机拼写 blob 继续保持保守，不强行调用 provider 扩展。

Acceptance:
- learning-adjacent no-match 不再直接返回旧 hard no-match；无证据或随机输入仍安全收口。

## Task 3 - Natural Continuation
- [x] 识别 `这几个具体怎么用`、`和刚才那个比呢`、`有没有更口语的` 这类上下文追问。
- [x] 有有效候选上下文时，优先走 provider-backed context continuation。
- [x] 无有效上下文时，返回 clarification 而不是普通 lookup no-match。

Acceptance:
- 用户自然追问能接上上一轮候选；无上下文时仍不让 provider 自行扩词。

## Task 4 - Tests And Smoke
- [x] 更新 `backend/tests/test_chat_contract.py`。
- [x] 新增或更新 orchestrator 单元测试。
- [x] 保持 direct compare、learning context、advanced lookup focused tests 通过。
- [x] 增加可脚本化 smoke，覆盖 no-match recovery / continuation / exact lookup / direct compare。

Acceptance:
- focused backend tests 和 smoke 能证明 V1 没有破坏现有稳定路径，并改善目标失败路径。

## Task 5 - Real Browser E2E
- [x] 启动或复用本地 FastAPI + Next。
- [x] 用 in-app Browser 或 Computer Use 测首页聊天。
- [x] 验证 first-turn compare、natural continuation、unsupported learning-adjacent query。
- [x] 截取或记录关键可见行为与 console 状态。

Acceptance:
- 用户可见路径证明 no-match 和多轮体验确实改善，而不是只在单元测试里成立。

## Task 6 - Handoff
- [x] 更新 `progress.md`，压缩旧待办并记录最终验证。
- [x] 更新 `docs/README.md` 当前计划索引。
- [x] `git diff --check` 通过。
- [x] 提交并推送分支。

Acceptance:
- repo 文档、代码、测试和 GitHub 分支都能交接下一轮工作。

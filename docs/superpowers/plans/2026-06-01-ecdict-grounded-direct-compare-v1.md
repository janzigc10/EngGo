# ECDICT-grounded Direct Compare V1 Plan

## Goal

把 direct compare 从人工 `quickDistinction` / ECDICT-only 伪辨析，改成 ECDICT-grounded provider compare：ECDICT 负责 grounding，LLM 负责组织短辨析；provider 不可用时才退回干净的并列释义。

## Scope

- 只改 direct compare 链路、相关测试、文档和真实 E2E。
- 不扩人工 graph，不批量维护 `quickDistinction`。
- 不改 Learn / Review 状态机。
- 不改普通 exact lookup 和 context-choice follow-up 的主策略。

## Task 0 - Docs And Scope
- [x] 新增本 spec 和 plan。
- [x] 更新 `docs/README.md` 与 `progress.md`，把本轮设为当前活跃计划。
- [x] 明确 `quickDistinction` 不再是 direct compare 主路径。

Acceptance:
- 后续实现不再保留“当前没有人工易混组；先按核心义区分”这种低价值 fallback。

## Task 1 - Provider-backed Direct Compare
- [x] direct compare exact terms 优先解析为 ECDICT candidates。
- [x] resolved direct compare 在 provider 可用时调用 provider。
- [x] provider prompt 保持轻量，不建设人工 graph。
- [x] provider 失败或不可用时退回 deterministic dictionary lines。
- [x] 保留 grounding / conversation context 所需的 `mainAnswer`。

Acceptance:
- 有 provider 时 direct compare 的 `providerRequestId` 非空；无 provider 时仍能 200 返回并列释义。

## Task 2 - Tests
- [x] 更新 `backend/tests/test_direct_compare_answer.py`。
- [x] 更新 `/api/chat` contract test。
- [x] 删除或改写依赖 `quickDistinction` 原样拼接、ECDICT-only "偏..." fallback 的断言。

Acceptance:
- focused backend tests 覆盖 provider success、provider failure、no-provider fallback、ECDICT priority。

## Task 3 - Verification And E2E
- [x] 跑 focused backend tests。
- [x] 跑相关 lint / diff check。
- [x] 启动或复用本地 Next + FastAPI。
- [x] 用真实浏览器验证 `/` chat direct compare。
- [x] 更新 `progress.md` 和 `docs/README.md`，记录最终状态。

Acceptance:
- 代码、测试、浏览器行为都证明 direct compare 的主路径已经是 ECDICT-grounded provider compare。

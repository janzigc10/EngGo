# Model-assisted Intent Routing V1 Plan

## Goal

在 Controlled Tool Router V1 之上落地规则优先的模型辅助意图路由：高置信规则路径直接执行，灰区请求由 provider 只做受限 intent / slot 建议，代码验收参数后再调用受控工具，并用 grounding quality gate 防止 weak resolved。

## Scope

- 只改 `/api/chat` 后端路由、advanced lookup / broad grounding、必要 tests、smoke / comparison 脚本和文档。
- 不做完整 ReAct Agent。
- 不让模型自由规划多步工具。
- 不改 Learn / Review / Progress。
- 不把同义、作文表达硬塞进 word-family 或 shape-neighbor。

## Task 0 - Docs And Baseline
- [x] 写本 spec 和 plan。
- [x] 更新 `docs/README.md` 与 `progress.md`，设为当前活跃计划。
- [x] 记录当前 no-match / weak-answer audit 作为 before baseline。

Acceptance:
- 文档明确 V1 是 rule-first + grey-zone classifier，不是完整 Agent。

## Task 1 - Route Confidence And Grey-zone Classifier
- [x] 给 chat route plan 增加 `source`、`confidence`、`ambiguityReasons`。
- [x] 新增 constrained classifier prompt / JSON parser。
- [x] 只在 grey-zone 路由里调用 provider classifier。
- [x] 校验 terms / style / context provenance，不接受模型扩词。

Acceptance:
- 明确路径不调用 classifier；灰区路径可以由 provider 分类；provider 失败时退回当前保守行为。

## Task 2 - Semantic Expression Tool Branch
- [x] 增加 `semantic_expression` 受控意图。
- [x] 承接 `同义词 / 近义 / 意思差不多 / 写作表达 / formal way to say`。
- [x] provider 只作为表达器，不声称词库命中。
- [x] 无 provider 或参数不足时返回 bounded clarification。

Acceptance:
- `more formal way to say follow` 与 `跟 abandon 意思差不多的词` 不再走普通多 token lookup 或词族/形近误路由。

## Task 3 - Broad Grounding Quality Gate
- [x] 为 broad grounding 增加候选质量判断。
- [x] 弱片段 / 弱前缀 / 非强约束候选不能单靠数量 resolved。
- [x] `anti+dis 的词根有什么词` 返回 no-match 或 bounded clarification。

Acceptance:
- weak resolved 优先被压住，不通过放宽 no-match 来伪改善。

## Task 4 - Semantic Style Follow-up
- [x] 补 resolver 对 `还有更适合作文的吗 / 还有更正式的吗 / 有没有更口语的` 的处理。
- [x] 有上下文时复用上一轮 candidates，走候选内 style choice。
- [x] 无上下文时 clarification。

Acceptance:
- `遵循的英文是什么 -> 还有更适合作文的吗` 不再被普通 `show_more` 抢走。

## Task 5 - Tests, E2E, And Comparison
- [x] 补 route classifier / validator 单元测试。
- [x] 补 `/api/chat` contract tests。
- [x] 补 advanced lookup quality gate tests。
- [x] 跑 focused backend tests、frontend smoke unit、lint、`git diff --check`。
- [x] 跑真实 Next proxy 或可脚本化 E2E。
- [x] 生成 before/after comparison matrix。

Acceptance:
- 证明 V1 对 grey-zone 和 weak-resolved case 有真实增强，同时稳定路径不回退。

## Task 6 - Handoff
- [x] 更新 `progress.md`，压缩旧待办并记录最终验证。
- [x] 更新 `bugs.md`，把已修问题降级为防回归。
- [x] 提交并推送分支。

Acceptance:
- 文档、代码、测试、E2E 和对比结果都可交接 review。

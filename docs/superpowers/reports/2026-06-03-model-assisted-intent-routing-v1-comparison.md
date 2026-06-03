# Model-assisted Intent Routing V1 Comparison

## Summary

V1 相比 Controlled Tool Router V1 的核心增强不是“把所有意图交给 Agent”，而是在规则路由外补了一层可验证的灰区能力：

- 高置信规则继续直接执行，例如 exact lookup、direct compare、明确词族/形近问法。
- 灰区表达类问法进入 `semantic_expression`，provider 只做受限 intent / slot 建议，代码再校验 terms 是否来自用户原文或上一轮候选。
- broad grounding 新增 root combo 质量门，没有直接有序片段命中的 `anti+dis` 不再靠弱候选列表 resolved。
- `还有更适合作文的吗` 这类 show-more + style-choice 混合追问优先走上一轮候选内 `context_choice`。

## Before / After Matrix

| Case | Before: Controlled Tool Router V1 | After: Model-assisted Intent Routing V1 | Evidence |
| --- | --- | --- | --- |
| `more formal way to say follow` | 多 token 普通查词灰区，主要靠 no-match recovery 接住。 | 规则识别为 `semantic_expression` 灰区；有 provider 时先 classifier，再把 validated term `follow` 交给受控表达分支；provider 不可用时 bounded plain fallback。 | `test_chat_semantic_expression_uses_grey_zone_classifier_then_advanced_provider`; live smoke `semantic_expression_providerless` |
| `跟 abandon 意思差不多的词` / `responsible 的同义词` | 被正确排除在词族/形近外，但没有独立工具承接。 | `normalize_query` / `LearningIntentPlan` 归入 `semantic_expression`，不再误塞入 word-family 或普通多 token lookup。 | `test_semantic_expression_queries_do_not_fall_into_word_family_or_lookup` |
| `anti+dis 的词根有什么词` | 会 resolved，召回 `antique / anew / attic...` 等弱相关候选。 | root combo 必须有候选直接命中有序片段 `anti+dis`；否则 broad path 不 resolved，回到 root no-match。 | `test_unsupported_root_combo_no_longer_resolves_weak_candidates`; live smoke `anti_dis_root_no_match` |
| `re+con 的词根有什么词` | 已有动态候选能力，能召回 `reconcile / reconciliation`。 | 保留：只拦截没有直接有序片段命中的 root combo，不误伤 `re+con`。 | `test_semantic_root_boundary_can_use_dynamic_light_candidates` |
| `遵循的英文是什么 -> 还有更适合作文的吗` | `还有吗` 容易抢走 follow-up，缺少 style-choice 混合解析。 | resolver 先识别 semantic style follow-up，复用上一轮 candidates，走 `context_choice`，不扩词。 | `test_chat_style_follow_up_prefers_context_choice_over_show_more`; live smoke `style_followup_context_choice` |
| ordinary exact lookup / direct compare / existing context continuation | 稳定路径应继续不经 LLM classifier。 | 规则置信度 >= 0.85 直接执行；focused and full backend tests 未回退。 | backend full `346 passed`; frontend unit `329 passed` |

## Validation

- Focused backend: `178 passed`.
- Full backend: `346 passed` with `--basetemp tmp_pytest_full -p no:cacheprovider`.
- Frontend unit: `42 files / 329 tests passed`.
- Lint: `corepack pnpm lint -- src scripts` passed.
- Diff check: `git diff --check` passed, only Windows LF -> CRLF warnings.
- Live HTTP smoke: temporary FastAPI on `127.0.0.1:8000`, `OPENAI_API_KEY=""`, 4 / 4 passed:
  - greeting plain fallback,
  - providerless semantic expression,
  - `anti+dis` root no-match,
  - style follow-up candidate-locked `context_choice`.

## Live Before / After E2E

2026-06-03 先补跑 23 条 before/after E2E：同一批输入分别启动 baseline commit `52b7834` 和 current working tree 的 FastAPI 子进程，统一使用本地 ECDICT CSV，且 `OPENAI_API_KEY=""`，避免真实 provider 把路由差异糊掉。

第一轮宽测没有直接通过，抓出 3 个真实边界问题：

- `formal 是什么意思` 被当前实现误路由到 `semantic_expression`，原因是英文 cue 把裸 `formal` 当成语域意图。
- `有没有和 keep 差不多意思的词` 漏进 `semantic_expression`，原因是只覆盖了“意思差不多”，没覆盖“差不多意思”词序。
- `用作文更正式地表达 good` 被 follow-up resolver 当成无上下文风格追问，原因是 style follow-up 没先排除显式英文 seed。

修复后固化为 `scripts/run-model-routing-e2e-compare.py`，最终结果：

- 23 total / 23 current expectation pass / 0 fail / 13 changed。
- stable no-regression：7 total / 7 pass / 0 changed。
- regression probe：4 total / 4 pass / 1 changed。
- expected improvement：12 total / 12 pass / 12 changed。

| Category | Coverage | Result |
| --- | --- | --- |
| Stable no-regression | `access 是什么意思`、`access assess 怎么区分`、`还有吗` continuation、随机串 no-match、`re+con` root、`re开头cile结尾`、`哪个更自然` context choice | 全部保持 baseline 行为，不经新 classifier 误伤。 |
| Regression probes | `formal 是什么意思`、`表达观点的英文是什么`、`遵循的英文是什么`、`more natural way to say get` | `formal` 保持普通查词；中译英表达仍是原 meaning lookup 路径；`natural` 不再被当目标词，`terms=["get"]`。 |
| Semantic expression improvements | `more formal way to say follow`、`another way to say help`、`active 的近义词`、`responsible 的同义词`、`有没有和 keep 差不多意思的词`、`用作文更正式地表达 good` | baseline 要么 clear_context，要么只查 seed 本身；current 全部进入 `semantic_expression`，terms 来自用户原文。 |
| Weak root gate | `anti+dis 的词根有什么词`、`pre+sub 的词根有什么词` | baseline weak resolved 到 `antique/anew/attic...`、`preach/preacher/precaution...`；current 均 root no-match。 |
| Style follow-up | `还有更适合作文的吗`、`有没有更正式的`、`还有更口语的吗`、无上下文 `还有更正式的吗` | 有上下文锁定 `follow / obey / comply` 做 `context_choice`；无上下文 clarification。 |

Command:

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' scripts\run-model-routing-e2e-compare.py
```

## Remaining Boundaries

- This is still not a full ReAct Agent. It does not let the model plan arbitrary tools or multi-step actions.
- `semantic_expression` is provider-assisted expression advice, not a source-backed wordbook hit. It must not claim exam frequency or structured confusion-group evidence.
- The grey-zone classifier is intentionally narrow in V1. It currently targets semantic expression / style-choice ambiguity rather than every low-confidence route.

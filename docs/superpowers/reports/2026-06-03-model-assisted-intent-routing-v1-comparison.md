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

2026-06-03 补跑了一轮真正的 before/after E2E：同一批输入分别启动 baseline commit `52b7834` 和 current commit `947b0f8` 的 FastAPI 子进程，统一使用本地 ECDICT CSV，且 `OPENAI_API_KEY=""`，避免真实 provider 把路由差异糊掉。

Summary: 8 total / 8 current expectation pass / 0 fail；其中 5 个 expected-improvement case，3 个 stable no-regression case。

| Case | Baseline `52b7834` | Current `947b0f8` | Meaning |
| --- | --- | --- | --- |
| `access 是什么意思` | 200 grounded, `mainAnswer=["access"]` | 200 grounded, `mainAnswer=["access"]` | 稳定查词不回退。 |
| `access assess 怎么区分` | 200 grounded, `queryMode=direct_compare`, `mainAnswer=["access","assess"]` | 同 baseline | direct compare 稳定。 |
| `more formal way to say follow` | 200 plain, `clear_context`，没有 grounding 和 term | 200 plain, `queryMode=semantic_expression`, `terms=["follow"]` | 英文表达意图从“接不准”变成显式受控分支。 |
| `跟 abandon 意思差不多的词` | 200 grounded, `queryMode=fuzzy_recall`, 只查 `abandon` 本身 | 200 plain, `queryMode=semantic_expression`, `terms=["abandon"]` | 同义/近义问法不再伪装成普通查词。 |
| `responsible 的同义词` | 200 grounded, `queryMode=fuzzy_recall`, 只查 `responsible` 本身 | 200 plain, `queryMode=semantic_expression`, `terms=["responsible"]` | 同义问法进入表达工具，不再弱 resolved。 |
| `anti+dis 的词根有什么词` | 200 grounded, `resolution=resolved`, `mainAnswer=["antique","anew","attic",...]` | 200 grounded, `resolution=no_match`, `mainAnswer=[]` | 弱 root combo 被 quality gate 压住。 |
| `re+con 的词根有什么词` | 200 grounded, `resolution=resolved`, includes `reconcile / reconciliation` | 同 baseline | 没误伤已有可用 root combo。 |
| `还有更适合作文的吗` with previous candidates `follow / obey / comply` | 200 grounded, 新开 `meaning_lookup`，跑到 `collaborate / cooperation...` | 200 plain, `resolved_action=context_choice`, locks `follow / obey / comply` | style follow-up 真正复用上一轮候选，不跑偏。 |

## Remaining Boundaries

- This is still not a full ReAct Agent. It does not let the model plan arbitrary tools or multi-step actions.
- `semantic_expression` is provider-assisted expression advice, not a source-backed wordbook hit. It must not claim exam frequency or structured confusion-group evidence.
- The grey-zone classifier is intentionally narrow in V1. It currently targets semantic expression / style-choice ambiguity rather than every low-confidence route.

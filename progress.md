# EngGo 滚动交接

## 当前状态（2026-06-05 Meaning Lookup Weak-Resolved Quality Gate V1 已完成待 review）
- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 当前活跃计划：`docs/superpowers/plans/2026-06-04-meaning-lookup-weak-resolved-quality-gate-v1.md`。
- 当前参考设计：`docs/superpowers/specs/2026-06-03-model-assisted-intent-routing-v1-design.md`。
- 当前验收报告：`docs/superpowers/reports/2026-06-04-meaning-lookup-quality-gate-v1-comparison.md`。
- 上一轮已合并：Model-assisted Intent Routing V1 已合入并推送到 `origin/codex/chat-shell-bootstrap`，merge commit `1570ae3`。
- 本轮结果：已完成 `meaning_lookup` 候选质量闸门、preferred lemma 候选注入 / 排序、weak expression advice fallback、seed expression providerless fallback、短语 hint 绕过泛 seed 组、review blocker 修复、focused tests 和 36-case before/after E2E。
- 保留边界：
  - 顶层工具仍是 `ordinary_lookup`、`direct_compare`、`advanced_lookup` 三个。
  - 不做完整 ReAct Agent。
  - 不让 provider 自由扩词或决定工具参数。
  - 不扩大 `semantic_expression`；本轮只修 `meaning_lookup` 候选质量。
  - 不改 Learn / Review / Progress 状态机。

## 本轮已完成
1. 文档：
   - 新增 `docs/superpowers/plans/2026-06-04-meaning-lookup-weak-resolved-quality-gate-v1.md`。
   - 新增 `docs/superpowers/reports/2026-06-04-meaning-lookup-quality-gate-v1-comparison.md`。
   - 更新 `docs/README.md`、`progress.md`、`bugs.md`。
2. `meaning_lookup` quality gate：
   - `meaning_core` broad path 在 `build_broad_vocab_grounding()` 前先做候选质量分级。
   - preferred lemma 和正向原 hint 命中为 strong；否定 / 使役 / alias-only 弱命中不再直接进入 grounded main answer。
   - 如果有 preferred strong 候选，只保留 preferred strong，避免 `bridle / lid / law` 这类边缘释义混进 `限制` 主答案。
3. ECDICT meaning candidate 合并：
   - `meaning_lookup` 合并动态词表时改为 ECDICT meaning candidate 优先，避免 source lemma 同 lemma 候选覆盖掉带 `semantic_match_hints` 的 ECDICT 候选。
   - 给 `限制 / 约束 / 制约`、`合作 / 协作 / 配合`、`遵循 / 遵守`、`表达观点` 等补最小 preferred/advice 映射。
   - 收窄 `遵循 / 遵守` alias，不再借 `服从` 分支把 `submit/subdue` 带入。
4. Weak expression fallback：
   - 当没有 strong 候选但存在受控表达选项时，返回 `answerKind=plain`、`answerStyle=meaning_expression_advice`、`mainAnswer=[]`。
   - metadata 记录 `weakCandidateLemmas`，并明确 `not a wordbook hit`，避免伪装成 source-backed grounded hit。
5. E2E matrix：
   - `scripts/run-model-routing-e2e-compare.py` 扩到 36 cases，新增 `forbid_main_contains`、`expected_answer_kind`、`expected_answer_style` 检查，请求超时提高到 20s 以适配 Windows 双 FastAPI comparison。
   - 新增 `限制的英文是什么` 强命中保护；`表达观点` / `遵循` 改为 expected improvement，并禁止旧弱候选回流。
   - 2026-06-05 扩展覆盖补进：`遵守规则用英文怎么说`、`负责的英文是什么`、`承担责任的英文是什么`、`表达想法的英文是什么`、`提出观点的英文是什么`、`restrain 和 constrain 的区别`、`desert dessert 怎么区分`、`和 contest 像的单词`、`according to 是什么意思`、`anti+xyz` / `re+con+sub` / `xqz` root boundary。
6. 扩展探测后补修：
   - `seed_expression` provider 失败时改为 grounded fallback，不再在 providerless 环境把已有 grounding 变成 503。
   - `遵守规则`、`表达想法`、`提出观点` 等 phrase hint 不再被泛 seed expression 组提前截走，优先进入 meaning quality gate。
7. Review blocker 修复：
   - `meaning_expression_advice` 现在明确走 `answerKind=plain`、`resolution=no_match`、`noMatchReason=low_confidence`，并补齐前端需要的 `scopeReminder` / `followUpPrompt` 等 grounding 字段；前端专门显示“表达建议”，不再渲染成“已命中 0 个当前范围词”。
   - phrase hint 截取增加否定上下文保护；`不承担责任的英文是什么` 不会被截成 `承担责任`，防止正向 preferred lemma 抢走否定表达。

## Before baseline：2026-06-02 no-match / weak-answer audit
1. 真实 Next proxy `/api/chat` 探测确认：当前 hard `resolution=no_match` 主要集中在随机/不稳定英文串、完全无候选的词根/词族/词形条件、形近 seed 本身不稳定，以及无上下文追问转 clarification。
2. 更大的产品风险不是 hard no-match，而是“误 resolved 但弱回答”：
   - `anti+dis 的词根有什么词` 会 resolved，但召回 `antique / anew / attic...` 一类弱相关候选。
   - `跟 abandon 意思差不多的词`、`responsible 的同义词` 被历史测试刻意排除出词族/形近后，没有新的近义/表达工具承接，容易退成普通查词。
   - `遵循的英文是什么` 后追问 `还有更适合作文的吗` 是已知 deferred 场景：当前 `还有吗` 动作优先，缺少 semantic style follow-up。
   - 英文整句 `more formal way to say follow` 会先被拆成多 token 普通查词，再靠 no-match recovery 接住；这说明英文表达/语域意图还没有进入显式工具路由。
3. 本轮将以这些样例作为 before/after comparison matrix 的核心行，证明增强不是只靠测试变绿。

## 最新验证
- Focused backend：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py --basetemp tmp_pytest_meaning_gate -p no:cacheprovider` -> 51 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py backend\tests\test_chat_contract.py backend\tests\test_chat_tool_router.py backend\tests\test_learning_intent.py backend\tests\test_learning_context.py --basetemp tmp_pytest_meaning_gate -p no:cacheprovider` -> 189 passed。
- Full backend：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_meaning_gate_full -p no:cacheprovider` -> 357 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests --basetemp tmp_pytest_backend -p no:cacheprovider` -> 360 passed。
  - workspace 内 pytest temp 已清理。
- Diff：
   - `git diff --check` -> passed，仅 Windows LF -> CRLF warnings。
- Live before/after E2E：
   - `C:\Users\Chen\anaconda3\python.exe scripts\run-model-routing-e2e-compare.py`。
  - baseline commit `52b7834` vs current working tree，同一批输入、同一本地 ECDICT CSV、`OPENAI_API_KEY=""`。
  - 36 total / 36 pass / 0 fail / 23 changed。
  - 分类：stable 12 / 12 pass / 1 changed；regression probe 2 / 2 pass / 1 changed；expected improvement 22 / 22 pass / 21 changed。
   - 关键差距：`表达观点的英文是什么` 从 `hiss` 变成 `express / state / voice / represent`；`遵循的英文是什么` 从 `disobedience / subdue / unwilling` 变成 `follow / observe / comply / obey / abide`；`限制的英文是什么` 从 `bridle` 变成 `restrict / limit / constrain`；`遵守规则用英文怎么说` 从 clear_context 变成 `follow / observe / comply / obey / abide`；`负责 / 承担责任` 从 `provost` 变成 `responsible / liable`。
   - no-match 没有无控制扩大：随机串仍 no-match，`access 是什么意思` / `formal 是什么意思` / direct compare / shape neighbor / fixed phrase 稳定路径不变；`anti+dis`、`pre+sub`、`anti+xyz`、`re+con+sub` 这种无稳定词族组合会 bounded no-match。
- Review blocker follow-up：
  - 红测先确认失败：weak advice 曾是 `plain + resolved + mainAnswer=[]`；`不承担责任的英文是什么` 曾被 phrase hint 截成 `承担责任`；前端曾显示普通“暂未稳定命中”而非表达建议。
  - 修复后：`C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py::test_meaning_lookup_weak_expression_candidate_uses_bounded_advice_without_provider backend\tests\test_advanced_lookup.py::test_meaning_lookup_weak_reverse_candidates_become_plain_expression_advice backend\tests\test_advanced_lookup.py::test_meaning_lookup_phrase_hints_do_not_strip_negative_context --basetemp tmp_pytest_meaning_gate_blockers -p no:cacheprovider` -> 3 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py --basetemp tmp_pytest_meaning_gate_blockers_full -p no:cacheprovider` -> 55 passed。
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q backend\tests\test_advanced_lookup.py backend\tests\test_chat_contract.py backend\tests\test_chat_tool_router.py backend\tests\test_learning_intent.py backend\tests\test_learning_context.py --basetemp tmp_pytest_meaning_gate_blockers_contract -p no:cacheprovider` -> 193 passed。
  - `corepack pnpm test src\components\chat\chat-workspace.test.tsx src\features\chat\conversation-context.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 3 files / 41 tests passed。
  - `corepack pnpm lint -- src\components\chat\message-thread.tsx src\features\retrieval\types.ts` -> passed。
  - 复跑 `scripts\run-model-routing-e2e-compare.py` -> 36 total / 36 pass / 0 fail / 23 changed；`git diff --check` -> passed，仅 Windows LF -> CRLF warnings。

## 扩展探测残留
1. `活动的英文是什么` 在 CET-6 providerless 真实装配下仍返回 `action`，没有优先 `activity`；直接原因是 `activity` 源范围是 Gaokao/CET-4，当前 CET-6 source lemma 与 ECDICT preferred profile 都不继承低级别基础词。是否修要单独定“CET-6 是否包含 CET-4/高考基础词”的范围策略。
2. `anti 前缀有哪些词`、`sub开头表示下面的词`、`re开头表示再次的词` 这类单前缀语义列表仍可能给出生僻或语义不纯候选；这是 root/prefix semantic quality gate 下一轮问题，不属于本轮 meaning lookup。
3. `xyz开头的单词` 会命中 ECDICT 的 `xyz` 条目；这属于 prefix/bare token 边界策略，已记录到 `bugs.md`。

## 下一步
1. review 重点：
   - preferred lemma 表是否足够窄，尤其 `遵循 / 遵守` 不应重新通过 `服从` 引入 `submit/subdue`。
   - `meaning_expression_advice` 是否只在无 strong 候选时出现，且继续保持 plain / non-hit 展示。
   - `meaning_lookup` 合并方向改为 ECDICT meaning candidate 优先后，是否影响其它 source lemma 场景。
2. 如 review 通过，可合并回 `codex/chat-shell-bootstrap` 并推送。
3. 后续不建议继续扩大 `semantic_expression`；下一块如果继续做，应抽样更多中文中译英问法，扩 weak-answer E2E matrix，而不是上大 Agent。

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
  - Next proxy smoke：`corepack pnpm eval:fastapi:conversation-context-smoke -- --base-url http://127.0.0.1:3000 --label next-proxy-controlled-orchestrator` -> 13 total / 13 pass / 0 fail。
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
- 不要继续围绕 `real-smoke` 小词书扩写背词内容；它现在只是历史开发切片和回归资产。
- 不要把 ECDICT 自动释义压缩当成人工 confusion graph；direct compare 要么走 provider 组织真实短辨析，要么干净退回并列释义。
- 不要在本轮基础上扩 Learn / Review 状态机、账号/云同步、完整 SRS、收藏体系或 NotebookLM 方向。
- 生成器依赖本地 `output/external-dictionaries/ecdict.csv`；该文件被 git ignore，提交的是 compact generated JSON。

# Affix Semantic Gate V1 执行计划

## 目标
按意图区分“词形命中”和“词缀语义命中”，让 `anti / re / sub / trans` 等前缀以及 `-less / -er` 等后缀查询不再只靠拼写进入主答案。

## Scope
- 保持 FastAPI `/api/chat` 为唯一聊天后端。
- 保持 `ordinary_lookup`、`direct_compare`、`advanced_lookup` 三个顶层工具。
- 只改聊天检索 / grounding / answer plan / smoke matrix。
- 不改 Learn / Review / Progress。
- 不新增大型词源数据。

## Tasks
- [x] Task 1：复核当前 handoff、代码入口、已知残留和已有测试覆盖。
- [x] Task 2：补设计索引和当前计划交接，确认本轮验收口径。
- [x] Task 3：补意图与候选准入 focused tests，覆盖词形题、词缀语义题和 `xyz` 边界。
- [x] Task 4：实现词缀语义 gate：主答案必须有释义证据，拼写-only 候选不能冒充语义命中。
- [x] Task 5：调整回答计划和 grounding，让输出明确区分“拼写开头”和“前缀含义”。
- [x] Task 6：扩展 providerless E2E matrix，跑 focused tests、full backend tests、lint 和 E2E。
- [x] Task 7：更新 `progress.md` / `bugs.md` / `docs/README.md`，完成交接审计。

## 验收矩阵
- `anti 开头表示反对的词`：不把 `antique` / `anticipate` 放进主答案。
- `anti 开头的词有哪些`：允许拼写命中，但不声称这些词都表示“反对”。
- `re开头cile结尾的单词`：保持 `reconcile` resolved。
- `re 开头表示再次的词`：不把 `reconcile` 只凭拼写放进主答案。
- `sub 开头表示下面的词`：只返回有“下 / 次级 / 低于”证据的候选。
- `trans 开头表示跨越或转移的词`：只返回有“跨越 / 转移 / 传递 / 转化”证据的候选。
- `less 结尾表示没有的词`：不把只以 `less` 结尾但无“没有”含义的词放进主答案。
- `er 结尾表示人的词`：不把 `water / other / under` 放进主答案。
- `xyz开头的单词`：不因 exact `xyz` 条目误判为 prefix 列表。

## 验证计划
- Python focused：
  - `backend/tests/test_learning_intent.py`
  - `backend/tests/test_dynamic_light_grounding.py`
  - `backend/tests/test_advanced_lookup.py`
  - `backend/tests/test_broad_vocab_answer.py`
- HTTP / script focused：
  - `scripts/lib/fastapi-migrated-slice-smoke.test.ts`
  - `scripts/run-model-routing-e2e-compare.py`
- Full backend：
  - `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_affix_semantic_gate_full -p no:cacheprovider`
- Lint / diff：
  - `corepack pnpm lint`
  - `git diff --check`

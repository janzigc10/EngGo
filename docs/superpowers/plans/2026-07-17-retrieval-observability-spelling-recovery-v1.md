# Retrieval Observability & Spelling Recovery V1 Implementation Plan

## Goal

按已批准设计 `docs/superpowers/specs/2026-07-17-retrieval-observability-spelling-recovery-v1-design.md`，在默认 ECDICT-first、`ENGGO_USE_STRUCTURED_RUNTIME=false` 的运行方式下实现可测量的本地错拼恢复闭环，并建立仅开发 / benchmark 侧可见的 request-scoped retrieval trace。

## Controlling Contracts

- 产品与技术合同：`docs/superpowers/specs/2026-07-17-retrieval-observability-spelling-recovery-v1-design.md`
- 协作与交接：`AGENTS.md`、`progress.md`、`bugs.md`
- 起始代码基线：`f9da257 Record spelling design review approval`
- 不提交 / 不修改：`.codex/`、`.env`、`output/external-dictionaries/`、Prisma / legacy structured data、无关 UI、Learn / Review / Progress、部署配置
- 本计划执行期间不 commit / push，除非用户另行明确要求。

## Verification Environment

- Python：`C:\Users\Chen\anaconda3\python.exe`
- ECDICT：`C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv`
- TOEFL-Spell：`C:\tmp\TOEFL-Spell`，commit `252ee893b75dbf6186facf9ffda5fc4bc5dc9eca`
- `Annotations.tsv` SHA-256：`2efdf7a3c0d0a73d6550a1fbb40e8bec27dd6c004d417950c4571f80a6f85795`
- 运行 baseline / benchmark / live smoke 时显式固定：
  - `ENGGO_ECDICT_PATH=<上述 CSV>`
  - `ENGGO_USE_STRUCTURED_RUNTIME=false`
  - provider-off；provider-on 只做独立成文 smoke，不计入检索指标
- Windows pytest 使用 `.runlogs` 下独立 `--basetemp`，避免系统 temp 权限噪声。

## Task 1 — 固化 baseline、benchmark manifest 与内部合同红测

- [x] 建立独立 spelling benchmark runner / manifest 结构，不把完整 TOEFL-Spell vendoring 到仓库；对派生 manifest 记录 CC BY-SA 4.0 来源、固定 commit 和修改说明。
- [x] 校验上游 commit、文件 hash、过滤结果 2,405 对、固定 seed `20260717`、481 calibration / 1,924 held-out split；同一 typo 的 collision group 必须整体进入同一 split，manifest 保存 pair hash、case ID、分层字段和 split identity。
- [x] 在当前未修复 runtime 上跑 provider-off baseline，记录 route、Recall@1/3/5、resolution/no-match、延迟和环境元数据，输出 JSON 详情与 Markdown 摘要。
- [x] 为 candidate provider、decision policy、trace sinks、`needs_clarification` 和窄域“第一个”选择建立最小合同测试；尚未实现的合同使用 `xfail(strict=True)` 固定预期缺口，pytest 整体必须 green。对应 Task 实现时立即移除 xfail，不能把它留成永久豁免。
- [x] 更新 `progress.md`，记录 baseline 产物、失败合同和 Task 1 验证。

验证：

```powershell
Get-FileHash C:\tmp\TOEFL-Spell\Annotations.tsv -Algorithm SHA256
& 'C:\Users\Chen\anaconda3\python.exe' scripts\run_spelling_recovery_benchmark.py verify --dataset-root C:\tmp\TOEFL-Spell
& 'C:\Users\Chen\anaconda3\python.exe' scripts\run_spelling_recovery_benchmark.py baseline --dataset-root C:\tmp\TOEFL-Spell --ecdict C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv --split all --provider-off
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q -rx backend\tests\test_spelling_recovery_benchmark.py backend\tests\test_spelling_recovery_contract.py backend\tests\test_retrieval_trace_contract.py -o cache_dir=.runlogs/pytest-cache-spelling-t1 --basetemp=.runlogs/pytest-basetemp-spelling-t1
git diff --check
```

Task 1 完成条件：baseline 可复现；manifest/split 可验证；新增合同测试以 strict xfail 证明当前缺口且 pytest 整体 green；没有修改运行时行为。

## Task 2 — 实现独立 spelling candidate provider 与 decision policy

- [x] 在 `backend/app/retrieval/` 新增独立候选组件，不改变 `NullStructuredLookupRepository` 的语义。
- [x] 复用 / 缓存当前 exam scope closure 与全局 ECDICT canonical lemma，不在每次请求重读文件。
- [x] 当前 scope 先生成候选；全局 ECDICT 在同一 decision band 内完成更近 / 同距离竞争检查；合并后按 lemma 去重。
- [x] 候选包含 lemma、Damerau-style edit distance、scope/source、稳定 reason code 和可比较排序信号。
- [x] 决策集中输出 `auto_correct / clarify_candidates / no_reliable_candidate`，保护真实词和 random-like query；阈值只从 calibration 配置读取。
- [x] ECDICT / 全局竞争不可用或超预算时，禁止凭不完整 scope 候选 auto-correct。
- [x] 移除 Task 1 中 candidate provider / decision policy 对应的 strict xfail，使合同测试真实通过。
- [x] 运行 focused unit tests；失败不得进入 Task 3。
- [x] 勾选 Task 2 并更新 `progress.md`。

验证：

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend\tests\test_spelling_candidate_provider.py backend\tests\test_spelling_decision_policy.py -o cache_dir=.runlogs/pytest-cache-spelling-t2 --basetemp=.runlogs/pytest-basetemp-spelling-t2
git diff --check
```

## Task 3 — 接入 ordinary lookup 与歧义候选上下文

- [x] 由 `create_app()` 默认装配本地 spelling provider，并注入 ordinary lookup；structured runtime 开关不再决定 typo 候选是否存在。
- [x] `auto_correct` 明确展示原词和纠正词，再复用现有 ECDICT exact lookup / standard card；不能静默替换。
- [x] `clarify_candidates` 返回 grounded `resolution=needs_clarification`、`spellingDecision=clarify_candidates`、最多 3 个有序 candidates，并复用 `candidate_list` surface。
- [x] 建立 `conversationContext.topicKind=spelling_clarification`；只在该 context 下把仅含一个受支持序号的查询改写为 exact lookup，reason=`spelling_candidate_selection`。
- [x] 越界序号继续 clarification；普通上下文和无上下文的裸序号语义不变。
- [x] `no_reliable_candidate` 保持安全 grounded no-match，不能进入允许 provider 发明拼写候选的 recovery。
- [x] 范围外纠正明确显示不在当前考试词书；不伪装为当前 scope 命中。
- [x] 移除 Task 1 中 `needs_clarification` / spelling context / 窄域序号选择对应的 strict xfail，使合同测试真实通过。
- [x] 跑 focused service/router/context/schema tests；通过后勾选 Task 3 并更新 `progress.md`。

验证：

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend\tests\test_ordinary_lookup_answer.py backend\tests\test_chat_contract.py backend\tests\test_chat_tool_router.py backend\tests\test_learning_context.py -o cache_dir=.runlogs/pytest-cache-spelling-t3 --basetemp=.runlogs/pytest-basetemp-spelling-t3
git diff --check
```

## Task 4 — 实现 request-scoped retrieval trace

- [x] 新增稳定 trace event / snapshot 类型和 null、in-memory、opt-in JSONL sinks。
- [x] 默认 null sink 无 I/O；JSONL 仅在明确配置路径时启用，写入失败不影响聊天。
- [x] 使用现有 requestId 串联 query/env、route/slots、attempted/selected tool、候选/ranking、pre-recovery resolution、spelling decision、recovery/provider outcome 和分阶段 latency。
- [x] 不记录完整 history、密钥或模型隐藏推理；不把 trace 字段加入公开 `/api/chat` / `/api/chat/stream` schema。
- [x] 在普通 chat 汇合点一次性完成 trace；stream 复用最终调用路径，不复制业务逻辑。
- [x] in-memory sink 可由测试和 benchmark 直接读取，不依赖解析 JSONL。
- [x] 移除 Task 1 中 trace sinks 对应的 strict xfail，使合同测试真实通过。
- [x] 跑 focused trace/chat tests；通过后勾选 Task 4 并更新 `progress.md`。

验证：

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend\tests\test_retrieval_trace.py backend\tests\test_chat_contract.py backend\tests\test_chat_tool_router.py -o cache_dir=.runlogs/pytest-cache-spelling-t4 --basetemp=.runlogs/pytest-basetemp-spelling-t4
git diff --check
```

## Task 5 — Calibration、held-out benchmark 与性能门

> 2026-07-17 决策记录：正式 round 3 的 Recall@3 88.36%、warm p95 89.643ms、RSS 增量 434,176 bytes 均过门，但 auto-correct precision 183 / 194 = 94.33%。用户随后批准方案 A：只有 active-scope top candidate 可 auto；范围外候选保持原排序并降级 clarification / safe no-match。不得重新生成 calibration；先对冻结 round 3 候选做 policy replay，再只运行一次 held-out。

- [x] 以红测落实 active-scope-only auto，并完成冻结 round 3 候选的离线 policy replay；不得调用 candidate provider 或把 replay 冒充第四轮 calibration。

- [x] 只用 481 条 calibration split 冻结 edit-distance、margin 和 decision 阈值；最多 3 轮聚焦改进，每轮记录理由和结果。
- [x] 阈值冻结后只运行一次 1,924 条 held-out 主验收；不得按 held-out bad case 继续补规则后复用同一成绩。
- [x] 加入分层正确词、歧义词、随机串、route/slot 样本，并按 exam target、scope/global、词长、编辑距离报告。
- [x] 报告 route accuracy、slot exact/F1、Recall@1/3/5、MRR、auto-correct precision/coverage、valid-word/random false correction、clarification/no-match、resolution/recovery、p50/p95、cold load、RSS 增量。
- [x] 验收：valid-word false correction=0%；random auto-correct=0%；held-out auto-correct precision>=98%；held-out Recall@3>=85%；warm p95<=150ms；RSS 增量<=100MB。
- [x] 任一门不通过时停止进入 Task 6；不能放宽门槛冒充完成。最多 3 轮后仍失败则记录需要离线索引 / 产品决策并等待用户。
- [x] 通过后勾选 Task 5 并更新 `progress.md`。

验证：

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' <new spelling benchmark command> --mode calibration --provider-off
& 'C:\Users\Chen\anaconda3\python.exe' <new spelling benchmark command> --mode held-out --provider-off
git diff --check
```

## Task 6 — 全量回归、真实 HTTP 与浏览器 smoke

- [x] 跑相关 backend 全量 pytest；任何失败先定位后再继续。
- [x] 启动真实 FastAPI，显式固定 ECDICT、structured runtime off、provider-off，验证高置信、歧义、范围外、随机串和“第一个”续问。
- [x] 跑现有 migrated FastAPI smoke、conversation context smoke 和 controlled router regression。
- [x] 在 `http://localhost:3000/chat` 跑代表性浏览器 smoke，确认 standard lookup、candidate list、scope support 和 follow-up 无新 surface / 视觉回归。
- [x] 若改动任何前端 / TypeScript，运行最小相关 Vitest、lint 和 build；若未改，记录未运行理由。
- [x] 跑 `git diff --check`，确认 `.codex/`、外部 ECDICT / TOEFL 文件和无关用户变更不在 diff。
- [x] 通过后勾选 Task 6 并更新 `progress.md`。

验证：

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend\tests -o cache_dir=.runlogs/pytest-cache-spelling-full --basetemp=.runlogs/pytest-basetemp-spelling-full
corepack pnpm eval:fastapi:migrated-smoke
corepack pnpm eval:fastapi:conversation-context-smoke
git diff --check
```

## Task 7 — Comparison report、文档交接与完成审计

- [x] 在 `docs/superpowers/reports/` 写正式 baseline/current comparison，链接 JSON 详情、manifest、命令、性能和 browser evidence。
- [x] 报告 provider-off 检索和 provider-on 成文 smoke 的严格边界，不把 LLM recovery 计入检索提升。
- [x] 更新 `docs/README.md`：将 design / plan / report 标为当前事实，避免继续显示“待实施”。
- [x] 重审并改写 `progress.md`，只保留当前完成状态、验证证据、剩余风险和下一步；仅在发现新的确认问题时更新 `bugs.md`。
- [x] 对 Goal 的每项结果要求、约束、验证门和产物做逐项 completion audit。
- [x] 确认所有 Task checkbox 已完成、工作区 diff 只包含 Goal 范围内变更且没有未报告失败。

完成条件：Goal 的全部证据真实满足；否则保持 Goal active，不以局部 green 或自然文案替代完成。

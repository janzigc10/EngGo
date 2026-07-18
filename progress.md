# EngGo 滚动交接

## 当前状态（2026-07-17）

- `Retrieval Observability & Spelling Recovery V1` 已完成实现、最终质量门、全量回归、真实 HTTP、provider 边界、浏览器 smoke 和正式报告。
- Implementation plan 的 Task 1–7 已全部勾选；最终独立复审确认 TypeScript 公开合同与可交付 evidence 两个收口问题均已关闭，没有剩余 completion blocker。
- 当前分支：`codex/meaning-lookup-quality-gate-v1`；起始 / 当前 HEAD 为 `f9da257 Record spelling design review approval`，本轮按计划未 commit / push。
- 工作区保留本 Goal 的未提交改动；既存未跟踪 `.codex/` 不纳入 Goal，也未提交 `.env`、外部 ECDICT / TOEFL、Prisma / legacy structured data 或部署配置。
- 控制合同：
  - design：`docs/superpowers/specs/2026-07-17-retrieval-observability-spelling-recovery-v1-design.md`
  - completed plan：`docs/superpowers/plans/2026-07-17-retrieval-observability-spelling-recovery-v1.md`
  - comparison：`docs/superpowers/reports/2026-07-17-retrieval-observability-spelling-recovery-v1-comparison.md`

## 本轮完成结果

1. 默认 DB-free 错拼恢复闭环
   - 默认 `ECDICT-first`、`ENGGO_USE_STRUCTURED_RUNTIME=false` 路径已装配独立 `SpellingCandidateProvider` 和集中 `SpellingDecisionPolicy`，不再依赖空的 `NullStructuredLookupRepository.find_english_candidates()`。
   - 决策为 `auto_correct / clarify_candidates / no_reliable_candidate`。方案 A 已冻结：只有 active-scope top candidate 可自动纠正；范围外候选保留真实距离顺序，但降级为 clarification / safe no-match。
   - 高置信纠正明确显示原词到纠正词；歧义候选使用 `needs_clarification`；只在 `spelling_clarification` context 下支持裸“第一个”；范围外 exact 结果显示“当前词书外”和 scope reminder；随机串保持 grounded no-match。

2. Request-scoped retrieval trace
   - 同一 requestId 串联 environment、route / slots、attempted / selected tool、candidates / ranking、pre-recovery resolution、decision、provider / recovery outcome 和分阶段 latency。
   - 默认 null sink 无 I/O；in-memory sink 供测试 / benchmark；JSONL 仅显式配置时启用且 fail-open。
   - 公开 `/api/chat` / SSE 不暴露 trace；不记录完整 history、密钥或模型隐藏推理，raw query 默认关闭。

3. 固定 benchmark 与 one-shot 最终门
   - ETS TOEFL-Spell 固定 commit `252ee893...`、输入 SHA `2efdf7a3...5795`；过滤后 2,405 pairs，seed `20260717`，481 calibration / 1,924 held-out；同 typo collision group 不跨 split。
   - baseline 的 held-out candidate Recall@1/3/5 和 MRR 均为 0，route / slot 为 100%；证明主因是默认候选通道缺失，不是高层路由失败。
   - 三轮 calibration 后只对冻结候选做 SHA-pinned 方案 A policy replay，没有伪装成第四轮 calibration。
   - 唯一一次 1,924 条 held-out 已完成并由 receipt 封存；禁止删除、覆盖或重跑后刷新成绩。

4. 最小前端展示修正
   - 继续复用现有 standard lookup / candidate list surface，只增加明确纠正、范围外 badge 和 scope reminder，没有新增回答卡片类型或重开 UI 设计。
   - `RetrievalResolution` 前端联合类型已与后端同步为 `resolved / needs_clarification / no_match`。

## 最终指标与产物

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| Route / slot exact / slot F1 | 100% / 100% / 1.0 | 100% |
| Recall@1 / @3 / @5 | 77.23% / 89.60% / 91.01% | Recall@3 `>= 85%` |
| MRR | 0.8339 | 报告项 |
| Auto precision / coverage | 98.80% / 39.09% | precision `>= 98%`；coverage 无最低门 |
| Clarification / safe no-match | 47.51% / 13.41% | 报告项 |
| 正确词 / 随机串误纠正 | 0 / 12；0 / 4 | 0% |
| 歧义 clarification | 3 / 3 | 100% |
| Warm candidate p50 / p95 | 51.384 / 118.973ms | p95 `<= 150ms` |
| Candidate index RSS delta | 0 bytes | `<= 100MB` |
| Provider calls / runner errors | 0 / 0 | 0 / 0 |

- 18 / 18 gates、`allPassed=true`、`finalGatePassed=true`。
- baseline：`.runlogs/spelling-recovery-v1/baseline/`
- round 3 calibration：`.runlogs/spelling-recovery-v1/current/calibration/`
- 方案 A replay：`.runlogs/spelling-recovery-v1/policy-replay/round3-current-policy/`
- canonical held-out：`.runlogs/spelling-recovery-v1/current/held-out/`
- held-out artifact SHA：cases `af450f8e...07048`；metrics `fa622db3...a0b8`；summary `a405fbeb...72b4`；receipt `5d49d092...e2d6`。
- 浏览器截图：`output/playwright/retrieval-spelling-task6.png`。

## 最终回归证据

- Backend 全量：489 passed。
- Migrated FastAPI provider-off smoke：51 / 51。
- DB-unavailable provider-off smoke：19 / 19。
- Conversation-context provider-on 成文 smoke：13 / 13；不计入检索指标。
- Controlled router focused regression：14 passed。
- 相关 frontend / smoke Vitest：65 passed；其中新增公开 spelling JSON 类型合同后的 `assistant-answer` 定向回归为 9 passed。
- 定向 ESLint、Next production build、`git diff --check`：通过。
- 真实 provider-off FastAPI：exact、auto、mixed-scope clarification、随机串 no-match、“第一个”范围外 exact follow-up 全部通过；5 条 trace 均无 provider 调用和 raw query。
- Playwright：普通查词、明确纠正、候选选择、范围外标记 / reminder、随机串 no-match 均通过；0 console error / warning，所有 `/api/chat` 为 200。
- Task 7 pre-close：6 个 report links 均存在且未被 ignore；tracked benchmark / Task 6 evidence 与 canonical artifact、trace 最后 5 条及截图 SHA 独立匹配；43 个 Goal 路径无禁止 / staged 变更，测试端口均已关闭。

## 剩余风险与边界

- held-out 仍有约 10.4% gold 未进入 Top 3，auto precision 也不是 100%；继续使用 clarification / safe no-match 保护精度，不为覆盖率放宽自动纠正。
- 当前 candidate p95 已过门，但总 case p95 为 167.696ms；ECDICT cold load 约 7.87s、基础 RSS 增量约 462MB 属于既有底座成本，不应伪装成本轮新增索引成本。后续若优化启动体感，需独立 profiling / spec。
- `root-stitute` seed 仍存在，但默认 Null structured repository 不消费 legacy root view；自然 institute 记忆问法当前 bounded no-match，这是既有产品债，不属于本轮错拼回归。
- 本轮没有解决自然描述语义找词、中文反查词性排序、统一 Query Frame，也没有比较 rule-only / LLM-only / hybrid routing 或引入 LangGraph loop。
- 默认架构继续是 rule-first + grey-zone model-assisted controlled router，不是开放 ReAct Agent；structured DB 继续默认关闭。

## 下一步

1. 先由用户审阅本轮 diff 和 comparison report；如需入库，再单独授权 commit / push。
2. 不重跑 canonical held-out。后续 spelling 调整必须建立新版本 / 新 held-out 合同，不能覆盖本轮 one-shot 成绩。
3. 下一阶段建议按独立 spec 选择一个问题：统一 Query Frame、中文词性排序、自然描述语义检索，或在当前 trace / benchmark 合同下做 rule-only、LLM-only、hybrid routing 对照；最后再评估 LangGraph clarification / retry loop。

## 本地验证注意

- benchmark / live smoke 显式设置 `ENGGO_ECDICT_PATH=C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv`。
- 默认固定 `ENGGO_USE_STRUCTURED_RUNTIME=false`；不要为了验证恢复 Prisma dev。
- provider-off 检索与 provider-on 成文分开运行，不让 `.env` 的 key 掩盖 retrieval failure。
- Windows pytest 使用 `D:\tmp` 下独立 `--basetemp`，避免系统 temp 权限噪声。

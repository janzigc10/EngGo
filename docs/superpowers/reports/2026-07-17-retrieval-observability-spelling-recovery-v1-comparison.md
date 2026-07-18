# Retrieval Observability & Spelling Recovery V1 Comparison

## 结论

Retrieval Observability & Spelling Recovery V1 已完成实现与验收。默认 `ECDICT-first`、`ENGGO_USE_STRUCTURED_RUNTIME=false`、provider-off 路径现在具备独立本地错拼候选、精度优先决策、受控候选澄清、窄域序号承接和 request-scoped retrieval trace。

本轮没有迁移 Agent / LangGraph，也没有重写高层路由。固定 held-out 结果表明原问题主要是“路由正确但默认候选通道为空”：route / slot 从基线到当前始终为 100%，而 held-out Recall@3 从 0% 提升到 89.60%。

最终 18 / 18 质量门全部通过，`allPassed=true`、`finalGatePassed=true`。唯一一次 held-out 已由 one-shot receipt 封存，不得通过复跑或针对 bad case 补规则刷新该成绩。

## 数据与比较合同

- 数据源：ETS TOEFL-Spell，commit `252ee893b75dbf6186facf9ffda5fc4bc5dc9eca`。
- `Annotations.tsv` SHA-256：`2efdf7a3c0d0a73d6550a1fbb40e8bec27dd6c004d417950c4571f80a6f85795`。
- EngGo 过滤后：2,405 个唯一错词—正确词 pair，2,384 个 unique typo，17 个 collision group。
- pair-set SHA-256：`fbf50802a5a55ff59d9364fd3aa5c3706e84c80f7d39defa150c310334e14e00`。
- 固定 seed：`20260717`；calibration 481、held-out 1,924；同 typo 的 collision group 不跨 split。
- 检索成绩全程 provider-off、structured runtime off。provider-on 仅做独立成文 smoke。

数据合同见 [manifest](../../../data/evals/spelling-recovery-v1/manifest.json) 与 [许可/复现说明](../../../data/evals/spelling-recovery-v1/README.md)。完整 TOEFL-Spell 和 ECDICT 原始文件没有提交到仓库。

## Baseline 与 current

下表的 baseline candidate 指标取自同一 manifest 的 1,924 条 held-out slice；current 是阈值冻结后唯一一次 held-out 主验收。

| 指标 | Baseline：Null candidate path | Current：local spelling path | 结论 |
| --- | ---: | ---: | --- |
| Route accuracy | 100.00% | 100.00% | 高层路由原本已正确 |
| Slot exact / token F1 | 100.00% / 1.0000 | 100.00% / 1.0000 | 槽位无回归 |
| Recall@1 | 0.00% | 77.23% | 候选通道真实恢复 |
| Recall@3 | 0.00% | 89.60% | 通过 `>= 85%` 门 |
| Recall@5 | 0.00% | 91.01% | Top 5 提升成立 |
| MRR | 0.0000 | 0.8339 | 排序不只是“召回过” |
| Auto-correct precision | 不适用 | 98.80%（743 / 752） | 通过 `>= 98%` 门 |
| Auto-correct coverage | 不适用 | 39.09% | 按合同只报告、不设最低门 |
| Clarification rate | 不适用 | 47.51%（914 / 1,924） | 歧义优先让用户选择 |
| Safe no-match rate | 不适用 | 13.41%（258 / 1,924） | 保留保守边界 |
| Provider calls | 0 | 0 | 提升来自本地检索，不是 LLM recovery |
| Runner errors | 0 | 0 | 无错误样本被静默跳过 |

baseline 的全量 2,405 条运行中有 2,188 个 `no_match`，另有 217 个 typo 字面值碰撞到其他 ECDICT exact 词；这些 exact collision 没有被冒充为 gold candidate recall。可交付摘要、完整本地 artifact 路径、大小与 SHA 见 [tracked benchmark evidence](assets/2026-07-17-spelling-recovery-v1/benchmark-evidence.json)。

current held-out 的 metrics、18 个 gate、one-shot receipt 和四份 canonical artifact identity 同样固化在 [tracked benchmark evidence](assets/2026-07-17-spelling-recovery-v1/benchmark-evidence.json)。完整 case JSONL 约 6MB，按计划保留在 ignored `.runlogs/`，不直接提交；tracked evidence 保存其相对路径、字节数和 SHA-256。

## 方案 A 与 calibration 决策

正式 round 3 calibration 的候选质量和性能已过门，但旧决策策略的 auto precision 为 94.33%（183 / 194）。10 / 11 个误纠正来自范围外 ECDICT distance-1 top candidate 自动压过目标；用户随后批准方案 A：

1. 只有 top candidate 位于当前 active exam scope 时才有自动纠正资格。
2. 范围外 top 仍按真实编辑距离参与竞争，不被更远的范围内词重排覆盖。
3. 多个合理候选进入 clarification；单个范围外候选进入 safe no-match。
4. 用户显式选择范围外候选后可继续 exact lookup，并明确显示“当前词书外”。

没有重新生成 calibration。`replay-policy` 只读取 SHA-pinned 的 481 条 round 3 序列化候选，禁止调用 candidate provider、读取 held-out 或覆盖 current 产物。replay 后 auto precision 为 99.46%（183 / 184），coverage 38.25%，10 个变化全部是原错误 auto 降级为 clarification。

离线 replay 的可交付摘要与本地 canonical artifact identity 见 [tracked benchmark evidence](assets/2026-07-17-spelling-recovery-v1/benchmark-evidence.json)。冻结输入 SHA-256：

- cases：`660698a3f0af5b6a6564df7a10dc2aece39406393e6a225ffc31d6854390d05f`
- metrics：`7ed4dd7763e1c28e4efb8e357fc9257782cab51fd96f6c1dad6965b5f18f9d82`

## 最终质量门

| 验收项 | 门槛 | Held-out | 状态 |
| --- | ---: | ---: | --- |
| 正确词误纠正率 | 0% | 0 / 12 | 通过 |
| 随机串直接纠正率 | 0% | 0 / 4 | 通过 |
| 歧义样本 clarification | 100% | 3 / 3 | 通过 |
| Auto precision | `>= 98%` | 98.80% | 通过 |
| Recall@3 | `>= 85%` | 89.60% | 通过 |
| Warm candidate p95 | `<= 150ms` | 118.973ms | 通过 |
| Candidate index RSS delta | `<= 100MB` | 0 bytes | 通过 |
| Provider calls / runner errors | 0 / 0 | 0 / 0 | 通过 |
| Route / slot fixtures | 100% | 4 / 4 | 通过 |

candidate warm p50 为 51.384ms；cold prepare 为 81.021ms。baseline 的 0.002ms 是 `NullStructuredLookupRepository` 空调用，不执行候选搜索，因此不能和当前 118.973ms 反向比较为“性能退化”。ECDICT cold load 为 7,872.611ms、基础 RSS 增量约 462MB，是现有 ECDICT 底座成本；本轮门只约束新增 candidate index，calibration 测得 434,176 bytes，held-out 测量时 RSS 轻微回落后按 0 截断，两者都远低于 100MB。

canonical held-out artifact SHA-256：

- cases：`af450f8e5992f2c0b36040ffc37c54b97a0a2aa65486bb1b9af06b1c5bc07048`
- metrics：`fa622db3bb4518f541b6457f5c3f479f53c8dba256ae7c923d59ee4b8317a0b8`
- summary：`a405fbebb11501a520d88ec84ae4c2402fac07f635a70ffe0402f2a7d47272b4`
- receipt：`5d49d09266bea9aa0b0ef4db09ac1304273a0c37bc98bde00878602841ede2d6`

## Trace 与用户链路

retrieval trace 使用同一 requestId 串联 environment、route / slots、attempted / selected tool、候选与 rank key、pre-recovery resolution、spelling decision、provider / recovery outcome 和阶段延迟。默认 null sink 不产生 I/O；JSONL 只在显式配置路径时启用且 fail-open。公开 `/api/chat` 与 SSE schema 不暴露 trace，也不记录完整 history、密钥或模型隐藏推理；raw query 默认关闭。

真实 provider-off FastAPI 验证覆盖：

- 普通 exact lookup；
- `reqeust -> request` 高置信纠正并显式展示原词；
- mixed-scope clarification 保持全局距离排序；
- “第一个”只在 `spelling_clarification` context 中承接，并允许范围外 exact lookup；
- random-like query 返回 grounded safe no-match；
- 5 条 opt-in trace 均为 provider-off、structured runtime off、无 raw query。

浏览器在 `http://localhost:3000/chat` 验证上述代表路径。测试中发现 auto correction 与范围外 scope 状态原先没有充分显示，现已在既有 lookup / candidate surface 上做最小修正：显示 `原词 -> 纠正词`、`当前词书外` badge 和 scope reminder，没有新增卡片类型。控制台 0 error / 0 warning，相关 `/api/chat` 全部为 200。最终 5 条 HTTP trace 的明确行号、requestId、断言、console / network 摘要和本地截图 SHA 见 [tracked Task 6 evidence](assets/2026-07-17-spelling-recovery-v1/task6-evidence.json)；PNG 按计划保留在 ignored `output/playwright/`。

## Provider-off / provider-on 边界

所有 candidate Recall、MRR、auto precision / coverage、clarification、no-match、性能和 RSS 数字都来自 provider-off。本地 candidate provider 和 decision policy 不读取 provider，也不把最终自然语言回答当成检索命中。

provider-on 只单独运行 conversation-context 成文 smoke，结果为 13 / 13；它证明受控成文链路在开启 provider 后仍可工作，不证明检索质量提升，也没有进入上述任何 metric。provider 限流、超时或文案波动不能反向改变本轮检索成绩。

## 回归与构建证据

| 层级 | 结果 |
| --- | --- |
| Backend 全量 pytest | 489 passed |
| Migrated FastAPI provider-off smoke | 51 / 51 |
| DB-unavailable provider-off smoke | 19 / 19 |
| Conversation-context provider-on smoke | 13 / 13 |
| Controlled router focused regression | 14 passed |
| 相关 frontend / smoke Vitest | 65 passed |
| 定向 ESLint | 通过 |
| Next production build | 通过 |
| Browser smoke | 通过；0 console errors / warnings |
| `git diff --check` | 通过 |

首次 production build 捕获 `RetrievalResolution` 缺少 `needs_clarification` 的 TypeScript 联合类型，补齐合同后重新构建通过；这不是当前遗留失败。

独立 completion audit 随后又发现公开 fetch JSON 的 TypeScript 类型还缺少 `spelling_auto_correct`、安全 no-match reasons、`spellingDecision` 和 clarification `candidates`。这些字段已补入 `AnswerGrounding` 合同，并增加 auto / clarification / random no-match 渲染 fixture；定向 9 tests、相关 65 tests、lint 和 production build 均重新通过。

关键复现命令：

```powershell
& 'C:\Users\Chen\anaconda3\python.exe' scripts\run_spelling_recovery_benchmark.py verify `
  --dataset-root C:\tmp\TOEFL-Spell

& 'C:\Users\Chen\anaconda3\python.exe' scripts\run_spelling_recovery_benchmark.py baseline `
  --provider-off --split all --dataset-root C:\tmp\TOEFL-Spell `
  --ecdict output\external-dictionaries\ecdict.csv

# 下列是本轮实际 replay 命令；canonical output 已存在，runner 会拒绝原位覆盖。
& 'C:\Users\Chen\anaconda3\python.exe' scripts\run_spelling_recovery_benchmark.py replay-policy `
  --calibration-cases .runlogs\spelling-recovery-v1\current\calibration\current-calibration-cases.jsonl `
  --calibration-metrics .runlogs\spelling-recovery-v1\current\calibration\current-calibration-metrics.json `
  --calibration-cases-sha256 660698a3f0af5b6a6564df7a10dc2aece39406393e6a225ffc31d6854390d05f `
  --calibration-metrics-sha256 7ed4dd7763e1c28e4efb8e357fc9257782cab51fd96f6c1dad6965b5f18f9d82 `
  --output-dir .runlogs\spelling-recovery-v1\policy-replay\round3-current-policy

# 只允许在尚无 one-shot receipt 时运行；本轮已完成，禁止重跑。
& 'C:\Users\Chen\anaconda3\python.exe' scripts\run_spelling_recovery_benchmark.py current `
  --mode held-out --provider-off --dataset-root C:\tmp\TOEFL-Spell `
  --ecdict output\external-dictionaries\ecdict.csv

& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend\tests `
  -o cache_dir=.runlogs\pytest-cache-spelling-full `
  --basetemp=D:\tmp\enggo-spelling-full

corepack pnpm eval:fastapi:migrated-smoke
corepack pnpm eval:fastapi:conversation-context-smoke
corepack pnpm build
git diff --check
```

## Completion audit 与剩余边界

### Goal 结果要求

| # | 要求 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 独立 local candidate provider + centralized policy | `spelling_candidates.py` / `spelling_decision.py` 及 focused contracts | 完成 |
| 2 | Scope-aware 候选偏好、complete global competition、合并去重，范围不覆盖更短距离 | provider 用一次 query-driven global membership 检查融合概念上的 scope / global 两阶段；排序 / budget / competition / 方案 A 单测通过，held-out 1,924 条 candidate status 均 ready | 完成 |
| 3 | 正确词、高置信、歧义 context + 裸序号、随机串安全边界 | 负样本 12 / 12、3 / 3、4 / 4；真实 HTTP 和 browser multi-turn | 完成 |
| 4 | 数据源不可用或全局竞争不完整时不 500、不 auto | source-unavailable / budget-stop / fail-safe policy 与 service tests | 完成 |
| 5 | Null / in-memory / opt-in JSONL request trace，公开面隔离、写失败 fail-open | trace unit / contract / JSONL live smoke；5 条 provider-off trace | 完成 |
| 6 | 固定 benchmark + comparison report + 负样本 / route samples | pinned manifest、baseline、calibration replay、one-shot held-out、本报告 | 完成 |
| 7 | design / plan / README / progress / bugs / report 交接 | 当前文档已重审；`bugs.md` 只修正已确认的 legacy root-view 事实 | 完成 |

### 约束与变更边界

- exact lookup、direct compare、meaning lookup、context continuation、answer surface 和 provider 边界：全量 pytest、三套 smoke、controlled-router regression 和浏览器回归均通过。
- Agent / LangGraph / ReAct / 自由工具调用 / LLM classifier 扩责 / Query Frame / 中文词性排序 / 自然描述语义检索 / 向量检索：均未引入。
- structured DB 默认状态、`NullStructuredLookupRepository` 语义、meaning / shape / family 检索职责：未改变；spelling provider 只处理单英文目标词的拼写候选。
- silent correction、provider 发明候选、把 `needs_clarification` 误标为 resolved：均由 schema、policy、HTTP 与 UI 合同阻断。
- `.env`、外部 ECDICT / TOEFL、Prisma / legacy structured data、Learn / Review / Progress 和部署配置：未修改。
- `.codex/` 为既存未跟踪本地目录，不纳入 Goal diff；当前分支按计划未 commit / push。
- `backend/app/core/config.py`、`backend/app/content/compact_exam_wordbook.py` 和 `chat_orchestrator.py` 是目标直接需要的窄支撑改动：分别承载 opt-in trace 配置、只读 compact lemma/scope 缓存和既有 orchestrator 的 trace 汇合；没有扩展产品职责。
- chat frontend 仅在真实 browser RED 证明“纠正与范围外状态不可见”后修改既有 surface，并由当前 9 个组件测试、相关 65 个 Vitest、lint、build 与浏览器复验覆盖，符合最小展示例外。
- migrated smoke 的 51 / 51 是对当前 DB-free/provider-off 默认合同的矩阵对齐，不是与旧 structured/provider-on 假设的苹果对苹果比较；具体 realignment caveat 已固化在 Task 6 evidence。

剩余风险被明确留在后续独立 spec：held-out 仍有约 10.4% gold 未进入 Top 3，自动纠正也不是零错误，所以产品继续以 clarification / safe no-match 保护精度；自然描述语义找词、中文词性排序、统一 Query Frame、rule / LLM / hybrid routing 对比和 LangGraph loop 均不属于本轮。

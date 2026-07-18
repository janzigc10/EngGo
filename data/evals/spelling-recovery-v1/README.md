# Spelling Recovery V1 Benchmark Data

本目录只保存 EngGo Spelling Recovery V1 的确定性过滤 manifest，不保存 TOEFL-Spell 的原始 `Annotations.tsv`、essay 文本或完整上游数据集。

## 固定来源

- 上游：<https://github.com/EducationalTestingService/TOEFL-Spell>
- commit：`252ee893b75dbf6186facf9ffda5fc4bc5dc9eca`
- 输入：`Annotations.tsv`
- SHA-256：`2efdf7a3c0d0a73d6550a1fbb40e8bec27dd6c004d417950c4571f80a6f85795`
- EngGo word pool：`data/exam-vocab/ecdict-wordbook/entries.json`
- word pool count：`7,348`
- word pool SHA-256：`d11514cae71d3da67311833aabeca8f06df65cbd80cb98c38a6e034617382d84`

过滤合同固定为：`Type=M`，错误词和正确词均匹配 `^[A-Za-z]+$`，`strip` 后转小写，正确词必须存在于固定 EngGo word pool，排除 identity pair，最后按 `(typo, gold)` 去重。结果为 `2,405` 对；按 `typo<TAB>gold<LF>` 排序并以 UTF-8 编码后的 pair-set SHA-256 为：

```text
fbf50802a5a55ff59d9364fd3aa5c3706e84c80f7d39defa150c310334e14e00
```

## Split 合同

- seed：`20260717`
- calibration：`481`
- held-out：`1,924`
- 同一个 normalized typo 的所有 gold pair 必须整组进入同一个 split，不能发生 collision leakage。
- 分层信号为 OSA Damerau-Levenshtein 距离桶、gold 长度桶和最早 direct exam scope。
- `manifest.json` 保存完整 case ID、pair、acceptable gold、collision group、split 和 stratum；不要手工编辑。

## 生成与验证

Windows 上使用项目固定的 Anaconda Python，避免 PATH 中旧 Python 3.8 和缺失依赖造成假失败：

```powershell
$py = 'C:\Users\Chen\anaconda3\python.exe'

& $py scripts\run_spelling_recovery_benchmark.py prepare `
  --dataset-root C:\tmp\TOEFL-Spell

& $py scripts\run_spelling_recovery_benchmark.py verify `
  --dataset-root C:\tmp\TOEFL-Spell
```

`verify` 会重新检查 git commit、上游文件 hash、word pool hash、过滤结果、pair hash、collision grouping、split 数量、case IDs 和 strata，然后将 fresh rebuild 与仓库 manifest 做完整比较。

## Provider-off baseline

```powershell
& $py scripts\run_spelling_recovery_benchmark.py baseline `
  --dataset-root C:\tmp\TOEFL-Spell `
  --ecdict C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv `
  --split all `
  --provider-off
```

baseline 直接使用真实 rule router 和 `OrdinaryLookupService`，显式注入 `provider=None` 与 `NullStructuredLookupRepository`。runner 不调用 `load_settings()` / `load_dotenv()`，也不会读取 `.env` 中的 provider 配置。默认产物写入 ignored 的 `.runlogs/spelling-recovery-v1/baseline/`：

- `baseline-cases.jsonl`：逐 case route、slot、candidate、resolution/no-match 和 latency；
- `baseline-metrics.json`：Recall@1/3/5、MRR、route/slot、outcome 分布和 latency 汇总；
- `baseline-summary.md`：便于审阅的 Markdown 摘要。

Candidate Recall/MRR 只读取 typo candidate repository 通道。若一个 typo 本身碰巧是 ECDICT 真实词并由 exact fallback 返回，最终 outcome 会照实记录，但不能计为 typo candidate recall。

## Current provider-off benchmark

`current` 直接调用真实 `EcdictSpellingCandidateProvider.generate(..., limit=8)` 与冻结的 `SpellingDecisionPolicy`。它仍然显式保持 structured runtime off、LLM provider off；provider-on 成文或 recovery smoke 必须另写报告，不能计入 Recall 或自动纠正 precision。

只在 calibration 上迭代；formal current calibration 固定完整运行 manifest 中全部 481 条，current CLI 不提供 `--limit`：

```powershell
& $py scripts\run_spelling_recovery_benchmark.py current `
  --mode calibration `
  --provider-off `
  --dataset-root C:\tmp\TOEFL-Spell `
  --ecdict C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv
```

阈值冻结后，held-out 只运行一次：

```powershell
& $py scripts\run_spelling_recovery_benchmark.py current `
  --mode held-out `
  --provider-off `
  --dataset-root C:\tmp\TOEFL-Spell `
  --ecdict C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv
```

held-out 禁止 `--limit` 和自定义 `--output-dir`，必须完整读取 manifest 中全部 1,924 条。正式目录固定为 `.runlogs/spelling-recovery-v1/current/held-out/`；runner 会先创建 one-shot receipt，只要 receipt 或任一正式产物已存在就拒绝覆盖或复跑。即使最终 gate 失败，JSONL / JSON / Markdown 也会保留，CLI 随后以非零状态退出。

默认产物分别写入 ignored 的 `.runlogs/spelling-recovery-v1/current/<mode>/`：逐 case JSONL、metrics JSON 和 Markdown 摘要。current 报告包含 route / slot、候选 Recall@1/3/5 与 MRR、decision precision / coverage、clarification / safe no-match、resolution/no-match matrix、recovery/provider outcome、exam target / active-scope-vs-global / 词长 / 编辑距离分层，以及 ECDICT cold load、provider cold prepare、warm p50/p95 和 RSS 增量。

`gateSummary.allPassed` 只有在当前 selected split 完整且全部已评估合同通过时才为 `true`；`readinessPassed` 只有完整 481 条 calibration 才是布尔值，partial summary 必须为 `null`。calibration 也评估 Recall@3 与已有 auto-correct 的 precision，作为 held-out 前 readiness，但 CLI 不因 calibration 未达门而改变为失败退出。`finalGatePassed` 只有在完整 held-out split 上才是布尔值，calibration 为 `null`。主 split 与固定 fixtures 的 route accuracy、slot exact 和 slot token F1 都要求 100%。当任一 split 没有任何 `auto_correct` 时，precision 保持 `null`，但因设计不设 coverage 最低门而按 precision gate通过；coverage 仍必须原样报告。

同一个 typo 的 collision rows 使用 manifest 中完整的 `acceptableGolds`：候选列表中最早出现的任一可接受 gold 决定 rank，自动纠正到任一可接受 gold 都计为正确。`quality-fixtures.json` 另行固定了按考试范围、词长和距离一近邻密度分层的 valid-word 负样本、歧义 typo、随机串和稳定 route/slot 样本；它不改变 manifest split 或 pair hash。

RSS 只使用 Python 标准库读取当前进程 working set。runner 先加载 ECDICT base index，再测 compact/provider prepare 的增量；主 split 的 warm latency 在独立 cold probe 完成后才开始，因此不包含首次加载时间。

## Attribution and license

TOEFL-Spell was created by Michael Flor, Michael Fried, and Alla Rozovskaya and is associated with the paper *A Benchmark Corpus of English Misspellings and a Minimally-supervised Model for Spelling Correction* (2019).

The upstream dataset is licensed under the [Creative Commons Attribution-ShareAlike 4.0 License](https://creativecommons.org/licenses/by-sa/4.0/). `manifest.json` is a modified, filtered derivative containing only the benchmark typo/correction subset and EngGo evaluation metadata; that data artifact is distributed under the same CC BY-SA 4.0 terms. The runner source code is not an upstream dataset artifact.

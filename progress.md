# EngGo 滚动交接

## 当前状态（2026-07-17 Retrieval Observability & Spelling Recovery V1 设计待复核）

- 当前分支 / worktree：`codex/meaning-lookup-quality-gate-v1`，工作区 `C:\Users\Chen\Desktop\EngGo`。
- 本轮代码起始基线：`9217d07 Implement chat card density controls`；tracked tree 起始为 clean，既存 `?? .codex/` 不纳入提交。
- 用户已在对话中批准 `docs/superpowers/specs/2026-07-17-retrieval-observability-spelling-recovery-v1-design.md` 的产品与技术方向。
- 当前只完成设计文档，尚未创建 implementation plan，尚未修改运行时代码；下一步必须先由用户复核正式 spec。
- Card Density V1、Card-Shell Streaming 和 `answerSurface` V1.1 继续作为稳定 UI 基线，本轮不重开前端展示设计。

## 本轮已完成

1. 深度检索与路由根因审计
   - 固定种子 `20260717` 的 360 条明确意图样本中，高层 intent / tool route 全部正确；当前主要失败集中在 slot normalization、candidate recall、ranking 和 recovery。
   - 100 个合成单编辑 typo 全部进入正确 fuzzy route，但默认 `NullStructuredLookupRepository` 下恢复率为 0%。
   - ETS TOEFL-Spell 与当前考试词表交集的随机 50 对实跑：50 / 50 进入 `fuzzy_recall`，Recall@1 / Recall@5 均为 0%；说明默认错拼候选通道结构性缺席，而非高层路由失败。
   - 中文 primary gloss 反查样本 Hit@1 80%、Hit@3 95%、Hit@6 98.3%；形容词 Hit@1 仅 55%，属于后续独立排序问题，不纳入本轮。
   - 旧 `.runlogs/chat-interaction.jsonl` 混有大量 smoke / test 字面量且缺少 route、slots、candidates、recovery 等字段，不能用于声明当前真实用户故障占比。

2. Retrieval Observability & Spelling Recovery V1 设计
   - 第一刀选择“可观测性 + 用户可见错拼修复”的最小闭环，不先迁移 Agent / LangGraph。
   - 错拼策略为精度优先：高置信才明确纠正，歧义时给最多 3 个候选，随机串保持 no-match。
   - 候选范围为当前考试范围优先，没有可靠候选时回退全局 ECDICT，并明确范围外状态。
   - trace 定义为 request-scoped 结构化诊断日志，仅开发 / benchmark 侧使用，不进入公开 API，不记录模型思维链。
   - 选择独立本地 spelling candidate provider，不恢复 structured DB，不把搜索算法继续堆进 ordinary lookup。

## 当前证据与验证边界

- 当前轮为只读审计与文档设计，没有运行时代码 diff，因此尚无新功能测试成绩。
- 已完成现状基准、真实 FastAPI / provider-off 对照和 TOEFL-Spell 外部交叉验证；这些数字是 baseline，不是修复后成绩。
- 正式实现的验收门槛已写入 spec：正确词和随机串误纠正率 0%，auto-correct precision >= 98%，held-out Recall@3 >= 85%，warm p95 <= 150ms，新增 RSS <= 100MB。
- provider-off 检索指标与 provider-on 成文 / recovery 必须分开报告，LLM 补救不能计入检索提升。

## 下一步

1. 用户复核正式设计 spec；有修改先修 spec 并重新做独立审查。
2. 用户确认 spec 后，创建新的 implementation plan，不能续接已完成旧 plan。
3. 实现顺序保持：baseline / trace contract -> spelling candidate provider -> decision policy -> ordinary lookup 接入 -> trace 汇合 -> calibration / held-out benchmark -> HTTP / browser 回归。
4. Query Frame、中文词性排序、自然描述语义检索和混合路由比较均留到后续独立 spec，不在本轮顺手实现。

## 环境注意

- benchmark 与 live smoke 必须显式设置 `ENGGO_ECDICT_PATH=C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv`；ignored ECDICT 缺失会制造假 no-match。
- 默认验证固定 `ENGGO_USE_STRUCTURED_RUNTIME=false`；structured DB 只保留为可选历史 overlay。
- provider-off 与 provider-on 分开运行；不要让 `.env` 中的 provider key 意外掩盖检索失败。
- Windows PowerShell 发送中文 JSON / 正则时注意编码；真实探针优先使用 Node 和 Unicode escape。
- 本地 Browser QA 使用 `http://localhost:3000`，避免 `127.0.0.1` 的 Next dev origin 坑。

## 稳定基线

- Chat `answerSurface` V1.1、Card-Shell Streaming、Card Density V1 已完成；不恢复 row-level card streaming。
- 聊天式学习上下文 V1 / V2 / V3 进入维护状态，继续保护范围切换、`还有吗`、候选内语境选择和有边界聊天兜底。
- ECDICT CSV + 7,348 compact exam-tagged records 是当前默认词库底座；structured DB 默认不启用。
- 现有 rule-first + grey-zone model-assisted routing 保持，不升级成开放 ReAct Agent。
- Wordbook Learn / Review V1、体验打磨、V2 产品硬化与 V2.1 active session persistence 已完成。

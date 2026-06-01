# ECDICT-backed Wordbook Expansion V1 Plan

## Goal

把当前可用的 Wordbook Learn / Review 从 546 个 `real-smoke` 词条扩展到 ECDICT-backed CET-6 词书，并顺手修掉本轮验证中发现的两个明显体验/健康问题：ECDICT-only 直接辨析太薄、首页文案与 hydration 状态不一致。

## Scope

- 默认词书继续保持 `cet6-foundation-v1`，避免破坏现有本地进度和 active session。
- 词书内容改为由 ECDICT + source lemma manifests 生成的 compact JSON。
- 不做完整人工 graph，不做 NotebookLM 复刻，不推进收藏页，不做 UI 大精修。
- 对无人工易混组的 direct compare，只加基于 ECDICT 释义的保守核心义提示。
- 保持 Learn / Review state machine 和本地存储协议不变。

## Task 0 - Scope Lock And Docs
- [x] 复核原始大 spec、ECDICT backbone spec、Wordbook state-machine spec 和当前 `progress.md`。
- [x] 记录本轮产品决策：ECDICT 作为背词底座，graph / 收藏 / NotebookLM / UI 大精修放缓。
- [x] 新增本 spec 与本 plan。
- [x] 更新 `docs/README.md` 和 `progress.md`，把本轮设为当前活跃计划。

Acceptance:
- 后续实现不再围绕旧 `real-smoke` 小词书继续扩写，也不把本轮扩大成 graph / NotebookLM / UI 重做。

## Task 1 - ECDICT Wordbook Generator
- [x] 新增 generator，从本地 ECDICT CSV 和 source lemma manifests 生成 `data/exam-vocab/ecdict-wordbook/entries.json`。
- [x] 生成规则保守：只收 lookup-friendly、source-backed、ECDICT exact match、cleaned Chinese meaning 非空的词。
- [x] 输出稳定排序和去重结果，避免每次运行产生无意义 diff。
- [x] 生成结果不包含 postgrad scope。

Acceptance:
- 生成文件可提交，前端不需要加载 65MB ECDICT CSV。

## Task 2 - Wire Wordbook Data
- [x] `wordbook-data.ts` 改用 generated ECDICT wordbook JSON。
- [x] 保持 `defaultWordbookId` 为 `cet6-foundation-v1`。
- [x] 更新 label / sourceLabel，明确它是 ECDICT + source lemmas，不是完整官方词书。
- [x] 更新 wordbook tests，覆盖规模、source label、CET-6 membership 和 lookup 行为。

Acceptance:
- Learn / Review / Progress 继续使用同一个默认词书，现有本地状态不会因为 ID 变化失效。

## Task 3 - ECDICT-only Direct Compare
- [x] `build_direct_compare_answer` 在无人工 `comparisonView` 时输出保守核心义区分。
- [x] 区分文本只来自候选 ECDICT meanings，不生成持久 graph，不伪装人工教学关系。
- [x] 更新后端测试，覆盖 `restrain / constrain` 或 ECDICT-only fallback 文案不再只是两行释义。

Acceptance:
- 用户问直接区别时，即使没有人工组，也能得到短辨析；但回答仍明确只是基础释义层。

## Task 4 - Homepage Copy And Hydration Fix
- [x] 更新聊天首页右侧状态文案，不再说收藏/学习/复习还没接入。
- [x] 修 `useChatSession` 初始读取 sessionStorage 导致的 hydration mismatch。
- [x] 补组件/Hook 测试覆盖 transcript restore 发生在 mount 后。

Acceptance:
- 本地已有 chat transcript 时，首页不再出现 observed hydration mismatch。

## Task 5 - Verification And Handoff
- [x] 跑 generator。
- [x] 跑 focused frontend tests：wordbook、chat workspace/session。
- [x] 跑 focused backend direct compare tests。
- [x] 跑 focused lint 和 `git diff --check`。
- [x] 用浏览器验证 `/learn`、`/review`、`/progress` 和首页 chat smoke。
- [x] 更新 `progress.md`、`docs/README.md`，记录最终验证与剩余边界。

Acceptance:
- 新词书、直接辨析和首页健康问题都完成，并且没有把延期方向误写成当前待办。

## Execution Order

1. Task 0
2. Task 1
3. Task 2
4. Task 3
5. Task 4
6. Task 5

这个顺序先保证产品边界和数据源，再换词书数据，随后补聊天辨析质量，最后处理首页健康问题并统一验证。

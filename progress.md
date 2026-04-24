# EngGo 滚动交接

## 当前阶段
已完成 Task 1 至 Task 7、fuzzy retrieval follow-up plan Step 1-6、形近词簇 P0 seed 扩样本，以及 `EngGo Answer Style + Root Family Map` implementation plan 的 Task 1-5。当前已经落地两条回答主线：

- `confusion_untangle`：形近词、易混词对比、group compare 统一进入“先问一句 / 分流 / 题里抓”的回答风格
- `root_family_summary`：先用最小原型闭环支撑 `stitute` / `tempt` 两族，保持保守范围

下一阶段不建议先继续堆词库；优先把 EngGo 的“解混淆语言”和回答风格定下来。新的路线文档已落盘：

- [docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md)
- [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)

当前下一刀已确定：先做“小批次真实 provider 的 answer-style smoke”，先验证真实模型输出是否真的像 EngGo，再决定是否扩第二批 root prototype。

核心判断：EngGo 至少要区分两条完全不同的主线：

- 易混解团：用户脑子里混着几个词，需要判断入口和做题分流。
- 词根家族地图：用户有词根/前缀/碎片，需要结构化展开和优先级。

## 本 Session 已完成
- 2026-04-24 固化 DeepSeek flash 为长期真实 provider smoke：
  - 本地 `.env` 已写入 DeepSeek provider 三件套：
    - `OPENAI_API_KEY`：已配置，文件被 `.gitignore` 忽略，不提交。
    - `OPENAI_BASE_URL=https://api.deepseek.com/v1`
    - `OPENAI_MODEL=deepseek-v4-flash`
  - [`.env.example`](/C:/Users/Chen/Desktop/EngGo/.env.example) 已保留非敏感默认值：
    - `OPENAI_BASE_URL=https://api.deepseek.com/v1`
    - `OPENAI_MODEL=deepseek-v4-flash`
    - `OPENAI_API_KEY` 仍为空，由本地 `.env` 提供。
  - 验证方式：不再临时注入 `OPENAI_*` 环境变量，直接启动 `corepack pnpm dev`，再跑 `corepack pnpm eval:answer-style:provider`。
  - 验证结果：5 pass / 4 manual / 0 fail，说明以后本地真实 provider smoke 可直接使用 DeepSeek flash；输出保存在 [test-results/deepseek-env-default-smoke.txt](/C:/Users/Chen/Desktop/EngGo/test-results/deepseek-env-default-smoke.txt)。

- 2026-04-24 处理“牵强字母口诀”反馈：
  - 用户指出 `文具 = stationery（e 联想 envelope）` 太突兀，不应输出这类不必要口诀。
  - 根因确认：
    - `data/exam-vocab/seed/confusion-groups.json` 的 `stationary-stationery.memberNotes` 里原本有 `a 可联想 stay` / `e 可联想 envelope`。
    - `src/features/answering/build-system-prompt.test.ts` fixture 里也复制了这类 emphasis note。
    - 模型不是凭空发明，而是 grounding 把这些 note 带给了 provider。
  - 修改：
    - `stationary` note 改为 `常见搭配 remain stationary，表示保持静止。`
    - `stationery` note 改为 `常见搭配 stationery store，表示文具店。`
    - `confusion_untangle` prompt 新增 guardrail：不要使用 `e= envelope` 这类牵强字母口诀，优先用语义、词性、搭配和场景做边界。
    - 新增 retrieval 测试，锁定 `stationary/stationery` 不再暴露 `envelope` / `stay` note。
  - 已执行 `corepack pnpm db:seed`，把 seed 变更灌回本地 Prisma dev 数据库。
  - 验证：
    - `corepack pnpm test src/features/answering/build-system-prompt.test.ts`：3 passed / 3 passed
    - `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`：33 passed / 33 passed
    - `corepack pnpm eval:answer-style`：8 passed / 0 failed
    - `corepack pnpm eval:shape`：34 passed / 0 failed
    - `corepack pnpm exec eslint src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts src/features/retrieval/retrieve-candidates.test.ts`：通过
  - DeepSeek flash 单例验证：
    - 问法：`stationary 和 stationery 哪个是文具`
    - 输出不再包含 `envelope` 或 `stay`
    - 当前回答：`为什么会混：stationary 和 stationery 只差 a/e，是经典形近拼写混淆。... 题里抓：stationary 搭配 remain；stationery 搭配 store。核心边界：stationary 是形容词表静止；stationery 是名词表文具。`
    - 结果文件：[test-results/deepseek-stationery-no-mnemonic.json](/C:/Users/Chen/Desktop/EngGo/test-results/deepseek-stationery-no-mnemonic.json)

- 2026-04-24 追加完成 few-shot 短答压缩：
  - 在 [src/features/answering/build-system-prompt.ts](/C:/Users/Chen/Desktop/EngGo/src/features/answering/build-system-prompt.ts) 为两条真实回答主线加入短答 few-shot：
    - `confusion_untangle` 示例固定为“为什么会混 / 先问一句 / 题里抓”三段。
    - `root_family_summary` 示例固定为“碎片判断 / 家族地图 / 优先背 / 谨慎提醒”四段。
    - 追加“超过 2 个词时，用公式行压缩”和“优先背最多 2 个”的约束，避免 DeepSeek 展开成长列表。
  - TDD 红灯已确认：
    - `corepack pnpm test src/features/answering/build-system-prompt.test.ts` 先因缺少 `短答示例` 失败。
    - 追加公式化压缩约束时，该测试也先因缺少对应约束失败。
  - 修改后验证：
    - `corepack pnpm test src/features/answering/build-system-prompt.test.ts`：3 passed / 3 passed
    - `corepack pnpm eval:answer-style`：8 passed / 0 failed
    - `corepack pnpm test scripts/run-answer-style-provider-smoke.test.ts`：6 passed / 6 passed
    - `corepack pnpm exec eslint src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts`：通过
  - 使用 DeepSeek flash 临时环境重跑真实 provider smoke：
    - few-shot v1：4 pass / 5 manual / 0 fail，输出保存在 [test-results/deepseek-provider-smoke-fewshot.txt](/C:/Users/Chen/Desktop/EngGo/test-results/deepseek-provider-smoke-fewshot.txt)
    - few-shot v2：4 pass / 5 manual / 0 fail，输出保存在 [test-results/deepseek-provider-smoke-fewshot-v2.txt](/C:/Users/Chen/Desktop/EngGo/test-results/deepseek-provider-smoke-fewshot-v2.txt)
  - 当前判断：
    - few-shot 明显改善了回答形态：`stationary/stationery`、`recent/resent`、`tempt` 等已接近或进入 pass。
    - 剩余 manual 大多是轻微超当前严格字数阈值，例如 `stationary/stationery` 221 chars vs 220、`access/assess/excess` 270 vs 260。
    - 不建议继续无限压 prompt；下一刀更适合重新校准 smoke 的 `maxAnswerChars`，或接受“稍长但仍像学生答疑”的真实输出。

- 2026-04-24 追加完成真实 provider smoke 第一轮 prompt tuning：
  - 修改 [src/features/answering/build-system-prompt.ts](/C:/Users/Chen/Desktop/EngGo/src/features/answering/build-system-prompt.ts)：
    - `confusion_untangle` / `root_family_summary` 不再套用通用“主答案 / 易混边界 / 范围提醒 / 下一步”四段标题。
    - `confusion_untangle` 明确要求总长度 260 汉字以内、最多 3 段、只输出“为什么会混 / 先问一句 / 题里抓”，禁止例句、长列表和补充扩展。
    - `root_family_summary` 明确要求总长度 280 汉字以内、最多 4 段、只输出“碎片判断 / 家族地图 / 优先背 / 谨慎提醒”，禁止词源长故事和完整列表。
  - 修改 [scripts/run-answer-style-provider-smoke.ts](/C:/Users/Chen/Desktop/EngGo/scripts/run-answer-style-provider-smoke.ts)：
    - 默认请求超时从 15s 提高到 45s。
    - 新增 `ENGGO_PROVIDER_SMOKE_TIMEOUT_MS` 覆盖入口。
  - 新增/更新测试覆盖：
    - [src/features/answering/build-system-prompt.test.ts](/C:/Users/Chen/Desktop/EngGo/src/features/answering/build-system-prompt.test.ts)
    - [scripts/run-answer-style-provider-smoke.test.ts](/C:/Users/Chen/Desktop/EngGo/scripts/run-answer-style-provider-smoke.test.ts)
  - TDD 红灯已确认：
    - `corepack pnpm test src/features/answering/build-system-prompt.test.ts`：先因缺少限长/短段约束失败。
    - `corepack pnpm test scripts/run-answer-style-provider-smoke.test.ts`：先因缺少 `resolveRequestTimeoutMs` 失败。
  - 修改后验证：
    - `corepack pnpm test src/features/answering/build-system-prompt.test.ts`：3 passed / 3 passed
    - `corepack pnpm test scripts/run-answer-style-provider-smoke.test.ts`：6 passed / 6 passed
    - `corepack pnpm eval:answer-style`：8 passed / 0 failed
    - `corepack pnpm exec eslint src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts scripts/run-answer-style-provider-smoke.ts scripts/run-answer-style-provider-smoke.test.ts`：通过
  - 使用 DeepSeek flash 临时环境重跑真实 provider smoke：
    - 第一刀后：2 pass / 5 manual / 2 fail；2 fail 均为旧 15s timeout。
    - 改 runner 默认 45s 后：2 pass / 7 manual / 0 fail。
    - 第二刀进一步收紧 prompt 后：3 pass / 6 manual / 0 fail，输出保存在 [test-results/deepseek-provider-smoke-after-prompt-v2.txt](/C:/Users/Chen/Desktop/EngGo/test-results/deepseek-provider-smoke-after-prompt-v2.txt)。
  - 当前结论：
    - 超时 hard fail 已解决；DeepSeek flash 对 9 条 provider smoke 能稳定跑完。
    - prompt tuning 已明显缩短回答，但 DeepSeek 仍会在多数 resolved case 超过当前严格 `maxAnswerChars`，下一刀可二选一：继续压 prompt，或把 smoke 的长度阈值调整到更符合真实学生问答可读性的范围。

- 2026-04-24 追加完成 DeepSeek flash 真实 provider smoke：
  - 用户提供 DeepSeek 临时 key；本轮仅作为临时进程环境变量使用，未写入 `.env`、未写入仓库文件。
  - 最小探测结果：
    - `OPENAI_BASE_URL=https://api.deepseek.com/v1`
    - `OPENAI_MODEL=deepseek-v4-flash`
    - `deepseek-v4-flash`：`/chat/completions` 返回 200
    - `DeepSeek-V4-Flash`：返回 400 `Model Not Exist`
    - `deepseek-chat`：可用，但实际返回模型仍是 `deepseek-v4-flash`
  - 串行 preflight：
    - `corepack pnpm exec prisma dev ls`：`enggo` running
    - `corepack pnpm eval:answer-style`：8 passed / 0 failed
  - 使用现有 `corepack pnpm eval:answer-style:provider` 跑完整 9 条时，DeepSeek 链路已接通，但 runner 默认 15s timeout 偏紧：
    - summary：2 pass / 5 manual / 2 fail
    - 2 个 fail 均为 `request timed out after 15000ms`，不是 provider HTTP 错误或 grounding drift
    - 5 个 manual 主要为回答超长，说明 DeepSeek 输出偏“讲义型”
  - 改用 Node `fetch` 直接对本地 `/api/chat` 发 UTF-8 学生提问，并将单条超时放宽到 90s，结果写入 [test-results/deepseek-answer-style-smoke-node.json](/C:/Users/Chen/Desktop/EngGo/test-results/deepseek-answer-style-smoke-node.json)
  - UTF-8 直连 9 条结果：
    - `stationary 和 stationery 哪个是文具` -> `direct_compare/resolved/confusion_untangle`，provider called，757 chars
    - `access assess excess 怎么区分` -> `direct_compare/resolved/confusion_untangle`，provider called，925 chars
    - `跟 recent 很像的词有哪些` -> `shape_neighbor_search/resolved/confusion_untangle`，provider called，1205 chars
    - `comply conform defer 怎么区分` -> `direct_compare/resolved/confusion_untangle`，provider called，609 chars
    - `respect 那组词怎么分` -> `direct_compare/resolved/confusion_untangle`，provider called，1080 chars
    - `stitute 是什么` -> `root_family_summary/resolved/root_family_summary`，provider called，1879 chars
    - `tempt 这一族怎么记` -> `root_family_summary/resolved/root_family_summary`，provider called，1246 chars
    - `re+con 的词根有什么词` -> `root_family_summary/no_match/root_family_summary`，provider skipped，87 chars
    - `有个像 reqeust 的词` -> `fuzzy_recall/no_match/standard_lookup`，provider skipped，68 chars
  - 结论：
    - DeepSeek flash 可以作为真实 provider 跑通 EngGo 的 retrieval -> grounding -> prompt -> answer 主链路。
    - 当前 hard grounding 目标全部命中；真正的产品问题是回答太长，下一刀优先做 prompt guardrail tuning，让 `confusion_untangle` 和 `root_family_summary` 更短、更像学生问答，而不是长讲义。
    - 如果继续使用 `eval:answer-style:provider`，建议先把 runner timeout 做成可配置或提高到 45s，避免把 DeepSeek 慢响应误判为 hard fail。

- 完成 `2026-04-24-enggo-answer-style-real-provider-smoke.md` Task 1：
  - 新增 [scripts/lib/answer-style-provider-smoke.ts](/C:/Users/Chen/Desktop/EngGo/scripts/lib/answer-style-provider-smoke.ts)
  - 新增 [scripts/lib/answer-style-provider-smoke.test.ts](/C:/Users/Chen/Desktop/EngGo/scripts/lib/answer-style-provider-smoke.test.ts)
  - `vitest.config.ts` 现已纳入 `scripts/**/*.test.ts(x)`，计划命令可以直接命中新测试
  - smoke 纯库现已覆盖：
    - 9 条 provider smoke case 定义
    - `queryMode` / `resolution` / `answerStyle` / `expectedGroundingIncludes` / `expectedRootFamilyViewId` drift fail
    - `rootFamilyView.members` 聚合路径
    - `status=200 + error` hard-fail
    - `resolved` 必须有 `providerRequestId`
    - `no_match` 必须无 `providerRequestId` 且 answer 非空
    - `manualChecks` 与 `manualFlags` 分离
- 本轮已实际验过 Task 1 的正式命令：
  - `corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts`
  - 当前状态：15 passed / 15 passed
- 当前正在进入 Task 2：
  - 目标是新增 `scripts/run-answer-style-provider-smoke.ts` 和 `eval:answer-style:provider`
  - 继续保持串行，不把真实 provider smoke 接进 `verify`
- 完成 `2026-04-24-enggo-answer-style-real-provider-smoke.md` Task 2：
  - 新增 [scripts/run-answer-style-provider-smoke.ts](/C:/Users/Chen/Desktop/EngGo/scripts/run-answer-style-provider-smoke.ts)
  - 新增 [scripts/run-answer-style-provider-smoke.test.ts](/C:/Users/Chen/Desktop/EngGo/scripts/run-answer-style-provider-smoke.test.ts)
  - `package.json` 新增 `eval:answer-style:provider`
  - runner 现已具备：
    - 严格串行请求本地 `/api/chat`
    - 复用 smoke library case / evaluator / summary
    - 默认 `ENGGO_CHAT_BASE_URL || http://127.0.0.1:3000`
    - 429 最多 2 次保守重试
    - 单条请求超时保护，避免整轮挂死
    - `providerCalled / providerSkipped / providerUnknown` 分桶，避免把 provider 失败误记成 skip
    - 一行简洁输出 + `manual/fail` 详细展开 + summary `nextStep`
- 本轮已实际验过 Task 2 的本地命令：
  - `corepack pnpm test scripts/run-answer-style-provider-smoke.test.ts`
  - 当前状态：4 passed / 4 passed
  - `corepack pnpm test scripts/lib/answer-style-provider-smoke.test.ts`
  - 当前状态：15 passed / 15 passed
  - `corepack pnpm exec eslint scripts/run-answer-style-provider-smoke.ts scripts/run-answer-style-provider-smoke.test.ts`
  - 当前状态：通过
  - `corepack pnpm exec tsx --eval "(async () => { await import('./scripts/run-answer-style-provider-smoke.ts'); })()"`
  - 当前状态：通过
- Task 3 预检现状：
  - `corepack pnpm exec prisma dev ls`：`enggo` running
  - `.env`：`OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL` 均未配置
  - 当前进程环境：`OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL` 也均未配置
  - `http://127.0.0.1:3000`：本轮已临时启动并验证可访问，跑完 smoke 后已关闭
  - 当前 blocker：要继续真实 provider smoke，必须先补 provider 环境变量
- 本轮已实际执行 Task 3：
  - `corepack pnpm exec prisma dev ls`
  - 当前状态：`enggo` running
  - `corepack pnpm eval:answer-style`
  - 当前状态：8 passed / 0 failed
  - 启动本地 app 后验证 `http://127.0.0.1:3000`
  - 当前状态：200，可访问；跑完 smoke 后已手动关闭
  - `corepack pnpm eval:answer-style:provider`
  - 当前状态：2 pass / 0 manual / 7 fail
  - fail 原因已明确收敛为同一外部 blocker：服务端返回 `503`，错误信息为 `OPENAI_API_KEY is not configured on the server.`
  - 当前 summary：
    - `resolved`: 0
    - `no_match`: 2
    - `providerCalled`: 0
    - `providerSkipped`: 2
    - `providerUnknown`: 7
    - `nextStep`: 先处理 hard fail，再决定是否继续真实 smoke
- Task 3 结论：
  - 真实 smoke runner 本身已能跑通并输出稳定 summary
  - 当前不能据此判断真实 provider 的回答风格，因为 provider 根本没有被调用成功
  - 下一步不是调 retrieval / prompt，而是先把 provider 环境配好，再重跑 `corepack pnpm eval:answer-style:provider`

- 重新阅读并确认当前阶段入口文档与相关计划：
  - `progress.md`
  - `bugs.md`
  - `context.md`
  - `docs/superpowers/specs/2026-04-21-exam-english-chat-design.md`
  - `docs/superpowers/plans/2026-04-23-enggo-confusion-taxonomy-roadmap.md`
  - `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md`
- 阅读真实 provider / eval 相关实现入口，确认下一刀可以复用现有链路，而不是先改 schema 或扩 root：
  - `src/features/answering/chat-provider.ts`
  - `src/features/answering/chat-provider.test.ts`
  - `src/features/answering/chat-service.ts`
  - `src/app/api/chat/route.ts`
  - `scripts/run-answer-style-eval.ts`
  - `scripts/run-chat-batch-eval.ts`
  - `scripts/run-shape-neighbor-eval.ts`
- 新建下一轮正式 implementation plan：
  - [docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md)
  - 目标：用 8-10 条真实 provider smoke 验证 `confusion_untangle` / `root_family_summary` / guarded `no_match` 的真实输出形态
  - 明确暂不做：第二批 root prototype、root schema、typo 闸门放宽、把真实 smoke 接进 `verify`
- 本次仅完成计划与交接更新，未运行新的代码测试或真实 provider 验证命令。

- 先按用户要求做了 checkpoint commit：
  - `40cc4a0 chore: checkpoint shape-neighbor p0 work`
- 完成 `docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md` Task 1-5：
  - `src/features/answering/build-grounding.ts` 新增 `answerStyle` / `rootFamilyView`
  - `src/features/answering/build-system-prompt.ts` 按 `standard_lookup / confusion_untangle / root_family_summary` 分支出不同 prompt guardrails
  - `src/features/retrieval/normalize-query.ts` 新增保守的 `root_family_summary` query-mode 识别
  - 新增 [src/features/retrieval/root-family-prototypes.ts](/C:/Users/Chen/Desktop/EngGo/src/features/retrieval/root-family-prototypes.ts:1)，首批只覆盖 `root-stitute` / `root-tempt`
  - `src/features/retrieval/retrieve-candidates.ts` 新增 `handleRootFamilySummary`
  - `src/features/answering/chat-service.ts` 为 `root_family_summary + no_match` 增加“先不硬凑规律”的专属兜底文案
  - 新增 [scripts/run-answer-style-eval.ts](/C:/Users/Chen/Desktop/EngGo/scripts/run-answer-style-eval.ts:1) 和 `corepack pnpm eval:answer-style`
- 为新行为补齐并转绿测试 / eval：
  - `corepack pnpm test src/features/answering/build-system-prompt.test.ts`：3 passed
  - `corepack pnpm test src/features/answering/chat-service.test.ts`：4 passed
  - `corepack pnpm test src/features/retrieval/root-family-prototypes.test.ts`：4 passed
  - `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`：32 passed
  - `corepack pnpm eval:answer-style`：8 passed / 0 failed
  - `corepack pnpm eval:shape`：34 passed / 0 failed
- 同步更新了 `scripts/run-shape-neighbor-eval.ts` 的碎片输入预期：
  - `re+con 的词根有什么词` 现在是 `root_family_summary -> no_match`
  - 不再是旧的 `fuzzy_recall -> no_match`
- 这轮验收中再次撞到已知 Prisma dev 环境毛刺：
  - `corepack pnpm verify` 首次失败点：`src/features/content/seed-content.test.ts`
  - 现象：`Received unexpected commandComplete message from backend`
  - 处理：按 `bugs.md` 已知路径执行 `prisma dev rm enggo --force` -> `prisma dev -n enggo ...` -> `corepack pnpm db:migrate` -> `corepack pnpm db:seed`
  - 恢复后 `seed-content.test.ts` 和整轮 `verify` 均通过
- 本次接力先复跑健康基线：
  - `corepack pnpm exec prisma dev ls`：`enggo` running
  - `corepack pnpm exec tsx scripts/check-seed-content.ts`：82 entries / 31 confusion groups
  - `corepack pnpm eval:shape`：34 passed / 0 failed，平均耗时约 131ms
- 已按 `2026-04-23-enggo-confusion-taxonomy-roadmap.md` 创建正式 implementation plan：
  - [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)
  - 第一阶段限定为 answer style / query mode / minimal root prototype / deterministic eval
  - 明确不新增 root 数据表、不扩 P1 seed、不放宽 `reqeust` / `recomand` typo 闸门
- 已阅读相关代码入口并把计划落到具体文件：
  - `src/features/answering/build-system-prompt.ts`
  - `src/features/answering/build-grounding.ts`
  - `src/features/answering/chat-service.ts`
  - `src/features/retrieval/normalize-query.ts`
  - `src/features/retrieval/retrieve-candidates.ts`
  - `scripts/run-shape-neighbor-eval.ts`
- 按交接先复跑基线：
  - `corepack pnpm exec prisma dev ls`：`enggo` running
  - `corepack pnpm db:seed`：成功
  - `corepack pnpm eval:shape`：初始基线 9 passed / 0 failed
- 创建下一轮 implementation plan：
  - [docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md)
  - 选择候选池 P0 全部 20 组入 seed，P1 暂不碰
- 按 TDD 红灯先加覆盖：
  - `scripts/run-shape-neighbor-eval.ts` 新增 25 个 P0 case：5 个 shape-neighbor list/misread case + 20 个 direct compare case
  - `src/features/retrieval/retrieve-candidates.test.ts` 新增 2 个 P0 集成测试：`access / assess / excess` 和 `breath / breathe`
  - 加 seed 前验证红灯：`eval:shape` 9 passed / 25 failed；retrieval test 24 passed / 2 failed，失败原因均为缺 seed grounding / comparisonView
- 完成 P0 seed 扩样本：
  - `data/exam-vocab/seed/entries.json` 新增 43 个词条
  - `data/exam-vocab/seed/confusion-groups.json` 新增 20 个 P0 confusion groups
  - 当前 seed 规模：82 entries / 31 confusion groups
  - 覆盖范围仍包含 gaokao / cet4 / cet6 / postgrad
- 修复扩样本后暴露的测试性能问题：
  - `corepack pnpm verify` 首次在 `src/features/content/seed-content.test.ts` 超时失败
  - 根因：该测试原本加载完整 seed 作为 broken fixture，P0 扩样本后执行时间超过 Vitest 默认 5s
  - 修复：改成最小 broken seed fixture，不再依赖完整 seed 数据量
  - 默认超时下该测试从 5s timeout 降到约 0.8s 通过
- 更新并勾选 P0 implementation plan 的已完成步骤。
- 结合真实 MiniMax smoke 和 DeepSeek 分享内容，整理下一阶段路线：
  - DeepSeek 的 `stitute` / `tempt` / `re- + con- 同根` 词根地图有参考价值，但太容易发散。
  - EngGo 应吸收“构词故事”和“不要硬凑规律”，同时收束成考试导向的结构化地图。
  - 明确新增混淆 taxonomy：形近解团、词根地图、中文同义分流、词性派生树、搭配锁、前缀方向图、发音近似、碎片召回、场景错配、逻辑关系。

## 当前结果
- 形近词簇 seed 从 39 entries / 11 groups 扩到 82 entries / 31 groups。
- 回答编排层现在有 3 种明确风格：
  - `standard_lookup`
  - `confusion_untangle`
  - `root_family_summary`
- `root_family_summary` 目前只做最小原型闭环：
  - `stitute 是什么` -> `root-stitute` resolved
  - `tempt 这一族怎么记` -> `root-tempt` resolved
  - `re+con 的词根有什么词` -> `root_family_summary` 命中，但仍返回 `no_match`
- P0 新增组：
  - `access / assess / excess`
  - `advice / advise`
  - `accept / except`
  - `aboard / abroad`
  - `angel / angle / ankle`
  - `assure / ensure / insure`
  - `complement / compliment`
  - `principal / principle`
  - `personal / personnel`
  - `economic / economical`
  - `conscious / conscience`
  - `precede / proceed`
  - `perspective / prospective`
  - `historic / historical`
  - `sensible / sensitive`
  - `considerable / considerate`
  - `stationary / stationery`
  - `device / devise`
  - `loose / lose`
  - `breath / breathe`
- 当前形近词簇闭环仍复用现有数据结构：query mode -> `confusion_group` -> retrieval result -> grounding/prompt -> UI 多主答案展示。
- 未新增表、未新增 `kind` 字段、未改变 UI 结构。
- 未新增 root Prisma schema / table；root family 仍是代码内 prototype，不是长期数据模型。

## 剩余关注点
1. `root_family_summary` 目前只覆盖 `stitute` / `tempt` 两族，仍然是验证回答形态的最小原型，不是可扩展数据方案。
2. `re+con`、`re...ct` 这类输入虽然已经进入 `root_family_summary` 主线，但仍是保守 `no_match`，没有真正展开检索。
3. `reqeust` / `recomand` 这类 typo 仍需要单独设计，不能简单放宽当前低置信度闸门。
4. 真实 MiniMax `/anthropic/v1/messages` 已通过临时命令跑通；正式接入前仍建议补 Anthropic-compatible provider adapter，并用真实 provider 做一次 answer-style smoke。
5. Windows + local Prisma Postgres (`prisma dev`) 仍不稳定；这轮 `verify` 过程中又复现了 backend protocol error，但已按 `bugs.md` 路径恢复。
6. `corepack pnpm exec tsc --noEmit` 这轮仍未重跑；此前已知失败，属于既有工程债，不纳入本轮完成标准。

## 下一 Session 第一件事
- 先读并确认：
  - [docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-24-enggo-answer-style-real-provider-smoke.md)
  - [docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-answer-style-and-root-map.md)
  - 该 plan 现在已经执行完成；下轮不要再从 Task 1 重开。
- 下一刀不要再二选一摇摆；先按新 plan 做真实 provider smoke：
  - 用真实 provider 做 8-10 条 answer-style smoke，检查 `confusion_untangle` / `root_family_summary` / guarded `no_match` 输出是否真的像 EngGo
  - 只有 smoke 结果稳定后，再决定是补 prompt guardrail、补 provider adapter，还是扩第二批 root prototype
- 若继续本地验证，先检查 `corepack pnpm exec prisma dev ls`；一旦出现 backend protocol error，直接按 `bugs.md` 的 `enggo` 重建路径恢复。
- 继续保持串行验证；不要并行跑 `verify`、`eval:shape`、`eval:answer-style`、`eval:answer-style:provider`。

## 当前阻塞 / 风险
- 当前没有 shape-neighbor 测试阻塞。
- 不建议本地并行跑 `verify` 和 `eval:shape` 这类会访问 Prisma dev 的命令。
- 真实模型 batch eval 仍受 provider key、dev server、MiniMax 429 影响。
- 2026-04-24 追加探测：用户提供的临时 MiniMax key 未写入仓库文件；直接探测 `https://api.minimaxi.com/v1/chat/completions` 与 `https://api.minimaxi.com/anthropic/v1/messages`，两把临时 key 均返回 `429 usage limit exceeded (2056)`；其中第一把对 `https://api.minimax.io/v1/chat/completions` 返回 `401`，说明 key 更像是 `api.minimaxi.com` 区域 key，但额度/限额不可用。本轮未继续跑 9 条真实 provider smoke，避免无效消耗限流窗口。
- 若下一轮继续扩 seed，`seed-content.test.ts` 已改为最小 fixture，应不再随 seed 规模线性变慢；若再次超时，先按 `bugs.md` 的 Prisma dev 健康检查路径排查。

## 最近验证基线
- `corepack pnpm exec prisma dev ls`
  - 当前状态：`enggo` running
- `corepack pnpm db:seed`
  - 当前状态：通过
- `corepack pnpm exec tsx scripts/check-seed-content.ts`
  - 当前状态：82 entries / 31 confusion groups
- `corepack pnpm eval:shape`
  - 当前状态：34 passed / 0 failed，平均耗时约 127ms
- `corepack pnpm eval:answer-style`
  - 当前状态：8 passed / 0 failed，平均耗时约 112ms
- `corepack pnpm test src/features/answering/build-system-prompt.test.ts`
  - 当前状态：3 passed / 3 passed
- `corepack pnpm test src/features/answering/chat-service.test.ts`
  - 当前状态：4 passed / 4 passed
- `corepack pnpm test src/features/retrieval/root-family-prototypes.test.ts`
  - 当前状态：4 passed / 4 passed
- `corepack pnpm test src/features/content/seed-content.test.ts`
  - 当前状态：1 passed / 1 passed
- `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`
  - 当前状态：32 passed / 32 passed
- `corepack pnpm exec eslint src/features/answering/build-grounding.ts src/features/answering/build-system-prompt.ts src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.ts src/features/answering/chat-service.test.ts src/features/retrieval/normalize-query.ts src/features/retrieval/retrieve-candidates.ts src/features/retrieval/retrieve-candidates.test.ts src/features/retrieval/root-family-prototypes.ts src/features/retrieval/root-family-prototypes.test.ts src/features/retrieval/types.ts scripts/run-answer-style-eval.ts scripts/run-shape-neighbor-eval.ts`
  - 当前状态：通过
- `corepack pnpm verify`
  - 当前状态：通过（lint、unit、integration、默认 Chromium E2E 均通过）
- `corepack pnpm exec tsc --noEmit`
  - 当前状态：本 session 未重跑；此前已知失败，集中在既有测试 fixture 类型收窄、`use-chat-session` 响应联合类型、`pg` ESM 声明缺失和其连带 row 隐式 any

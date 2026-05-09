# EngGo 滚动交接

## 当前阶段
EngGo 已完成聊天式 MVP、真实词库 smoke、易混词辨析、词根/碎片检索、聊天回答渲染层，以及 Answer Policy v1 的松绑 spike。

当前稳定产品原则：

> 范围优先，不范围专制。

RAG / 词库负责提供证据、命中状态和收藏入口；它不应该成为所有回答的许可闸门。明确低风险的英语学习问题可以走 `plain`，但不能伪装成 grounded 命中。

## 本 Session 文档整理
- 2026-05-03 整理核心文档职责：
  - `AGENTS.md`：保留协作入口、高频规则和当前焦点。
  - `context.md`：更新为长期项目地图，移除“尚无正式代码骨架”等过期信息。
  - `progress.md`：瘦身为当前状态、下一步、阻塞和验证基线，不再保留完整历史流水账。
  - `bugs.md`：整理为环境恢复路径、当前产品残留、已处理事项和不要重复走的失败路径。
  - `docs/README.md`：新增文档索引，说明 spec / plan / growth log 的阅读方式。
- 2026-05-03 面向 GitHub / HR 整理仓库首页：
  - `README.md` 已从开发启动说明改成项目展示型首页，包含项目亮点、本人完成工作、示例能力、技术栈、架构、数据说明、运行方式和验证基线。
  - `.gitignore` 新增 `.runlogs/` 与 `output/`，避免本地服务日志和 Playwright 截图误提交。
  - `docs/README.md` 补充 `README.md` 作为面向 GitHub 访问者和招聘方的入口。

## 当前已完成的主线
- 聊天主舞台：
  - Next.js chat workspace 已可提交问题、展示回答、显示 loading 进度和收藏入口。
  - assistant answer 已用受控 Markdown 子集渲染，支持段落、标题、加粗、code、列表和 Markdown 表格。
  - 宽召回的收藏动作默认折叠，移动端 390px smoke 未出现页面级横向溢出或原始 Markdown 表头泄露。
- 词库与检索：
  - `seed` 覆盖高考、四级、六级、考研。
  - `real-smoke` 当前约 546 entries / 34 confusion groups，只覆盖高考、四级、六级。
  - exact lookup、中文核心义召回、typo / fuzzy recall、shape-neighbor、expression recall、root / fragment recall 均已进入可验证状态。
- 回答风格：
  - `standard_lookup`：普通查词短答，避免主动扩未召回词、例句、范围尾巴和 Markdown 装饰。
  - `confusion_untangle`：四段辨析卡，信息满但不散，不再追求极限压短。
  - `root_family_summary`：用于碎片/家族召回，当前支持 `stitute` / `tempt` 原型和结构化词形过滤。
  - `plain`：用于 greeting、明确英语学习问题 fallback、spelling-assist 候选确认，不显示命中状态和收藏工具。
- Answer Policy v1 松绑 spike：
  - `你好` / `hi` 等 greeting 直接返回 `plain`，不走 retrieval/provider。
  - `complex 和 complicate 是一个意思吗`、`complex 是什么意思` 这类明确英语学习问题，在当前小词库未命中时可走 non-grounded provider fallback。
  - `reqxust 是什么意思` 这类疑似 typo no-match 已升级为 spelling-assist 候选确认，返回 `plain`，不带 grounding。
  - `re+con 的词根有什么词` 仍保守 no-match，不硬造词根家族。
- 2026-05-08 普通查词 exact lookup 污染验收：
  - 启动并复查本地 `enggo` Prisma dev；Next dev server 已用 `corepack pnpm dev --hostname 127.0.0.1 --port 3000` 跑通。
  - 首轮 `eval:standard-lookup:provider` 暴露 `effect` 带 `CET-4 范围内`，以及 provider 偶发 `例如`、Markdown 加粗、`没有需要区分` 等输出污染。
  - 已收紧 `standard_lookup` provider 输入：system prompt 不再直接暴露 `当前考试范围：CET-*`；发给 provider 的 standard lookup grounding 去掉 `activeExamTarget*`、`scopeCodes`、`reason`、`scopeReminder` 等范围元数据。
  - 已在 `chat-service` 的 `standard_lookup` 返回口做窄清理：移除 Markdown 装饰，并丢弃含范围提示、例句、下一步、无易混词说明的句子；只作用于普通查词。
  - 复跑 `corepack pnpm eval:standard-lookup:provider`：20 total / 20 pass / 0 fail。
  - 复跑 `corepack pnpm eval:product-smoke`：37 total / 37 pass / 0 fail。
- 2026-05-09 Scheme C source lemma fallback 第一版：
  - 新增文件级 source lemma loader，复用 `gaokao-2020-lemmas.txt` 和 `cet-2016-lemmas.tsv`；`cet4` sourceScope 同时计入 `cet4` 和 `cet6`，`cet6-extra` 只计入 `cet6`。
  - 普通英文查词在 structured entry miss 后，会用 exact source lemma membership 兜底；例如 `accent` 在 CET-4 下返回 resolved source-only candidate。
  - source-only 候选仍走 `standard_lookup`，不新增新的回答风格；provider grounding 只暴露窄字段和 `sourceKind`，不暴露 scope 元数据。
  - source-only 普通查词提示词已从“极短核心义”收紧为学生友好的微词典模板：核心义 + 简单理解；真实 provider smoke 中 `accent` 输出为“核心义是……；简单理解……”。
  - source-only 抽样 provider smoke 跑了 22 个未结构化词；首轮发现 `emphasis -> emphasize`、`frequency -> frequent`、`journal -> journey` 的检索优先级错误，已改为 exact source lemma 优先于 structured fuzzy neighbor，保留 structured exact 优先。
  - 第一版不做持久化 generated profile cache、不做 source-only 易混词、不做 source-only 词根族、不做向量语义召回。

## 下一步建议
普通查词现有 provider smoke 已清理到 21/21。词库扩容路线已从“继续人工 batch 4 结构化扩词”调整为 Scheme C：

1. 先用文件级 `source-lemmas` 做 source lemma membership，覆盖现有未结构化基础词。
2. structured entry miss 后，只对普通英文 exact 查词启用 source lemma fallback。
3. source-only 候选仍走 `standard_lookup`，不新增 answerStyle；候选标记 `sourceKind: "source_lemma"` 和 `matchType: "source_lemma_exact"`。
4. provider 只负责给已确认 lemma 生成短释义，不判断范围、不扩词、不生成易混组。
5. 下一步先扩到 10-20 条未结构化 source lemma 普通查词 smoke，再决定是否加 `generated_unreviewed` 缓存。

暂缓：
- 全量几千词一次性导入
- 为每个词人工写易混关系
- 继续扩 typo 闸门
- 把 embedding 作为主检索方案
- 把 `re+con` 这类语义词根理论问题混入词形 parser

## 当前阻塞 / 风险
- Windows + Prisma dev 不稳定；本地验证前先看 `bugs.md`。
- 不建议并行跑会访问本地 Prisma dev 的命令，例如 `verify`、`eval:shape`、`eval:answer-style`、`eval:lookalike:real-smoke`、`eval:answer-style:provider`。
- `postgrad` 缺 entry-level 可机读官方词表，暂不进入 `real-smoke` scope。
- MiniMax 临时 key 历史上出现 429；真实 provider smoke 优先用当前可用 provider，并小批量串行跑。
- `corepack pnpm exec tsc --noEmit` 仍是已知工程债，尚未纳入当前完成标准。

## 最近验证基线
- 2026-05-09 source-only exact 优先级修复后：
  - `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts src/features/answering/chat-service.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 3 files / 101 tests passed
  - focused eslint on retrieval source/test files
    - 通过
  - 22 条 source-only provider 抽样 smoke（临时复用 `runAnswerStyleProviderSmoke`）
    - 22 total / 22 pass / 0 fail；`emphasis`、`frequency`、`journal` 均回到 source lemma exact grounding
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail
- 2026-05-09 source-only 普通查词输出模板收紧后：
  - `corepack pnpm test src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 3 files / 47 tests passed
  - focused eslint on changed answering/provider-smoke files
    - 通过
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail；`accent` 输出包含“核心义”和“简单理解”
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail
- 2026-05-09 Scheme C source lemma fallback 后：
  - `corepack pnpm test src/features/content/source-lemma-sources.test.ts scripts/check-vocab-content.test.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/chat-service.test.ts src/features/answering/chat-provider.test.ts src/features/answering/build-system-prompt.test.ts scripts/lib/answer-style-provider-smoke.test.ts scripts/lib/black-box-product-smoke.test.ts`
    - 8 files / 125 tests passed
  - focused eslint on changed source/retrieval/answering/smoke files
    - 通过
  - `corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas`
    - 546 entries / 34 confusion groups / scopes=gaokao, cet4, cet6
  - `corepack pnpm eval:product-smoke`
    - 38 total / 38 pass / 0 fail（新增 source lemma `accent` case）
  - `corepack pnpm eval:standard-lookup:provider`
    - 21 total / 21 pass / 0 fail（新增 source lemma `accent` case）
- 2026-05-08 普通查词 exact lookup 污染验收后：
  - `corepack pnpm test src/features/answering/chat-provider.test.ts src/features/answering/build-system-prompt.test.ts src/features/answering/chat-service.test.ts`
    - 3 files / 26 tests passed
  - focused eslint on changed answering files
    - 通过
  - `corepack pnpm eval:standard-lookup:provider`
    - 20 total / 20 pass / 0 fail
  - `corepack pnpm eval:product-smoke`
    - 37 total / 37 pass / 0 fail
- 2026-05-03 Answer Policy / spelling-assist / UI smoke 后：
  - `corepack pnpm test src/features/answering/chat-service.test.ts`
    - 1 file / 12 tests passed
  - `corepack pnpm test src/features/answering/chat-service.test.ts src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx`
    - 3 files / 23 tests passed
  - focused eslint
    - 通过
  - `corepack pnpm eval:product-smoke`
    - 37 total / 37 pass / 0 fail
  - API smoke：
    - `你好` -> `plain` / no grounding / no provider
    - `complex 和 complicate 是一个意思吗` -> `plain` / no grounding / provider called
    - `reqxust 是什么意思` -> `plain` / no grounding / provider called / spelling candidates
    - `tion 结尾的词有哪些` -> grounded resolved / 15 main answers
    - `access assess excess 怎么区分` -> grounded resolved / 3 main answers
    - `re+con 的词根有什么词` -> grounded no_match / no provider
  - 移动宽度 UI smoke：
    - 390px，无页面级横向溢出
    - plain 分支不显示 `命中状态`、`暂未稳定命中`、收藏工具
    - grounded 分支保留命中状态和收藏工具
- 2026-04-27 root fragment condition parser 后：
  - `corepack pnpm test src/features/retrieval/root-fragment-recall.test.ts src/features/retrieval/retrieve-candidates.test.ts src/features/answering/build-system-prompt.test.ts scripts/lib/black-box-product-smoke.test.ts scripts/lib/answer-style-provider-smoke.test.ts`
    - 5 files / 107 tests passed
  - `corepack pnpm eval:answer-style`
    - 20 pass / 0 fail
  - `corepack pnpm eval:answer-style:provider`
    - 16 total / 15 pass / 1 manual / 0 fail
- 2026-04-26 real-smoke batch 3 后：
  - `corepack pnpm exec tsx scripts/check-vocab-content.ts --dataset real-smoke --min-entries 500 --require-source-lemmas`
    - 546 entries / 34 confusion groups / scopes=gaokao, cet4, cet6
  - `corepack pnpm eval:lookalike:real-smoke`
    - 14 pass / 0 fail
- 历史整体验证：
  - `corepack pnpm verify`
    - 曾通过 lint、unit、integration、默认 Chromium E2E
  - `corepack pnpm exec tsc --noEmit`
    - 已知未清，集中在测试 fixture 类型、`use-chat-session` 响应联合类型、`pg` ESM 声明缺失及其连带 row 隐式 any

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

## 下一步建议
优先做一轮普通查词 exact lookup 污染验收。

原因：前几轮已经连续调整 answer policy、spelling-assist 和 UI plain branch，下一步最需要确认普通查词没有被 retrieval 或 prompt 又带回不该出现的裸 `confusion_group`、范围话术、主动扩词或可见 Markdown。

建议顺序：
1. 检查本地 Prisma dev 健康：
   - `corepack pnpm exec prisma dev ls`
2. 跑现有普通查词 provider smoke：
   - `corepack pnpm eval:standard-lookup:provider`
3. 如果现有 8 条全绿，再补 6-10 个普通查词 case，重点覆盖：
   - exact 命中但附近存在易混组的词，例如 `institute`
   - 普通高频词，例如 `available`、`evidence`、`significant`
   - 不应出现 `CET` / 当前范围尾巴 / 主动扩未召回同义词 / Markdown 加粗
4. 根据结果再决定：
   - 若普通查词仍干净，再考虑 `real-smoke` batch 4 扩到 700+
   - 若出现污染，优先修 retrieval ordinary lookup 边界，不用 prompt 兜

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

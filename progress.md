# EngGo 滚动交接

## 当前阶段
已完成 Task 1 至 Task 7，并已激活 fuzzy retrieval follow-up plan。当前完成 Step 1“形近词簇失败测试锁定”，停在 Step 2 入口。

## 本 Session 已完成
- 激活 [docs/superpowers/plans/2026-04-23-enggo-fuzzy-retrieval-followup.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-fuzzy-retrieval-followup.md)，并将 Step 1 勾选完成：
  - 当前工作树里已存在 `src/features/retrieval/retrieve-candidates.test.ts` 的 shape-neighbor 失败测试草稿
  - 本 session 复跑并确认其失败形态已收敛到真实产品缺口，而不是环境噪音
- 先按文档要求做了环境健康检查并恢复本地库：
  - 用原生 `pg` 直连 `DATABASE_URL`，确认最初是 `ECONNREFUSED`，原因是 `default` 的 `prisma dev` 实例未运行
  - `corepack pnpm exec prisma dev ls` 在本机命中 `%TEMP%\\@prisma\\cli-dev@latest-*` 的 `EPERM`
  - 改用 `node_modules\.bin\prisma.CMD dev rm default --force` + `node_modules\.bin\prisma.CMD dev -n default -d -p 51213 -P 51214 --shadow-db-port 51215` 重建实例后，`SELECT 1` 恢复通过
- 重建库后重新建立测试基线：
  - `corepack pnpm db:migrate` 通过
  - `corepack pnpm db:seed` 首次报 `Received unexpected commandComplete message from backend`，确认 `vocabulary_entry/confusion_group` 计数仍为 `0 / 0` 后重试一次成功
- 复核 Playwright 安装状态：
  - `corepack pnpm exec playwright install --dry-run chromium` 显示 `chromium` 与 `chromium_headless_shell` install location 已存在
  - 因此上个 session 里“缺少 bundled Chromium 二进制”的结论不再适用于本 session
- 执行 `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`，拿到新的 Step 1 失败基线：
  - 总结果：`17 passed / 7 failed`
  - 失败 1~2：`detectQueryMode("跟 recent 很像的词有哪些")`、`detectQueryMode("容易把 recent 看错成什么")` 仍返回 `fuzzy_recall`，没有进入 `shape_neighbor_search`
  - 失败 3~4：`跟 recent 很像的词有哪些`、`容易把 recent 看错成什么` 仍按旧模式处理，无法返回词簇
  - 失败 5~7：`recent/resent`、`adapt/adopt`、`quiet/quite` 三组形近词比较仍返回 `no_match`
- 明确了用户对下一阶段产品方向的纠偏：
  - 用户要的核心不是“标准查词 + 标准答案”，而是真正的模糊搜索
  - 代表性目标例子：
    - `re+con 的词根有什么词`
    - `resent 和 recent 那么像的词要例举出来并且区分`
    - `跟 recent 很像的词有哪些`
  - 这意味着当前版本虽然在“少乱猜、对比更稳”上有进步，但还没有真正打到用户想要的核心价值
- 对照 spec 与当前实现后确认：
  - spec 已要求 retrieval 支持 `misspellings`、`root or fragment input`、`natural-language descriptions of half-remembered words`
  - 当前实现主要还是 `meaning_lookup / direct_lookup / fuzzy_recall / direct_compare`
  - 当前 fuzzy retrieval 本质上仍是“单个英文词的稳定候选选择”，不是“形近词簇 / 碎片 / 词根”的模糊联想检索
  - `fuzzy_recall` 现在只接受单个英文 token；像 `re+con` 这种多片段输入会直接落到 `low_confidence/no_match`
- 为下一个 session 新增一份候选 follow-up plan：
  - [docs/superpowers/plans/2026-04-23-enggo-fuzzy-retrieval-followup.md](/C:/Users/Chen/Desktop/EngGo/docs/superpowers/plans/2026-04-23-enggo-fuzzy-retrieval-followup.md)
  - 核心结论：不要先盲目扩词库，先做“形近词簇检索 + 区分”，再评估扩库压测
- 复核当前活跃 implementation plan：`docs/superpowers/plans/2026-04-21-enggo-chat-mvp.md` 的 Task 1 ~ Task 7 已全部勾选完成，当前没有 plan 内遗留的未勾选 step。
- 执行 `corepack pnpm verify` 复核当前版本验证状态：
  - `lint` 通过
  - `test:unit` 通过：`7 files / 17 tests passed`
  - `test:integration` 通过：`2 files / 18 tests passed`
  - `test:e2e` 未通过：3 条 Playwright 用例均因本机缺少 Chromium 可执行文件而在启动阶段失败，不是业务断言失败
- 追加核查 Playwright 浏览器安装问题：
  - Playwright 官方 CDN 可访问，当前版本 `chrome-win64.zip` / `chrome-headless-shell-win64.zip` 的 HEAD 请求均返回 `200`
  - 常见国内镜像 `https://npmmirror.com/mirrors/playwright` 对当前 `cft` 路径返回 `404`，单纯切镜像不能解决本轮问题
  - 直接用 Playwright 拉起本机已安装的 `msedge` 成功，因此改用临时 Edge 配置复跑 E2E
- 执行 `corepack pnpm exec playwright test --config playwright.msedge.config.ts`：
  - `tests/e2e/app-shell.spec.ts` 通过
  - `tests/e2e/chat-mvp.spec.ts` 通过
  - `tests/e2e/collection-flow.spec.ts` 通过
  - 结果：`3 passed`
- 落地“Retrieval 闸门收紧与硬空结果保护”首轮实现，覆盖：
  - `NormalizedQuery.compareTerms` 从二元组改为 `string[]`
  - 新增 `groupSeedTerm`
  - 新增 `resolution: "resolved" | "no_match"` 与 `noMatchReason`
  - compare / group compare / direct lookup / fuzzy recall 统一走“两段式”检索：先选 `mainAnswer`，再决定是否扩 `confusionBoundary`
- `normalize-query.ts` 已支持：
  - 多词 compare：`a 和 b 的区别`、`a、b、c 怎么区分`、`a b c 的区别`
  - group compare：`respect 那组词怎么分`
  - “哪个”句式 compare：`affect 和 effect 哪个是动词`
- `retrieve-candidates.ts` 已按 plan 收紧：
  - 英文 fuzzy 阈值固定为 `direct_lookup: 0.62 / 0.08`、`fuzzy_recall: 0.68 / 0.12`
  - compare 命中不足 2 个时直接 `no_match`
  - `confusionBoundary` 只从单个显式 `confusionGroup` 扩，不再全局 top-N 拼接
  - 库外 meaning / fuzzy / compare 都会硬空结果，不再硬猜
- `build-grounding.ts`、`chat-service.ts`、`/api/chat` 已完成 no-match 闭环：
  - `buildGrounding` 不再自己从候选里切 top-N
  - `createChatService` 在 `no_match` 时直接返回固定中文兜底，不调用 LLM
  - `/api/chat` 对 no-match 维持 HTTP 200
- `message-thread.tsx` 已补空结果展示：
  - no-match 时不渲染空白主答案区块
  - `AnswerActions` 继续在 `mainAnswer.length === 0` 时隐藏
- 为绕开本地 Windows + Prisma dev 的已知不稳定点，中文释义检索改成“原生 `pg` 查 meaning entryId + Prisma 按 id 回表”，不再走那条会打挂连接的 Prisma relation-filter 查询。
- `src/lib/db.ts` 已把非生产环境 Prisma pg adapter 连接池收紧为 `max=1`，并启用 `allowExitOnIdle`，用于降低本地顺序联调时的连接崩坏概率。
- `scripts/run-chat-batch-eval.ts` 已补两项韧性：
  - 不再把缺少 `grounding` 的错误响应直接算成脚本崩溃
  - 对 429 增加退避重试

## 当前结果
- 产品方向判断：
  - 这轮代码已经把“不要乱猜”做得比第一版明显更稳
  - 但从用户刚补充的目标看，当前版本仍更像“收紧后的考试词问答器”，还不是“真正的模糊搜索器”
  - 下一阶段最值得优先验证的不是继续抛光旧例子，而是能否真正处理 `recent/resent` 这类形近词簇问题
- 当前验证状态（本 session 最新复核）：
  - retrieval follow-up 的最新基线是 `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts` -> `17 passed / 7 failed`
  - 这 7 个失败全部聚焦 shape-neighbor 能力缺口，不再掺杂空库/缺表问题
  - 旧的“`retrieve-candidates.test.ts` 全绿 / 29 passed”结论已过时，因为同文件现在已纳入 Step 1 的失败测试
- Playwright 环境状态：
  - `corepack pnpm exec playwright install --dry-run chromium` 已显示 bundled Chromium 安装位存在
  - 默认 `corepack pnpm test:e2e` 是否恢复，本 session 未复跑；旧的“因为缺少 `chromium_headless_shell` 无法启动”需要视作历史结论
- 定向 lint 已通过：
  - `corepack pnpm exec eslint src/features/retrieval src/features/answering src/app/api/chat/route.ts src/components/chat/message-thread.tsx src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/lib/db.ts`
- 本地真实 `/api/chat` 已手工确认通过的代表性 case：
  - `遵从怎么说` -> `comply` + `conform/defer`
  - `restrain 和 constrain 的区别` -> compare resolved
  - `comply、conform、defer 怎么区分` -> 三词 compare resolved
  - `respect、respective、respectful、respectable 怎么区分` -> 四词 compare resolved
  - `recent 这个词什么意思` -> `no_match`
- 当前全量 27 条 batch eval 仍未拿到稳定最终结论：
  - 产品逻辑层面，库外 no-match 与多词 compare 已明显稳定
  - `scripts/run-chat-batch-eval.ts` 已补 429 退避重试与错误响应保护
  - 但长时间连续调用 MiniMax 兼容接口时仍会触发 429，导致 full batch 可能被外部限流拖慢或超时

## 剩余关注点
1. 当前严格阈值下，`reqeust` / `recomand` 这类常见拼错仍会走 `no_match`。这符合本轮“宁可空结果也不硬猜”的方向，但如果产品要支持这类 typo，需要单独设计更保守的 typo 策略。
2. 若下个 session 要继续跑全量 batch eval，先确认 MiniMax 限流窗口恢复；必要时拆小批次跑，不要连续轰 27 条。
3. 本地继续开发前，仍要先做 `prisma dev` 健康检查；一旦出现 `Connection terminated unexpectedly` / `ECONNRESET`，先重建实例再验证。
4. 默认 `pnpm test:e2e` / `pnpm verify` 是否已恢复，本 session 未复跑；至少 `corepack pnpm exec playwright install --dry-run chromium` 已显示 bundled Chromium 安装位存在，因此旧的“缺少浏览器二进制”结论需要作废。
5. 当前最核心的产品缺口不是词库数量，而是 retrieval 还没有支持用户真正想要的两类问法：
  - 形近词簇检索：`recent / resent` 这种“列举并区分”
  - 词根 / 碎片检索：`re+con` 这种 fragment 输入
6. 在这两类模糊检索模式没做出来前，直接大规模扩库更可能放大误召回和 `no_match`，不建议作为下一刀。

## 下一 Session 第一件事
- 先从 `src/features/retrieval/retrieve-candidates.test.ts` 已锁定的 7 个 failing tests 开始，不要并行推进扩库、batch eval 或 fragment retrieval。
- 执行 follow-up plan 的 Step 2：
  - 明确 `shape_neighbor_search` 的触发条件
  - 定义它与 `direct_compare` / `fuzzy_recall` 的边界
  - 决定是否继续复用 `mainAnswer/confusionBoundary/comparisonView`，还是新增专用返回结构
- 执行 follow-up plan 的 Step 3：
  - 先补 `recent/resent`、`adapt/adopt`、`quiet/quite` 的最小数据表达
  - 再决定 `affect/effect` 是否纳入同一批 shape-neighbor seed
- 如果本地 `prisma dev` 再掉线，优先按 `bugs.md` 里记录的仓库内 Prisma 二进制恢复路径重建，再重跑 `db:migrate` / `db:seed`

## 当前阻塞 / 风险
- follow-up plan 已进入 Step 2 入口，但当前仍被 `retrieve-candidates.test.ts` 的 7 个 shape-neighbor failing tests 卡住；在它们转绿前不应进入下一条产品 task。
- Windows + local Prisma Postgres (`prisma dev`) 仍然不是稳定环境；虽然当前代码已经避开最容易打挂的查询，并把连接池收紧到 1，但根因不在本轮范围内。
- MiniMax 兼容接口在长时间批量联调下会返回 429；这会影响全量 eval 的稳定性，但不代表检索/grounding 逻辑回退。

## 最近验证基线
- `node_modules\.bin\prisma.CMD dev rm default --force`
- `node_modules\.bin\prisma.CMD dev -n default -d -p 51213 -P 51214 --shadow-db-port 51215`
- `corepack pnpm db:migrate`
- `corepack pnpm db:seed`
- `corepack pnpm exec playwright install --dry-run chromium`
- `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`
  - 当前状态：`17 passed / 7 failed`，失败点全部集中在 Step 1 新锁定的 shape-neighbor case
- `corepack pnpm exec tsx scripts/run-chat-batch-eval.ts`
  - 当前状态：脚本已能正确处理 429 与错误响应，但 full batch 仍受 provider 限流影响，未拿到稳定终局分数
- `corepack pnpm exec eslint src/features/retrieval src/features/answering src/app/api/chat/route.ts src/components/chat/message-thread.tsx src/components/chat/chat-workspace.test.tsx src/components/chat/answer-actions.test.tsx src/lib/db.ts`
- 手工请求 `/api/chat` 验证上述代表性 resolved / no-match case

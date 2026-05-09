# EngGo 已知问题与环境坑

## 环境恢复路径

### Windows + Prisma dev 不稳定
本地 Windows + `Prisma 7.7.0 + local Prisma Postgres (prisma dev)` 仍不稳定。

常见症状：
- `prisma migrate dev` / `prisma migrate resolve` 报 `P1017`
- `unexpected message from server`
- `prepared statement already exists`
- `Connection terminated unexpectedly`
- `read ECONNRESET`
- `prisma dev ls` 显示 `running`，但实际 TCP 连接不健康
- `corepack pnpm exec prisma dev ...` 报 `%TEMP%\\@prisma\\cli-dev@latest-*` 的 `EPERM, Permission denied`

优先恢复路径：
1. 先检查：
   - `corepack pnpm exec prisma dev ls`
2. 如果 `corepack pnpm exec prisma dev ...` 命中 `EPERM`，改用仓库内 Prisma 二进制：
   - `node_modules\\.bin\\prisma.CMD dev ls`
3. 当前 `.env` 指向的实例名是 `enggo`。如需重建：
   - `node_modules\\.bin\\prisma.CMD dev rm enggo --force`
   - `node_modules\\.bin\\prisma.CMD dev -n enggo -d -p 51213 -P 51214 --shadow-db-port 51215`
4. 恢复后串行执行：
   - `corepack pnpm db:migrate`
   - `corepack pnpm db:seed`
   - 或按任务需要执行 `corepack pnpm db:seed:real-smoke`

注意：
- 不要在 Prisma dev 不健康时继续跑 retrieval / API / product smoke。
- 不要并行跑会访问本地库的命令，例如 `verify` 与 `eval:shape`。
- 如果 `corepack pnpm db:seed` 首次报 `Received unexpected commandComplete message from backend`，先确认表计数仍是 `0 / 0`，再重试一次。

### Codex sandbox + pnpm junction
非 escalated shell 里，pnpm junction 依赖可能被映射到 sandbox 路径，导致 `@prisma/debug` 明明存在却报：
- `MODULE_NOT_FOUND`
- `EPERM package.json access denied`

遇到时不要先删 `node_modules`。先在真实工作区权限下复查：
- `node -e "require.resolve('@prisma/debug')"`
- `node_modules\\.bin\\prisma.CMD dev ls`

### 中文 smoke 编码
Windows PowerShell 直接用 `Invoke-RestMethod` / `Invoke-WebRequest` 发中文 JSON 到本地 `/api/chat` 时可能乱码，导致 query mode 误判。

优先用：
- Node `fetch`
- 现有 TypeScript runner

如果必须用 PowerShell inline JS，先设置：
- `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`
- `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)`

### Provider 限流与超时
- MiniMax 临时 key 历史上出现 `429 usage limit exceeded (2056)`，不要把 429 误判成 retrieval 回归。
- DeepSeek flash 真实 provider smoke 已能跑通，但部分回答会超过 15s。
- `scripts/run-answer-style-provider-smoke.ts` 当前默认 timeout 已提高到 45s，并支持 `ENGGO_PROVIDER_SMOKE_TIMEOUT_MS` 覆盖。
- 真实 provider smoke 尽量小批量串行跑。

## 当前产品侧残留
- 普通查词 exact lookup 现有 20 条 provider smoke 已通过；后续新增词库或改 prompt 时仍需小批防回归，重点防止：
  - exact 命中自动带出裸 `confusion_group`
  - 回答出现 `CET` / 当前范围尾巴
  - 主动扩出未召回同义词
  - Markdown 加粗、`例如` 或“没有需要区分”等模板痕迹
- Scheme C source lemma fallback 第一版只覆盖普通 exact 查词：
  - source-only candidate 没有人工结构化 `meaningsZh`、例句、搭配或易混关系，provider 只能生成短释义。
  - 不要把 source-only fallback 用到易混词辨析、词根家族、表达召回或向量语义召回。
  - 当前没有 `generated_unreviewed` 持久化缓存，真实 provider 首次查未结构化词仍会有延迟、成本和输出波动。
  - `postgrad` 仍无 entry-level 机器可读 source lemma，不要顺手扩到 postgrad。
- `root_family_summary` 当前仍是最小原型：
  - `stitute` / `tempt` 两族可用
  - 结构化词形过滤可用
  - 泛化语义词根理论仍未定义
- `re+con 的词根有什么词` 仍应保持保守 no-match；如果要支持，先写产品定义，不要在 parser 里加特例。
- `postgrad` 缺 entry-level 可机读官方词表，不要为了 scope 完整性补伪造条目。
- `corepack pnpm exec tsc --noEmit` 仍是已知工程债，主要集中在：
  - 测试 fixture 的 `activeExamTarget` / `examScopes` 被推宽为 `string`
  - `src/features/chat/use-chat-session.ts` 的 API 成功/错误响应联合类型需要收窄
  - `pg` ESM 入口声明缺失
  - `retrieve-candidates.ts` 的 `row` 隐式 any 是 `pg` 声明缺失的连带症状

## 已处理但要防回归
- `retrieveCandidates -> buildGrounding -> chatService` 的 no-match 闭环已落地，库外 meaning / fuzzy / compare 不再硬猜。
- 多词 compare、group compare、`哪个` 句式 compare 已支持。
- no-match UI 已避免空白主答案卡片。
- assistant answer 已改用 `AnswerContent` 渲染，不再把 Markdown 表格和 `###` 原样展示给用户。
- 宽召回收藏工具超过 5 个默认折叠。
- `standard_lookup` 已压住例句、范围尾巴、主动扩词、可见标签和 Markdown 加粗。
- `standard_lookup` provider 输入已做普通查词专属收紧：不再向模型暴露 `activeExamTargetLabel`、`scopeCodes`、`reason`、`scopeReminder` 等范围元数据；返回口也会窄清理 Markdown、例句、范围提示、下一步和“没有需要区分”等污染句。
- `institute 是什么意思` 当前 grounding 只有 `institute`，不再带出 `institution`。
- source-only exact lookup 曾被 structured fuzzy neighbor 抢走，例如 `emphasis -> emphasize`、`frequency -> frequent`、`journal -> journey`；已改为 exact source lemma 优先于 structured fuzzy，structured exact 仍优先于 source-only。
- 单编辑 typo 已处理：
  - `generte -> generate`
  - `horizen -> horizon`
  - `genuin -> genuine`
- 第二层 typo 窄门已处理：
  - `reqeust -> request`
  - `recomand -> recommend`
- `reqxust 是什么意思` 已从保守 no-match 升级为 spelling-assist 候选确认，但仍不带 grounding。
- `stationary/stationery` 的牵强字母口诀已移除；后续新增 confusion groups 不要写 `e -> envelope` 这类绕一层的助记。
- `tempt` 作为 root family 片段时，必须承认它也是完整单词，不能只说成构词部件。
- `confusion_untangle` 已从过度压缩回调到四段辨析卡；后续不要把“更短”当成唯一胜利标准。

## 不要重复走的失败路径
- 不要在 Prisma dev 不健康时继续跑验证。
- 不要把 no-match 闸门放宽成“弱相关也先答一个像样答案”。
- 不要因为 provider 429 / timeout 就回退检索逻辑。
- 不要用 prompt 兜 retrieval 边界污染；如果 ordinary lookup 又带出裸组，优先修 retrieval。
- 不要一次性导入几千词。
- 不要抠商业词书完整释义、例句、辨析、助记和章节结构。
- 不要为 `postgrad` 编造 `real-smoke` scope。
- 不要把 embedding 当成形近词和考试范围过滤主干。

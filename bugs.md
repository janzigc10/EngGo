# EngGo 已知问题与环境坑

## 2026-05-10 FastAPI 迁移新增环境坑

### Prisma dev 直连端口的 psycopg 瞬态连接失败
FastAPI 通过 `psycopg` 复用现有 Prisma Postgres 时，长 smoke 中确认过偶发连接建立失败：
- `expected authentication request from server, but received T`
- `server closed the connection unexpectedly`
- `could not receive data from server: Software caused connection abort`

当前处理：`StructuredLookupRepository` 只在 `psycopg.connect()` 建立连接阶段重试，最终失败仍抛错；不要把查询 SQL 错误吞掉。

### Provider timeout 不能冒泡成 FastAPI 500
真实 provider smoke 中确认过 `httpx.ReadTimeout` 会在 Python provider 层出现。当前处理：`OpenAiChatProvider` 将 timeout 映射为 `ChatProviderError(status_code=504)`，其他 `httpx.HTTPError` 映射为 502，由 `/api/chat` 统一返回 `chat_generation_failed` error contract。

### Next 默认 FastAPI smoke 启动方式
Next `/api/chat` 已默认代理 `http://127.0.0.1:8000/api/chat`，因此 smoke 前必须先启动 FastAPI。只有需要改后端地址时，才临时设置 `.env.local` / 环境变量：
```text
ENGGO_BACKEND_URL=http://127.0.0.1:8000
```

优先入口：
- `corepack pnpm dev:fastapi`：先启动 FastAPI，再启动 Next。
- `corepack pnpm eval:default-fastapi-smoke`：验证默认 Next `/api/chat` 已穿到 FastAPI。

Node 在 Windows 上不能直接 `spawn()` `corepack.cmd`。当前 `dev:fastapi` 与默认 smoke 聚合器都通过 `cmd.exe /d /s /c corepack ...` 包装 Corepack；不要退回 `shell: true`，否则 Node 24 会给出弃用/安全警告。

完整 `eval:default-fastapi-smoke` 包含 provider-backed cases，本轮成功运行耗时约 209 秒；如果只给 180 秒左右可能会在请求仍持续返回 200 时被外部超时杀掉。判断失败前先看 Next/FastAPI 日志和最终 summary。

Windows 上 `Start-Process corepack pnpm dev ...` 可能留下假启动或 `EADDRINUSE` 日志。可靠方式是：
1. 用 `Start-Job` 启动 Next dev。
2. 验证日志包含 `Ready`；如果用了 `.env.local`，还要确认日志包含 `Environments: .env.local, .env`。
3. 结束时按 `Get-NetTCPConnection -LocalPort 3000` 的 `OwningProcess` 清理，而不是只停 wrapper 进程。

### 后端 pytest 的 Windows Temp 权限
本轮确认过 `C:\Users\Chen\AppData\Local\Temp\pytest-of-Chen` 和仓库 `.pytest_cache` 可能触发 `WinError 5`，导致 `tmp_path` fixture setup 失败；这不是后端业务测试失败。

恢复方式：
```powershell
New-Item -ItemType Directory -Force -Path 'C:\tmp\enggo-pytest-tmp','C:\tmp\enggo-pytest-cache' | Out-Null
$env:TMP = 'C:\tmp\enggo-pytest-tmp'
$env:TEMP = 'C:\tmp\enggo-pytest-tmp'
& 'C:\Users\Chen\anaconda3\python.exe' -m pytest -q backend/tests -o cache_dir='C:\tmp\enggo-pytest-cache'
```

### Vitest integration 会改变本地 DB 基线
`corepack pnpm test` / retrieval integration test 跑完后，本地 Prisma DB 可能只剩小 fixture。跑 FastAPI direct/proxy product smoke 前必须重新执行：
- `corepack pnpm db:seed:real-smoke`

### Next build tracing warning
`corepack pnpm run build` 已通过。默认 FastAPI 切流后，Next `/api/chat` 不再 import legacy TypeScript retrieval/service，之前经 `/api/chat` 触发的 `source-lemma-sources.ts` import trace 风险应被收窄；如后续 build 仍出现 Turbopack/NFT tracing warning，再按实际 import trace 处理。

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
- 本机其它程序占用 Prisma dev 固定端口，例如 WeGame 使用本地 `51219` 外连时，`node_modules\\.bin\\prisma.CMD dev ...` 会报 `listen EACCES: permission denied 127.0.0.1:51219`；即使改 `-p/-P/--shadow-db-port` 也绕不过 CLI 自身端口。当前 Codex 无权限停止该 WeGame 进程，需要用户手动关闭后再启动 Prisma dev。

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
- 2026-05-16 又确认过 `@prisma/engines/package.json` 在非 escalated shell 中会触发 `EPERM`，进而影响 `corepack pnpm db:migrate`；需要在真实工作区权限下重跑 Prisma 相关命令。

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

### FastAPI / psycopg 读取现有 Prisma 环境
FastAPI Stage 2 复用现有 `.env` 和 Prisma Postgres 时确认过两个兼容坑：

- `.env` 文件带 UTF-8 BOM；Python 侧读取必须用 `utf-8-sig`，否则 `DATABASE_URL` 可能不会被识别。
- Prisma 的 `DATABASE_URL` 可能带 `schema`、`connection_limit`、`pool_timeout`、`max_idle_connection_lifetime` 等 query 参数，`psycopg` 不接受；Python repository 连接前要剥离 Prisma-only 参数，只保留 libpq 支持的参数。
- 本机 Prisma Postgres 当前只监听 `127.0.0.1:51214`，而 `.env` 使用 `localhost`；Python 侧连接前规范到 `127.0.0.1`，避免 IPv6/localhost 解析导致连接卡住。

### FastAPI proxy smoke 与 Next dev 环境变量
历史上在 Codex PowerShell `Start-Job` 里临时设置 `$env:ENGGO_BACKEND_URL` 后启动 `corepack pnpm dev`，Next 16 dev route worker 可能仍读不到该进程环境变量。当前 Next `/api/chat` 已默认走 FastAPI，所以不再依赖该变量切流；只有覆盖地址时才需要它。

如果需要覆盖地址，可靠验证方式是临时创建被 `.gitignore` 忽略的 `.env.local`：

```text
ENGGO_BACKEND_URL=http://127.0.0.1:8000
```

启动 Next 后日志应显示 `Environments: .env.local, .env`；跑完 proxy smoke 后删除 `.env.local`。确认方法：FastAPI migrated smoke 里 `re+con 的词根有什么词` 必须按 FastAPI 当前行为返回预期结果；如果结果像旧 TypeScript route，先检查 Next 进程和地址覆盖。

### Provider 限流与超时
- MiniMax 临时 key 历史上出现 `429 usage limit exceeded (2056)`，不要把 429 误判成 retrieval 回归。
- DeepSeek flash 真实 provider smoke 已能跑通，但部分回答会超过 15s。
- `scripts/run-answer-style-provider-smoke.ts` 当前默认 timeout 已提高到 45s，并支持 `ENGGO_PROVIDER_SMOKE_TIMEOUT_MS` 覆盖。
- 真实 provider smoke 尽量小批量串行跑。

## 当前产品侧残留
- 2026-05-16 全流程复测新增：
  - 短语普通查词加中文查询后缀时会掉出 deterministic ordinary lookup。复现：裸 `make up` -> `external_dictionary_exact` / no provider；`make up 是什么意思` -> `plain` + provider，带加粗和例句。裸 `according to` -> `source_lemma_exact` / no provider；`according to 是什么意思` -> `plain` + provider，并出现“当前无词库绑定”。根因待查，优先看普通查询归一化是否没有把英文短语 + `是什么意思/什么意思` 剥回 phrase lookup。
- 普通查词 exact lookup 现有 21 条 provider smoke 已通过；后续新增词库或改 prompt 时仍需小批防回归，重点防止：
  - exact 命中自动带出裸 `confusion_group`
  - 回答出现 `CET` / 当前范围尾巴
  - 主动扩出未召回同义词
  - Markdown 加粗、`例如` 或“没有需要区分”等模板痕迹
- Scheme C source lemma fallback 第一版只覆盖普通 exact 查词：
  - source-only candidate 没有人工结构化 `meaningsZh`、例句、搭配或易混关系；ECDICT 可用时走模板，缺失或不可用时才由 provider 生成短释义。
  - 不要把 source-only fallback 用到易混词辨析、词根家族、表达召回或向量语义召回。
  - 当前没有 `generated_unreviewed` 持久化缓存，真实 provider 首次查未结构化词仍会有延迟、成本和输出波动。
  - `postgrad` 仍无 entry-level 机器可读 source lemma，不要顺手扩到 postgrad。
- ECDICT 基础释义源已接入普通查词主链路的窄入口：
  - 在 `standard_lookup + source_lemma_exact` 命中可用 profile 时模板回答，并跳过 provider。
  - direct spaced phrase 如果 structured/source lemma 都未命中，但 ECDICT 有 exact phrase profile，可走 `external_dictionary_exact` 基础释义；不要扩展成 fuzzy phrase 或无限制语义召回。
  - 它适合做普通查词基础释义源，但不要直接升级为 EngGo 的高可信 structured entry。
  - 主链路中必须保留 `external_dictionary_basic` / unreviewed 语义，不要让它产生易混组、词根族或考试优先级判断。
  - `accordingto`、`oughtto`、`owingto` 已作为 explicit spaced phrase alias 处理；其他 source lemma 脏词或拼写错误，例如 `instalation`，后续扩展 alias 或清洗时必须继续过滤或单独处理。
  - ECDICT 中仍有少量 domain-only 释义，例如 `[计]`、`[医]`、`[化]`；普通查词展示前必须经过清洗和抽检。
- `root_family_summary` 当前仍是最小原型：
  - `stitute` / `tempt` 两族可用
  - 结构化词形过滤可用
  - 泛化语义词根理论仍未定义
- `re+con 的词根有什么词` 当前按 broad fragment / related prefix 支持，但不要说成稳定词根家族；后续如继续扩展，先写产品定义，不要在 parser 里加硬特例。
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
- exact direct compare 已改为确定性短模板，不再在 grounding 足够时调用 provider 自由成文；防回归样例：`access assess excess 怎么区分` 应为三行 `word + POS + 短义` + 一句 `注意`，且 `providerRequestId=null`。
- 随机英文串已从 spelling-assist/plain provider 中排除；防回归样例：`zzqvwm 是什么意思` 应返回 grounded no-match，且 `providerRequestId=null`，不要猜成 `squeeze` 或其它弱相关词。
- 形近/易混自然中文 cue 已统一路由到 `shape_neighbor_search` / light grounding；防回归样例：`帮我找一下和access比较像的易混词` 不应走 `standard_lookup`，且应优先召回 `access/assess/excess`。
- broad / shape / direct-broad 已改为后端确定性短行 renderer，provider 不再负责自由改版式或漏列候选；防回归样例：`comm 开头的单词总结`、`inter 开头的词有哪些`、`跟 recent 很像的词有哪些` 应为 `providerRequestId=null`。
- dynamic direct-broad 已收紧为只答用户点名词；防回归样例：`commend comment command 怎么区分` 不应补 `contend/content` 等旁支词。
- dynamic light grounding runtime 已不再接收 `confusion_group` 作为候选输入或排序特权；旧 group 可作为 legacy exact 辨析/测试 fixture 暂存，但不能重新变成 broad 候选主机制。
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

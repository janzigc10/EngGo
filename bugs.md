# EngGo 已知问题与环境坑

## 2026-05-25 Windows `Start-Process` 环境变量里同时存在 `Path` / `PATH` 会导致 dev stack 假启动（环境坑）
### 症状
在 PowerShell 里用 `Start-Process` 启动 `corepack pnpm dev:fastapi` 时，进程可能直接失败并报：

```text
已添加项。字典中的关键字:“Path”所添加的关键字:“PATH”
```

这会让后续 smoke 误以为服务已重启，但 8000/3000 实际仍可能是旧进程或未监听。

### 处理方式
启动 dev stack 前先把当前进程环境里的 `PATH` / `Path` 归一化，再设置 ECDICT 与 structured runtime 变量：

```powershell
$env:ENGGO_ECDICT_PATH = 'C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv'
$env:ENGGO_USE_STRUCTURED_RUNTIME = 'true'
$pathValue = [System.Environment]::GetEnvironmentVariable('Path', 'Process')
[System.Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
[System.Environment]::SetEnvironmentVariable('Path', $pathValue, 'Process')
```

随后再 `Start-Process`，并用 `netstat -ano | Select-String -Pattern ':8000|:3000'` 与 `.runlogs` 里的 health / Ready 日志确认真实监听的是新进程。

## 2026-05-24 隔离 worktree 缺少 ignored ECDICT 文件会让 live smoke 误报 no_match（环境坑）
### 症状
在 `C:\tmp\enggo-worktrees\conversation-context-v1` 隔离 worktree 里启动 FastAPI 后，`corepack pnpm eval:fastapi:conversation-context-smoke` 首次失败：
- `access assess excess -> 第二个是什么意思` 通过。
- `给我几个跟 evaluate 易混的单词 -> 第二个怎么用` 失败，turn 1 缺少 `evaluate/evacuate` context，turn 2 退成 clarification。
- `response 的派生词 -> 把这组都收藏` 失败，turn 1 缺少 `respond/response/responsive/responsible` context，turn 2 退成 clarification。

直接探测 `/api/chat` 时，这两类 ECDICT-backed broad/word-family query 都返回 no_match 或空候选；但主 workspace 下 `C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv` 存在。

### 根因判断
`output/external-dictionaries/ecdict.csv` 是本地 ignored 资产，不会随 git worktree 复制。FastAPI 默认按当前工作目录读取 `output/external-dictionaries/ecdict.csv`，隔离 worktree 缺文件时 ECDICT lookup 为空；因此依赖 ECDICT 的 shape neighbor / word family live smoke 会假失败。这不是 resolver 或产品逻辑回归。

### 处理方式
在隔离 worktree 跑 live FastAPI smoke 时，显式设置：

```powershell
$env:ENGGO_ECDICT_PATH='C:\Users\Chen\Desktop\EngGo\output\external-dictionaries\ecdict.csv'
```

或以等价方式在启动 dev stack 的环境变量里注入该路径。2026-05-24 本轮重启后，`corepack pnpm eval:fastapi:conversation-context-smoke` -> 5 total / 5 pass / 0 fail。

### 后续防回归
- 遇到 ECDICT-backed live smoke no_match，先确认 `ENGGO_ECDICT_PATH` 和文件存在，不要先改 resolver 或候选排序。
- 不要把 66MB ignored ECDICT CSV 提交进 repo；worktree 验证用环境变量指向主 workspace 本地文件即可。

## 2026-05-19 meaning lookup 仍走 structured DB 导致中译英 500（已修，需防回归）
### 症状
用户在 Next proxy 里连续问 `遵循的英文是什么`、`活动的英文是什么`，页面返回“当前回答服务暂时不可用”。`.runlogs/chat-interaction.jsonl` 记录 500，FastAPI 错误栈指向 `AdvancedLookupService.answer_meaning()` 里的 `repository.find_meaning_candidates()`，最终由 `StructuredLookupUnavailable: connection timeout expired` 冒泡。

### 根因判断
structured DB 虽已被产品方向降级为 optional overlay，但 `create_app()` 仍会因为 `.env` 里存在 `DATABASE_URL` 默认实例化 `StructuredLookupRepository`。同时 meaning lookup 缺少 ECDICT 中文释义入口；DB 不可用时既没有 ECDICT 候选，也没有局部降级保护，于是直接变成 500。

### 修复状态
1. `ENGGO_USE_STRUCTURED_RUNTIME` 现在显式控制 structured overlay；默认注入 `NullStructuredLookupRepository`，不会连接 DB。
2. meaning lookup 已合并 `ecdict_meaning_vocabulary()`，可以从 ECDICT 中文释义召回中译英候选；`活动` 会优先命中 `activity`。
3. `answer_meaning()` 只捕获 `StructuredLookupUnavailable` 并降级为空 structured 候选，不吞普通 SQL/schema bug。
4. no-DB smoke 已新增 `遵循的英文是什么`、`活动的英文是什么`。

### 后续防回归
- 不要让 `DATABASE_URL` 存在本身重新打开 structured runtime；必须显式设置 `ENGGO_USE_STRUCTURED_RUNTIME=1`。
- meaning lookup 的默认 grounding 来源是 ECDICT 中文释义搜索，不要重新改成依赖 structured DB 或 provider 猜测。
- PowerShell 手写中文 JSON 做 smoke 时可能因编码变成 `????`；真实接口验证优先使用 UTF-8 文件或 `\u` escape payload。

## 2026-05-18 respond/response 派生词未做 `respons-` 词干归一导致 no_match（已修，需防回归）
### 症状
用户截图复现：`response的派生词`、`respond的派生词` 都返回“这个词根/前缀组合还没有稳定收录成词族”，而不是基于 ECDICT 给出 `respond`、`response`、`responsive`、`responsible`、`responsibility` 等同族词。

### 根因判断
ECDICT 本身有这些词；问题不在词库缺词，也不是“派生词只有 structured 才能用”。当前 `word_family_evidence()` 只识别直接 `seed + suffix`、前缀组合，或少量 `word_family_stem_aliases`。`respond/response` 需要额外归一到 `respons-`，否则 `response`、`responsive`、`responsible`、`responsibility` 不会被收进 `respond` 的词族。

### 修复状态
1. `backend/app/retrieval/dynamic_light_grounding.py` 已新增保守 alias：`respond` / `response` -> `respond`、`respons`。
2. 防回归测试已补：`backend/tests/test_advanced_lookup.py` 覆盖 `respond的派生词`，并断言不把 `correspond`、`rescue` 混进 light candidates。
3. smoke 矩阵已补：`scripts/lib/fastapi-db-unavailable-smoke.ts` 与 `scripts/lib/fastapi-migrated-slice-smoke.ts` 均覆盖 no-DB / migrated slice 下的 `respond` word-family。

### 后续防回归
- 不要把这个修成宽泛 `respon*` 前缀召回；否则容易把 `correspond` 一类词混进主族。
- 新增其它词族时优先补小范围 stem alias + 红测，而不是把 ECDICT 派生词逻辑整体放宽。

## 2026-05-18 ordinary lookup 未处理 DB 不可用导致 500（已修，需防回归）
### 修复前症状
direct compare 无 DB 降级修复后，真实 Next proxy 复测已能让 `restrain 和 constrain 的区别` 返回 200；但修复前普通查词/用法类请求在 DB 不可用时也观测到 500。

修复前证据：
- 修复前现场 Prisma dev 为 `default not_running`、`enggo not_running`。
- 修复前重启后的 dev stack：FastAPI `127.0.0.1:8000` PID `79780`，Next `127.0.0.1:3000` PID `82456`，日志在 `.runlogs/dev-fastapi-restarted-20260518-verify.out.log` / `.runlogs/dev-fastapi-restarted-20260518-verify.err.log`。
- 修复前 Next proxy live：`postgrad + restrain 和 constrain 的区别` -> 200，`mainAnswer=["restrain","constrain"]`，两词来自 `external_dictionary_basic`，`providerRequestId=null`。
- 修复前 Next proxy live：`postgrad + substitute 怎么用` -> 500，约 2.2s；`.runlogs/chat-interaction.jsonl` 记录 `requestId=enggo_05d24b01-baff-412c-9929-6a3bd3079772`、`status=500`、`answerSummary=Internal Server Error`。
- 修复前 Next proxy live：`postgrad + 有个像 institute 的词` -> 500，约 2.0s；`.runlogs/chat-interaction.jsonl` 记录 `requestId=enggo_cc326b15-1d6d-4778-b3d2-7064e11499fd` 与 `requestId=enggo_636ade0a-1978-4c69-b89e-80f0cdc8d9ad`，均为 `status=500`。
- `.runlogs/dev-fastapi-restarted-20260518-verify.err.log` 栈：`backend/app/answering/ordinary_lookup.py:533` 调用 `self.repository.find_exact_entry(active_exam_target, needle)`，`StructuredLookupRepository._connect()` 将 psycopg `ConnectionTimeout` 包装为 `StructuredLookupUnavailable`，但 ordinary lookup 没有捕获，最终冒泡成 FastAPI 500。
- 额外意图证据：`normalize_query("有个像 institute 的词")` 当时返回 `query_mode="fuzzy_recall"`、`LearningIntentPlan.task="standard_lookup"`、`allow_expansion=false`，说明该学生式“像 X 的词”没有走 shape-neighbor / broad recall。

### 根因判断
本轮修复前，无 DB 降级已经覆盖 `advanced_lookup.dynamic_vocabulary()` 和 `DirectCompareService.answer()`，但 `OrdinaryLookupService.answer()` 曾先无保护地访问 structured exact lookup。Prisma dev 不可用时，它没有继续走已有 source/ECDICT fallback，因此普通 exact/use-case 查询会失败。`有个像 institute 的词` 还额外暴露了学生式意图识别漏判：它当时被当作普通 fuzzy recall，而不是形近/相似词召回。

### 修复状态
1. `backend/tests/test_ordinary_lookup_answer.py` 已新增 DB 不可用红测：fake repository 在 `find_exact_entry()` 抛 `StructuredLookupUnavailable` 时，`postgrad + substitute 是什么意思` 和 `postgrad + substitute 怎么用` 均返回 ECDICT fallback，`providerRequestId=null`。
2. `backend/app/answering/ordinary_lookup.py` 已只在 structured exact lookup 边界捕获 `StructuredLookupUnavailable`，将 structured candidate 当作 miss，继续执行现有 source lemma / ECDICT fallback；已知 DB 不可用后不会再进入 structured fuzzy lookup 把优雅降级变回 500。
3. `normalize_query` / intent matrix 已补学生式 plain shape wording：`有个像 institute 的词`、`有个和 institute 很像的词` 走 `shape_neighbor_search` / `shape_neighbors`；`找一个类似 institute 意思的词`、`找一个和 institute 意思很像的词`、`找一个和 institute 含义很像的词` 不误走形近召回。
4. 2026-05-18 截图回归又补了更短口语句式：`和contest像的单词`、`和context像的单词`、`跟 recent 像的词` 现在同样走 `shape_neighbor_search` / `shape_neighbors`，不再落回 ordinary fuzzy lookup。
5. 验证：最新 live no-DB FastAPI smoke 使用坏 DB URL + ECDICT CSV，临时 FastAPI `127.0.0.1:8015`，`corepack pnpm eval:fastapi:db-unavailable-smoke -- --base-url http://127.0.0.1:8015 --label fastapi-no-db` -> 6 total / 6 pass / 0 fail，覆盖 ordinary lookup、direct compare、broad fragment、plain similar-word wording 和 bare connector similar-word wording。
6. 最新 Next proxy 实测：清理旧 12:42 进程与 `.next/dev` 生成缓存后，`127.0.0.1:3000/api/chat` 对 `和contest像的单词`、`和context像的单词`、`context` 均返回 200；前两条为 shape-neighbor，`context` 为 ordinary ECDICT exact lookup。

### 后续防回归
- 只捕获 `StructuredLookupUnavailable`，不要吞普通 SQL/query/schema bug；否则会把真正的数据访问错误伪装成 ECDICT fallback。
- 不要在 API 层粗暴 catch-all fallback。降级边界应留在对应服务的 structured lookup 调用处。
- plain shape wording 不要只测“有个像 X 的词”；还要保留 `和contest像的单词` 这种没有“有个/找一下”的口语输入。
- 如果 Next `/api/chat` 在 dev 环境突然返回 404 HTML，先停掉 3000/8000 旧进程并清理 `.next/dev` 生成缓存；这属于 dev cache/进程态问题，不要误判成 FastAPI 500。

## 2026-05-18 direct compare 未处理 DB 不可用导致 500（已修，需防回归）
### 症状
用户在 broad fragment 修复后继续手测，`re开头cile结尾的单词` 已恢复为 200，但 `restrain 和 constrain 的区别` 仍返回 500，客户端仍会表现成“当前回答服务暂时不可用”。

修复前证据：
- 重启后的 dev stack：FastAPI `127.0.0.1:8000` PID `92112`，Next `127.0.0.1:3000` PID `77256`，日志在 `.runlogs/dev-fastapi-restarted-20260518-1208.out.log` / `.runlogs/dev-fastapi-restarted-20260518-1208.err.log`。
- `postgrad + re开头cile结尾的单词`：FastAPI direct 约 11.1s、Next proxy 约 15.8s，均 200，`mainAnswer=["reconcile"]`，`providerRequestId=null`。
- `postgrad + restrain 和 constrain 的区别`：Next proxy 约 15.6s 后 500；`.runlogs/chat-interaction.jsonl` 记录 `requestId=enggo_5d508b24-fc62-4fa3-8647-f88f6ce75224`、`status=500`、`elapsedMs=15626`、`answerSummary=Internal Server Error`。
- `.runlogs/dev-fastapi-restarted-20260518-1208.err.log` 栈：`backend/app/answering/direct_compare.py:221` 调用 `self.repository.find_exact_entry(active_exam_target, term)`，`StructuredLookupRepository._connect()` 将 psycopg `ConnectionTimeout` 包装为 `StructuredLookupUnavailable`，但 direct compare 没有捕获，最终冒泡成 FastAPI 500。

### 根因判断
上一轮无 DB 降级只覆盖了 `advanced_lookup.dynamic_vocabulary()`，因此 ECDICT 可独立回答的 broad fragment 已恢复。`DirectCompareService.answer()` 仍按“structured repository 可用”的前提逐词查 structured exact；一旦 Prisma dev 停掉，它没有继续尝试已有的 ECDICT fallback，也没有跳过后续 confusion group 查询，而是让 `StructuredLookupUnavailable` 直接冒泡。

### 修复状态
1. `backend/tests/test_direct_compare_answer.py` 已新增红测：fake repository 在 `find_exact_entry()` 抛 `StructuredLookupUnavailable` 时，`postgrad + restrain和constrain` 返回 200，候选来自 ECDICT fallback，`providerRequestId=null`，且不继续查询 confusion group。该红测修复前失败，修复后通过。
2. `backend/app/answering/direct_compare.py` 已只捕 `StructuredLookupUnavailable`：
   - 逐词 exact lookup 捕到后继续走当前已有的 ECDICT fallback。
   - 已知 DB 不可用时不再调用 `find_confusion_groups_for_entry_ids()`；若 group 查询阶段才发现 DB 不可用，也降级为无 group/boundary 的基础 compare 答案。
   - `dynamic_vocabulary()` 的 `find_in_scope_entries()` 按 `advanced_lookup.dynamic_vocabulary()` 模式降级为空 structured 池。
3. 验证：focused Python 142 passed；`corepack pnpm test scripts/lib/fastapi-migrated-slice-smoke.test.ts` 12 passed；live no-DB FastAPI smoke 返回 `mainAnswer=["restrain","constrain"]`、两词 `external_dictionary_basic`、`providerRequestId=null`。

### 后续防回归
- 不要在 API 层粗暴吞所有异常；只处理这个已知“structured lookup 不可用”分支，避免掩盖 SQL bug。
- 若浏览器仍复现旧 500，先确认 `dev:fastapi` 是否是在修复后重启；该脚本不会自动 reload。

## 2026-05-18 FastAPI 被停掉的 Prisma dev 同步连接卡死（已修，需防回归）
### 症状
用户在客户端发送 `re开头cile结尾的单词` 后，页面显示“当前回答服务暂时不可用，请稍后再试。”

本次定位到的证据：
- `.runlogs/chat-interaction.jsonl`：`requestId=enggo_3bbd4f5a-c181-449c-b4e8-664ba10d1c1f`，`status=500`，`elapsedMs=306777`，`error=FastAPI unreachable`。
- `.runlogs/dev-fastapi-stack-20260518-104919.out.log`：Next `POST /api/chat 500 in 5.1min`。
- 直接请求 `127.0.0.1:8000/api/chat` 同一 payload 会超时；此后直接请求 `127.0.0.1:8000/health` 也会超时，说明 FastAPI worker 被同步阻塞。
- `corepack pnpm exec prisma dev ls` 显示 `default not_running`、`enggo not_running`。
- `.env` 的 `DATABASE_URL` 指向 `localhost:51218`，且带 `connect_timeout=0`；当前 repository 会保留该 libpq 参数。
- 离线 ECDICT 排除项：首次加载 `output/external-dictionaries/ecdict.csv` 约 8.266s；`re...cile` 搜索约 0.038s，只命中 `reconcile`。ECDICT CSV 不是 5 分钟卡死主因。
- 单独调用 `StructuredLookupRepository.find_in_scope_entries("postgrad")` 在当前环境 30s 超时。

### 根因判断
`AdvancedLookupService.answer_broad_vocab_if_possible()` 对 `root_family_summary` 会先调用 `dynamic_vocabulary()`，而 `dynamic_vocabulary()` 先同步访问 structured repository。Prisma dev 已停时，psycopg 仍按 `.env` 中的 `connect_timeout=0` 等待连接，导致 FastAPI async 路由所在单 worker 被堵住；于是 `/api/chat` 和 `/health` 一起不可用。

### 修复状态
1. `to_psycopg_conninfo()` 已把 Prisma 生成的 `connect_timeout=0` 归一为 `connect_timeout=1`；非法 timeout 也按 1 秒处理。
2. `StructuredLookupRepository._connect()` 只包装建连阶段的 psycopg 错误为 `StructuredLookupUnavailable`；SQL 执行错误仍应暴露。明确 connection timeout 不再 5 次重试，Prisma dev 协议瞬断仍保留短重试。
3. `AdvancedLookupService.dynamic_vocabulary()` 只在 `StructuredLookupUnavailable` 时将 structured 池降级为空，继续合并 source/ECDICT 候选；`re开头cile结尾的单词` 在 structured DB 不可用时仍可返回 ECDICT 候选 `reconcile`。
4. 验证：focused Python 140 passed；`corepack pnpm test scripts/lib/fastapi-migrated-slice-smoke.test.ts` 12 passed；live no-DB FastAPI smoke 返回 `mainAnswer=["reconcile"]`、`providerRequestId=null`。

### 后续防回归
- 环境恢复仍不是根因修复：重启 Prisma dev、migrate、seed、重启 dev stack 只能恢复手测，不应替代连接层快速失败和 ECDICT 降级测试。
- 如果后续其它服务也需要在 DB 不可用时走 ECDICT/source fallback，只捕 `StructuredLookupUnavailable`；不要捕普通 SQL 查询异常，否则会掩盖真正的查询 bug。
- 首次 ECDICT CSV 加载仍可能带来数秒耗时；这不是 Prisma dev 卡死，但若产品要进一步优化，可单独评估启动预热或懒加载缓存体验。

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
- 短语普通查词加中文查询后缀已回到 deterministic ordinary lookup；防回归样例：`make up 是什么意思` 应为 `external_dictionary_exact` / no provider，`according to 是什么意思` 应为 `source_lemma_exact` / no provider。
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

# EngGo 已知问题与环境坑

## 2026-07-17 Spelling auto-correct precision 未达硬门（方案 A 已通过 held-out，问题已解决）
### 症状
正式 calibration round 3 完整运行 481 条后，candidate Recall@3 为 88.36%、warm p95 为 89.643ms、candidate RSS 增量为 434,176 bytes，正确词 / 随机串保护和 route / slot 均通过；但 auto-correct 只有 183 / 194 正确，precision 为 94.33%，低于 spec 的 98% 硬门。runner 正确给出 `allPassed=false`、`readinessPassed=false`。

### 根因判断
当前 decision policy 只看编辑距离和第一、第二候选的距离 margin。11 条误纠正中，10 条是范围外 ECDICT 生僻词、变形词或低价值词形以 distance-1 成为唯一 top candidate，压过 distance-2 的考试目标词，例如 `anlize -> alize` 而不是 `analyze`、`repeatly -> repently` 而不是 `repeatedly`；另 1 条是范围内 `yourselve -> yourselves`，而标注目标为 `yourself`。这不是 route、slot、candidate Recall 或性能失败，而是“全局词典存在”被当成了足够强的自动纠正置信度。

### 修复与最终边界
1. 三轮 calibration 额度已用完；不得继续逐例补规则或重新生成 calibration。唯一一次 held-out 已完成，canonical receipt 和产物必须保留，禁止删除或重跑。
2. calibration 中 183 条正确 auto 全部属于 active exam scope，10 条范围外 auto 全部错误。用户批准并已实现“top candidate 必须在 active scope 才可 auto”；范围外候选保持原距离排序，改为 clarification / safe no-match。
3. 对 hash-pinned round 3 候选的离线 replay 得到 183 / 184 = 99.46% precision、38.25% coverage；唯一一次 held-out 得到 743 / 752 = 98.80% precision、39.09% coverage、Recall@3 89.60%、warm p95 118.973ms，18 / 18 最终门通过。held-out 产物位于 `.runlogs/spelling-recovery-v1/current/held-out/`。
4. 不降低 98% 精度门，不以完全关闭 auto 的 0 coverage 规避验收。

## 2026-06-12 Next dev 用 `127.0.0.1:3000` 会拦截 dev resources（环境坑）
### 症状
Browser QA 打开 `http://127.0.0.1:3000` 时，Next 16 dev server 返回 200，但页面可能停在 loading fallback 或出现 hydration / RSC 噪声。dev log 会出现：

`Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1".`

### 根因判断
Next dev 默认 Local origin 是 `http://localhost:3000`。用 `127.0.0.1:3000` 访问时，dev resource / HMR 被 Next 的 `allowedDevOrigins` 保护拦截，浏览器侧不能代表真实 hydrated 状态。

### 处理方式
1. 本地 Browser QA 默认打开 `http://localhost:3000`。
2. 只有确实需要 `127.0.0.1:3000` 时，再在 `next.config.ts` 配 `allowedDevOrigins` 并重启 dev server。
3. 如果看到 RSC 脚本文本、loading fallback 长时间不消失或 hydration 异常，先确认 URL origin，不要直接当成功能回归。

## 2026-06-02 No-match / weak-answer audit 残留（2026-06-04 已修主要 weak resolved，需防回归）
### 症状
真实 Next proxy `/api/chat` 探测确认，当前 hard no-match 已经不算最主要问题；更影响体验的是部分问法会“看起来回答了”，但实际没有真正理解意图。

确认样例与当前状态：
- `zzqvwm 是什么意思` -> 合理 hard no-match；随机串不应让 provider 硬猜。
- `zqx开头的单词`、`re开头xyz结尾的单词`、`xxxxx 这一族怎么记`、`xqz 的派生词` -> hard no-match；属于无候选词根/词形/词族边界。
- `anti+dis 的词根有什么词` -> 2026-06-03 已修：没有直接有序片段命中 `anti+dis` 时，broad path 不再 resolved，回到 root no-match。
- `跟 abandon 意思差不多的词`、`responsible 的同义词` -> 2026-06-03 已修路由承接：进入 `semantic_expression`，不再误塞入词族/形近；输出仍是 provider-assisted 表达建议，不声称词库命中。
- `遵循的英文是什么` 后追问 `还有更适合作文的吗` -> 2026-06-03 已修：semantic style follow-up 先于 `show_more` 解析，锁定上一轮 candidates 走 `context_choice`。
- `more formal way to say follow` -> 2026-06-03 已修：进入 `semantic_expression` 灰区路径；有 provider 时 classifier 只产出受限 intent / slots，代码校验 terms provenance；provider 不可用时 bounded plain fallback。
- `表达观点的英文是什么` -> 2026-06-04 已修：不再 resolved 到 `hiss`，真实 E2E 当前为 `express / state / voice / represent`。
- `遵循的英文是什么` -> 2026-06-04 已修：不再 resolved 到 `disobedience / subdue / unwilling`，真实 E2E 当前为 `follow / observe / comply / obey / abide`。
- `限制的英文是什么` -> 2026-06-04 顺手修复：不再优先返回 `bridle`，真实 E2E 当前为 `restrict / limit / constrain`。
- `遵守规则用英文怎么说` -> 2026-06-05 已修：不再 clear_context，也不被泛 `遵从 / 遵守` seed expression 组截走；真实 E2E 当前为 `follow / observe / comply / obey / abide`，并禁止 `defer` 进入主答案。
- `负责的英文是什么`、`承担责任的英文是什么` -> 2026-06-05 已修：不再 resolved 到 `provost` 或 `respond`，真实 E2E 当前为 `responsible / liable`。
- `表达想法的英文是什么`、`提出观点的英文是什么` -> 2026-06-05 已修：进入 expression-verb preferred path，分别返回 `express / state / voice` 和 `state / express / voice`，不再退成 `thought / notion` 这类名词候选。
- `anti+xyz 的词根有什么词`、`re+con+sub 的词根有什么词` -> 2026-06-05 已纳入 E2E：保持 bounded root no-match，不再从 loose broad path 硬凑候选。

### 根因判断
1. broad grounding 当前主要靠候选数量阈值决定是否 answerable，缺少“候选质量 / 约束强度”闸门。弱片段或宽泛前缀只要凑够候选，就可能被标成 resolved。
2. `同义 / 近义 / 意思差不多 / 写作表达` 被排除出 word family / shape neighbors 是正确方向，但对应的 semantic expression tool 尚未补上。
3. 多轮 resolver 覆盖了 `哪个更正式/更自然/更适合...`，但没有覆盖 `还有更适合作文的吗` 这类 show-more + style-choice 混合问法。

### 修复状态
1. `ChatToolRoutePlan` 已增加 `source`、`confidence`、`ambiguityReasons`；高置信规则路径不调用 classifier。
2. 新增灰区 intent classifier：只返回 JSON，terms 必须来自用户原文或上一轮候选；模型扩词会被丢弃。
3. 新增 `semantic_expression` 分支，承接同义、近义、意思差不多、写作表达和英文 `formal way to say X`；provider 只负责表达，不声称词库命中。
4. broad root combo 增加候选质量门：`a+b` 必须有直接有序片段命中才可 broad resolved，否则回 root no-match。
5. follow-up resolver 新增 semantic style 优先级，`还有更适合作文的吗` 不再被 `show_more` 抢走。
6. meaning lookup 新增质量门：
   - `meaning_core` 在 broad grounding 前先区分 strong / weak candidates。
   - preferred lemma 和正向原 hint 命中可进入 grounded main answer；否定、使役、alias-only 弱命中不再冒充主答案。
   - ECDICT meaning candidate 在 meaning lookup 合并时优先于普通 source lemma candidate，避免同 lemma 的 source 版本丢失 semantic hints。
   - 无 strong 候选但有受控表达选项时，返回 `meaning_expression_advice` plain answer，并把弱候选只放进 `weakCandidateLemmas` metadata。
7. seed expression provider 失败时会退回 grounded fallback，不再在 providerless 环境把已有 grounding 变成 503。
8. phrase hint 会绕过泛 seed expression 组，避免 `遵守规则` 被 `遵从 / 遵守` 组带出 `defer`。
9. 2026-06-05 review blocker 已修：`meaning_expression_advice` 不再用 `resolution=resolved`，而是 `answerKind=plain`、`resolution=no_match`、`noMatchReason=low_confidence`，并补齐前端展示所需 grounding 字段；前端专门显示“表达建议”，不再误显示“已命中 0 个当前范围词”。
10. 2026-06-05 review blocker 已修：phrase hint 截取增加否定上下文保护，`不承担责任的英文是什么` 不再被截成 `承担责任`，避免正向 preferred lemma 抢走否定表达。

### 2026-06-05 扩展覆盖新增残留
- `活动的英文是什么`：2026-06-05 已修。当前策略是 ECDICT tag-derived scope closure：CET-6 继承 Gaokao + CET-4，Postgrad 继承所有低级别基础词；E2E 当前为 `activity / event / action`，且 `activity` main first。后续不要再把词书 membership 写成“直接 tag 必须等于当前 scope”。
- `anti 前缀有哪些词` / `anti开头的词有哪些`：2026-06-07 已收口为词形题，可以包含 `antique / anticipate` 这类拼写命中词，但 inventory answer 不声称它们都表达 `anti-` 的“反对”含义。
- `anti/re/sub/trans/-less/-er` 词缀语义题：2026-06-07 已补 Affix Semantic Gate V1，主答案必须同时满足拼写和释义证据；`antique / anticipate / reconcile / unless / water / administer / better` 这类只靠拼写或偶然释义噪声的词不能冒充语义命中。
- `xyz开头的单词`：2026-06-07 已修，不再因 ECDICT exact `xyz` 条目把它误判为 prefix 列表；当前 providerless E2E 为 bounded root no-match。

### 后续防回归
- 不要把灰区 classifier 扩成完整 ReAct Agent；V1 仍是 rule-first + validated slots。
- 不要接受 provider 返回的候选外 terms；所有 tool 参数必须有 provenance。
- 不要让 semantic expression 声称“已命中当前词库”或“考试高频”，它是 bounded expression advice。
- broad grounding 不能只靠候选数量 resolved；必须保留 root combo / 弱候选质量门。
- meaning lookup 不能重新让 source lemma 同 lemma 候选覆盖 ECDICT meaning candidate；否则 `restrict` 这类正确词会失去 semantic hints，被 `bridle/lid/law` 这类边缘候选抢走。
- scope closure 不要退回直接 scope 等值判断；`scopeCodes` 是 direct ECDICT tag 来源，当前词书 membership 应由 closure helper 判断。
- 不要重新把 `遵循 / 遵守` alias 扩回 `服从`；否则 `submit/subdue` 容易回流到 `遵循` 主答案。
- Affix Semantic Gate 不要退回纯 `startsWith` / `endsWith`：词缀语义题必须有 meaning signal；`-er 表示人` 还要求名词性的人/者/员/师等证据，不能让 `administer / better` 只因释义或英文 definition 有 person 噪声进入主答案。
- `meaning_expression_advice` 是表达建议，不是词库命中；不要让后端 grounding 或前端 support panel 把它显示成 resolved hit，也不要给它收藏工具。
- phrase hint 只能保护正向短语；遇到 `不 / 不要 / 不能 / 没有 / 未能 / 别 / 勿` 等否定上下文时必须保留原始 meaning hint。

## 2026-05-31 Review reserve buffer 导致 10 词复习显示超过 10 个不同词（已修，需防回归）
### 症状
用户在 `/review` 手测时发现 Review 一轮看起来不止 10 个词。代码级红测确认：修复前 10 词 Review 在失败补救路径会额外显示目标外 `abundant`，虽然分母仍显示 `0 / 10` 到 `10 / 10`。

### 根因判断
V2 为了让失败词“隔几张再回来”，在 `createReviewSession()` 中额外选取了 `targetCount + 8` 个到期词，并把后 8 个标成 `countsTowardGoal: false` 的 reserve。`requeueWithDelay()` 在 pending 不足时会把 reserve 拉入 pending；这些词不计入分母，但会作为真实卡片展示，造成用户感知上的“一次不止 10 个词”。

### 修复状态
1. 新 Review session 不再创建可见 reserve；`targetCount` 同时约束分母和本轮唯一可见词数。
2. `advanceToNextTarget()` / `requeueWithDelay()` 会跳过 legacy non-goal buffer，旧 active session 中已经存在的 buffer 不再进入可见卡片。
3. active session store 恢复 Review snapshot 时会清理 legacy buffer；如果当前卡片本身是 legacy buffer，则丢弃该 snapshot。
4. 回归测试覆盖：10 词 Review 允许失败词重复曝光，但唯一可见词数不能超过 10。

### 后续防回归
- 不要再用目标外词作为 Review 间隔 buffer；如果需要更好的补救间隔，必须在本轮目标词集合内部调度。
- Review 指标区分两件事：卡片曝光次数可以超过 `targetCount`，但唯一可见 lemma 不能超过 `targetCount`。

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
2. meaning lookup 已合并 `ecdict_meaning_vocabulary()`，可以从 ECDICT 中文释义召回中译英候选；但 `活动` 在 CET-6 providerless 真实装配下是否应跨范围优先 `activity` 仍见 2026-06-05 扩展覆盖残留。
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

### Frontend direct FastAPI 启动方式
2026-06-07 后，Next `/api/chat` proxy 已退役；浏览器聊天请求通过 `NEXT_PUBLIC_ENGGO_FASTAPI_URL` 直接调用 FastAPI。smoke 前必须先启动 FastAPI。只有需要改浏览器直连地址时，才设置：
```text
NEXT_PUBLIC_ENGGO_FASTAPI_URL=http://127.0.0.1:8000
```

优先入口：
- `corepack pnpm dev:fastapi`：先启动 FastAPI，再启动 Next，并把 FastAPI 地址注入到浏览器端。
- `corepack pnpm eval:default-fastapi-smoke`：验证默认 FastAPI direct `/api/chat`。

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

### 旧 Prisma / real-smoke DB 基线已退役
2026-06-07 之后，Prisma schema/migrations/seed、`db:*` scripts、旧 `real-smoke` 数据集和旧 product-smoke gate 已删除。后续 FastAPI direct smoke 不需要恢复本地 Prisma dev，也不需要重新 seed `real-smoke`。

### Next build tracing warning
`corepack pnpm run build` 已通过。默认 FastAPI 切流后，Next `/api/chat` 不再 import legacy TypeScript retrieval/service。2026-06-07 已删除 legacy TypeScript retrieval / answering 运行时和 source-lemma TS helper；如后续 build 仍出现 Turbopack/NFT tracing warning，再按实际 import trace 处理。

## 环境恢复路径

### Prisma dev 历史坑不再是恢复路径
历史上的 Windows + Prisma dev 不稳定问题已经不再是当前恢复路径。不要为了聊天、词书、FastAPI smoke 或默认验证去启动 Prisma dev、migrate 或 seed；如果旧文档里仍出现这些命令，只按历史记录理解。

### pnpm lockfile 更新优先离线
当前仓库依赖已经在本机缓存里。清理依赖后只需要更新 lockfile 时，优先用：

```powershell
corepack pnpm install --lockfile-only --offline
```

不要因为 registry 访问失败就先改业务代码或删除 `node_modules`。

### 中文 smoke 编码
Windows PowerShell 直接用 `Invoke-RestMethod` / `Invoke-WebRequest` 发中文 JSON 到本地 `/api/chat` 时可能乱码，导致 query mode 误判。

优先用：
- Node `fetch`
- 现有 TypeScript runner

如果必须用 PowerShell inline JS，先设置：
- `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`
- `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)`

### FastAPI / psycopg 可选 structured runtime
FastAPI 仍保留 Python 侧 optional structured repository，但默认不启用。历史上复用 `.env` 中的 PostgreSQL URL 时确认过几个兼容坑：

- `.env` 文件带 UTF-8 BOM；Python 侧读取必须用 `utf-8-sig`，否则 `DATABASE_URL` 可能不会被识别。
- 旧 Prisma `DATABASE_URL` 可能带 `schema`、`connection_limit`、`pool_timeout`、`max_idle_connection_lifetime` 等 query 参数，`psycopg` 不接受；Python repository 连接前要剥离这些非 libpq 参数。
- 本机旧 PostgreSQL URL 可能使用 `localhost`；Python 侧连接前规范到 `127.0.0.1`，避免 IPv6/localhost 解析导致连接卡住。

### Frontend direct FastAPI 与 Next dev 环境变量
历史上 Next proxy 依赖 `ENGGO_BACKEND_URL`，现在该路径已退役。前端直连只读 `NEXT_PUBLIC_ENGGO_FASTAPI_URL`；如果需要覆盖地址，可靠方式是临时创建被 `.gitignore` 忽略的 `.env.local`：

```text
NEXT_PUBLIC_ENGGO_FASTAPI_URL=http://127.0.0.1:8000
```

启动 Next 后日志应显示 `Environments: .env.local, .env`；跑完浏览器验证后删除 `.env.local`。后端产品 smoke 默认直接打 FastAPI，不再通过 Next proxy 判断业务链路。

### Provider 限流与超时
- MiniMax 临时 key 历史上出现 `429 usage limit exceeded (2056)`，不要把 429 误判成 retrieval 回归。
- DeepSeek flash 真实 provider smoke 已能跑通，但部分回答会超过 15s。
- `scripts/run-answer-style-provider-smoke.ts` 当前默认 timeout 已提高到 45s，并支持 `ENGGO_PROVIDER_SMOKE_TIMEOUT_MS` 覆盖。
- 真实 provider smoke 尽量小批量串行跑。

## 当前产品侧残留
- 旧 `eval:product-smoke` / `scripts/run-black-box-product-http-smoke.ts` 已于 2026-06-07 structured legacy cleanup 中删除。默认 smoke 是 `eval:fastapi:conversation-context-smoke` / `eval:default-fastapi-smoke`；如后续要恢复全量 product smoke，必须按当前 FastAPI + ECDICT 行为重写矩阵，不能复用旧 structured exact / comparisonView / root prototype 期望。
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
  - seed 中仍保留 `root-stitute` / `root-tempt`，但默认 `NullStructuredLookupRepository` 不消费这些 legacy root family；自然问法 `跟 institute 一样那几个词怎么记` 当前为 bounded no-match。
  - 这些 root view 只属于可选 structured overlay，不能再写成默认 chat runtime 已支持；默认路径可用的是独立的 ECDICT form / fragment 检索。
  - 泛化语义词根理论仍未定义
- `re+con 的词根有什么词` 当前按 broad fragment / related prefix 支持，但不要说成稳定词根家族；后续如继续扩展，先写产品定义，不要在 parser 里加硬特例。
- `postgrad` 缺 entry-level 可机读官方词表，不要为了 scope 完整性补伪造条目。
- `corepack pnpm exec tsc --noEmit` 仍是已知工程债，主要集中在：
  - 测试 fixture 的 `activeExamTarget` / `examScopes` 被推宽为 `string`
  - `src/features/chat/use-chat-session.ts` 的 API 成功/错误响应联合类型需要收窄
  - 旧 Prisma / Node `pg` 声明已删除；剩余类型债集中在前端测试 fixture 和 chat API 响应联合类型。

## 已处理但要防回归
- legacy TypeScript `retrieveCandidates -> buildGrounding -> chatService` 已于 2026-06-07 退役；库外 meaning / fuzzy / compare 防硬猜现在以 FastAPI 后端测试和 HTTP smoke 为准。
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
- 不要为了当前验证恢复 Prisma dev；这条链路已经退役。
- 不要把 no-match 闸门放宽成“弱相关也先答一个像样答案”。
- 不要因为 provider 429 / timeout 就回退检索逻辑。
- 不要用 prompt 兜 retrieval 边界污染；如果 ordinary lookup 又带出裸组，优先修 retrieval。
- 不要一次性导入几千词。
- 不要抠商业词书完整释义、例句、辨析、助记和章节结构。
- 不要为 `postgrad` 编造 curated scope。
- 不要把 embedding 当成形近词和考试范围过滤主干。

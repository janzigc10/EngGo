# Retrieval Observability & Spelling Recovery V1 Design

## 状态

- 设计日期：2026-07-17
- 用户已批准：最小可见闭环、精度优先、当前考试范围优先后回退全局 ECDICT、trace 仅开发侧
- 当前阶段：设计已确认，尚未创建 implementation plan，尚未修改运行时代码

## 产品决策

EngGo 下一阶段不先迁移 Agent / LangGraph，也不重写整套路由。第一刀建立一个可测量的检索闭环：

1. 用开发侧 trace 记录一次请求从路由到最终 recovery 的真实执行轨迹；
2. 在默认 ECDICT-first、structured runtime 关闭的运行方式下，补齐本地错拼候选能力；
3. 用固定外部数据和负样本证明错拼召回真实提升，同时保护正确单词、随机串和现有稳定路由。

这轮解决的是“路由正确但候选通道为空”和“最终回复掩盖中间失败”两个已确认问题，不把自然语言语义检索、中文槽位抽取和完整 Agent loop 一并塞进同一轮。

## 当前问题与证据

### 默认错拼能力结构性缺席

默认配置关闭 structured runtime，`create_app()` 会装配 `NullStructuredLookupRepository`。该 repository 的 `find_english_candidates()` 固定返回空列表，而普通查词的 grounded typo 候选依赖这个接口。因此请求可以正确进入 `fuzzy_recall`，却没有生成正确候选的默认路径。

固定种子 `20260717` 的现状基准显示：

- 100 个合成单编辑 typo：路由正确率 100%，恢复率 0%；
- ETS TOEFL-Spell 中与当前 7,348 词考试词表交集的唯一错词—正确词对共 2,405 对；随机抽取 50 对实跑时，50 / 50 进入 `fuzzy_recall`，Recall@1 与 Recall@5 均为 0%；
- 47 / 50 为 `no_match/out_of_kb`，3 / 50 命中其他真实词，但没有一条命中标注正确词。

### 最终回答无法说明失败发生在哪层

当前路由对象、标准化结果、工具执行结果和 grounding 已经分别包含部分诊断信息，但没有统一 request-scoped trace。no-match recovery 还可能把检索失败改写成 `plain` provider 回答，最终响应不能还原 recovery 前的候选与失败原因。

因此 HTTP 200、存在回答或存在 providerRequestId 都不能等同于检索成功。

## 目标

1. 默认 ECDICT-first runtime 在不连接 structured DB 时具备真实错拼候选生成能力。
2. 正确单词不被擅自纠正；高置信结果明确说明纠正；歧义结果让用户选择；随机串不乱猜。
3. 当前考试范围先生成候选并获得排序偏好，同时用全局 ECDICT 做有界竞争检查；不能因为范围内存在一个较远候选，就漏掉范围外更近或同距离的竞争候选。
4. trace 能将 route、slots、tool、candidate recall/ranking、decision、resolution、recovery 和 latency 串到同一 requestId。
5. benchmark 能分别判断路由、候选召回、排序、自动纠正精度、拒答和性能，而不是只比较最终文案。
6. 保持现有 exact lookup、direct compare、meaning lookup、上下文续问、answerSurface 和 provider 边界。

## 非目标

- 不迁移 LangChain / LangGraph，不增加 ReAct 或自由工具调用。
- 不扩大灰区 LLM classifier 的职责。
- 不重构中文 meaning lookup、自然描述找词或词性排序。
- 不恢复 structured DB 作为默认运行依赖。
- 不引入向量检索来解决拼写距离问题。
- 不新增用户可见的调试面板或新的回答卡片类型。
- 不把完整第三方数据集直接提交进仓库或加入每次默认 `verify`。

## 方案选择

### 采用：独立本地错拼候选组件

新增一个与 structured repository 解耦的本地 spelling candidate provider。它只负责从受控词池产生、排序和解释候选；ordinary lookup 消费它的结果，chat API / orchestrator 负责记录 trace 和生成最终回答。

选择该方案的原因：

- 比把更多逻辑继续塞进 `ordinary_lookup.py` 更容易单测和替换；
- 比恢复 structured DB 更符合当前 ECDICT-first 产品方向；
- 比第一轮直接生成离线 SymSpell 索引改动更小；
- 后续若运行时索引达不到性能门槛，可以在不改变调用方协议的前提下换成离线索引。

### 未采用：ordinary lookup 内联模糊扫描

改动较少，但会继续把候选生成、阈值、质量门、回答和日志堆在同一个 handler，延续当前补丁式耦合，也不利于 benchmark 直接调用真实候选逻辑。

### 暂缓：离线生成拼写索引

运行时最快，但第一版会额外引入索引生成、ECDICT 版本哈希、ignored 资产同步和更新流程。只有运行时方案超过延迟或内存门槛时再进入该方案。

## 架构

### 1. `SpellingCandidateProvider`

职责：

- 接收标准化后的单个英文目标词和 `activeExamTarget`；
- 先查询当前 scope closure 的考试词池，建立候选和当前最优编辑距离；
- 再查询全局 ECDICT canonical lemma 池中落在当前决策距离带内的候选，用于发现更近结果和同距离竞争者；
- 返回有序候选及其客观信号，不负责生成自然语言回答；
- 不调用 provider，不连接 structured DB。

候选至少包含：

- canonical lemma；
- 编辑距离，其中相邻字符调换按一次编辑处理；
- `inActiveExamScope`；
- `sourceKind`；
- 支持该排序的信号和稳定 reason code；
- 最终候选分数或可比较排序键。

词池和轻量索引按 ECDICT / compact wordbook 版本缓存，不能每次请求重新读取文件。第一版可使用长度桶或删除键等运行时轻量索引配合有上限的 Damerau-Levenshtein；具体实现必须由延迟和内存门槛决定，而不是预先绑定第三方库。

### 2. `SpellingDecisionPolicy`

职责：

- 保护真实单词；
- 将候选结果归为 `auto_correct`、`clarify_candidates` 或 `no_reliable_candidate`；
- 集中管理阈值和 top-candidate margin，禁止阈值散落在多个 handler；
- 只根据本地候选证据作决定。

候选生成与产品决策分离：前者回答“有哪些接近词”，后者回答“是否足够可靠，可以纠正”。这样 benchmark 可以分别衡量 Recall@k 和自动纠正 precision。

`scope-first` 不等于“范围内一旦命中就停止全局搜索”。全局阶段可以用当前最优距离作为上限缩小搜索，但每次 `auto_correct` 之前必须完成竞争检查并合并去重两个候选池。最终排序先比较拼写证据，再用 scope membership 等信号处理同等候选；考试范围不能覆盖更短的编辑距离。

### 3. Ordinary lookup 接入

现有 normalized query 和 controlled tool router 保持入口所有权：

```text
User query
  -> normalize_query
  -> controlled route plan (`fuzzy_recall`)
  -> ordinary_lookup
  -> SpellingCandidateProvider
  -> SpellingDecisionPolicy
  -> existing grounded lookup / candidate list / bounded no-match
```

行为：

- `auto_correct`：用选中的真实 lemma 继续现有 ECDICT exact lookup，回答中明确展示原输入与纠正词，不能静默替换；
- `clarify_candidates`：复用现有 candidate list / conversation context，最多展示 3 个候选，并通过下面的窄合同支持用户继续说“第一个”；
- `no_reliable_candidate`：保留 grounded no-match 和稳定 reason code，不允许后续 LLM 自行发明拼写候选；
- 范围外纠正：允许继续解释，但 support / scope 信息必须明确说明不在当前考试词书内。

第一版尽量复用现有 ChatSuccessResponse、grounding 和 answerSurface。只有当前合同无法表达“原词、纠正词、范围状态”时，才在 implementation plan 中提出最小 schema 扩展，不能借机设计新的 UI surface。

#### 歧义候选响应合同

歧义结果不是“已找到目标词”，也不是“完全没找到”，必须使用明确中间状态：

- `answerKind="grounded"`；
- `grounding.resolution="needs_clarification"`；
- `grounding.spellingDecision="clarify_candidates"`；
- `grounding.candidates` 保存按展示顺序排列的最多 3 个候选；
- `answerSurface.type="candidate_list"`，复用现有候选 UI；
- `conversationContext.topicKind="spelling_clarification"`，候选按相同顺序写入 context，沿用当前短期过期规则；
- 该状态不进入 no-match recovery，也不能被 provider 改写成某个确定词。

Follow-up resolver 只为 `topicKind="spelling_clarification"` 增加一个窄分支：查询仅包含一个受支持序号（例如“第一个”）时，直接把对应 lemma 改写为 exact lookup 的 `resolved_query`，reason 为 `spelling_candidate_selection`。越界序号继续 clarification；没有该专用 context 时，不扩大裸序号的通用解释范围。这样不会改变现有普通候选上下文的 follow-up 语义。

### 4. `RetrievalTrace`

Trace 是结构化诊断日志，不是模型思维链。每次请求用现有 `requestId` 串联：

- 原始 query；
- active exam target、构建 / 数据版本和 provider 模式；
- route source、confidence、ambiguity reasons；
- 标准化 slots；
- attempted tools 与 selected tool；
- 候选顺序、分数 / 排序键、来源、范围和 reason code；
- pre-recovery resolution / noMatchReason；
- spelling decision；
- recovery kind、provider outcome 与 final answer kind；
- 分阶段 latency 和总 latency。

Trace sink 至少有三种实现语义：

- null sink：默认关闭，不产生 I/O；
- in-memory sink：单元测试和 benchmark 直接读取；
- opt-in JSONL sink：本地开发诊断。

公开 `/api/chat` 和 `/api/chat/stream` 响应不暴露 trace。JSONL sink 写入失败不能影响聊天结果。第一版不记录完整 history，也不记录任何模型隐藏推理；原始 query 只在明确开启开发 trace 时写入。

Trace 必须在 chat API 的统一汇合点同时捕获工具执行前后和 recovery 前后，不能只记录最终 response，也不能为 stream 另建一套重复逻辑。

## 决策规则

决策顺序固定：

1. 如果输入本身是 ECDICT 真实单词，按真实单词处理，不自动改写。
2. 生成当前考试范围候选并得到当前最优距离。
3. 使用该距离带对全局 ECDICT 做竞争检查；如果范围内没有候选，则使用允许的最大生成距离。
4. 合并、按 lemma 去重两个候选池，再统一排序。
5. 一个候选在编辑距离、排序信号和与第二名的 margin 上同时满足高置信条件，进入 `auto_correct`。
6. 多个候选均合理但没有明显领先者，进入 `clarify_candidates`。
7. 没有可靠候选，进入 `no_reliable_candidate`。

考试范围是排序和展示信号，不是覆盖拼写距离的硬特权：范围内但明显更远的词不能压过范围外、拼写显著更接近的正确词。

阈值先在 calibration split 上冻结，再只在 held-out split 报告最终指标。不能用 held-out failure 逐例加规则后继续把同一结果当独立测试成绩。

## 异常与降级

- ECDICT 或 compact wordbook 不可用：返回可区分的 `candidate_source_unavailable`，保持安全 no-match，不返回 500。
- 全局竞争检查未完成或超过性能预算：不能仅凭范围内候选执行 `auto_correct`；降级为已有多候选 clarification 或安全 no-match，并在 trace 标记 timeout / budget stop。
- trace sink 不可写：聊天继续，诊断层单独报告 sink failure。
- provider 不可用：不影响错拼候选、排序和决策；provider-on 只影响受控成文，不改变检索 benchmark 成绩。
- random-like query：保留当前保守边界，不因全局 ECDICT 候选存在而自动纠正。

## Benchmark 设计

### 数据集

1. **真实错拼**：固定 ETS TOEFL-Spell repository commit，过滤为单英文 token、正确词存在于当前 EngGo 词池的唯一错误词—正确词对。
2. **正确单词负样本**：按考试范围、词长和近邻密度分层抽取真实 ECDICT / wordbook lemma，验证零误纠正。
3. **歧义样本**：包含多个合理近邻或 typo collision 的人工审核小集，验证 clarification 而非擅自选择。
4. **随机串**：固定种子生成并排除真实词碰撞，验证不会乱猜。
5. **路由与槽位样本**：保留 `{term} 是什么意思`、英文自然查词句和现有稳定路由样本，确保“候选能力改善”没有掩盖 route / slot 回归。

外部 TOEFL-Spell 全量文件不直接 vendoring 到仓库。V1 固定上游为：

- repository：`https://github.com/EducationalTestingService/TOEFL-Spell`；
- commit：`252ee893b75dbf6186facf9ffda5fc4bc5dc9eca`；
- input：`Annotations.tsv`；
- SHA-256：`2efdf7a3c0d0a73d6550a1fbb40e8bec27dd6c004d417950c4571f80a6f85795`；
- filter：`Type=M`、错误词与正确词均为单个英文字母 token、正确词存在于 EngGo 当前 7,348 词集合、错误词—正确词对去重；
- split seed：`20260717`，按编辑距离、词长和目标 scope 分层，20% calibration / 80% held-out；当前 2,405 对基线对应 481 / 1,924 对。

benchmark manifest 必须保存最终过滤后 pair hash 和每个 split 的条目 ID / pair，防止上游文件、过滤代码或本地词表变化后仍沿用旧成绩。最终质量门只读取 held-out split；calibration 仅用于冻结距离、margin 和 decision 阈值。

### 运行模式

- 强制设置实际 `ENGGO_ECDICT_PATH`；
- 明确记录 structured runtime 关闭；
- 检索主成绩使用 provider-off；
- provider-on 只作为独立成文 / recovery smoke，不能计入 Recall 或纠正 precision；
- 按 `gaokao / cet4 / cet6 / postgrad` 和“范围内 / 全局回退”分层报告；
- 记录冷加载、warm p50 / p95 和 RSS 增量。

### 指标

- route accuracy；
- slot exact / token F1；
- candidate Recall@1 / Recall@3 / Recall@5；
- MRR；
- high-confidence auto-correction precision 与 coverage；
- valid-word false correction rate；
- random-string auto-correction rate；
- clarification rate、safe no-match rate；
- resolution / no-match confusion matrix；
- recovery rate 与 provider outcome；
- candidate generation p50 / p95、cold load 和 RSS 增量。

报告必须能把 failure 归因到 route、slot、candidate recall、ranking、decision、resolution 或 recovery 中的一层。

## 验收合同

第一版必须同时满足：

- 正确单词误纠正率：0%；
- 随机字符串直接纠正率：0%；
- 被标记为 `auto_correct` 的结果，held-out precision >= 98%；
- `auto_correct` coverage 必须报告但不设最低门槛；精度优先策略不允许为了提高覆盖率放宽错误纠正风险；
- 真实错拼 gold 进入 Top 3，held-out Recall@3 >= 85%；
- warm typo candidate generation p95 <= 150ms；
- 新索引带来的 RSS 增量 <= 100MB；
- 超过延迟或内存任一门槛时，不强行放宽预算，转入离线索引方案评估；
- exact lookup、direct compare、meaning lookup、context continuation 和现有 no-match 安全边界无回归；
- 高置信、歧义、范围外和随机串四类真实 FastAPI HTTP smoke 通过；
- 复用现有 UI 的代表性浏览器 smoke 通过，不新增视觉回归；
- provider-off 与 provider-on 报告严格分开；
- `git diff --check`、相关 backend pytest、现有 migrated / conversation context smoke 通过。

## 测试分层

1. **Unit**：候选生成、距离、scope-first fallback、真实词保护、margin decision、trace sink。
2. **Service contract**：ordinary lookup 对三种 spelling decision 的 grounded / clarification / no-match 行为。
3. **Router regression**：现有高置信规则路由和灰区 model-assisted routing 不被改写。
4. **Benchmark**：固定 manifest、固定 split、固定 seed，输出 JSON 详情和 Markdown 摘要。
5. **Live HTTP**：真实 ECDICT、structured runtime off、provider-off 为主。
6. **Browser smoke**：复用现有 candidate list、standard lookup 和 scope support UI。

完整外部 benchmark 作为专用 eval 命令和验收报告，不直接塞入每次默认前端 `verify`。仓库内保留足够小、来源明确的 deterministic fixture 作为快速回归门。

## 预期代码边界

实现计划应优先限制在：

- `backend/app/retrieval/`：spelling candidate provider、decision policy、trace types / sinks；
- `backend/app/answering/ordinary_lookup.py`：消费 spelling result，不在此实现全套搜索算法；
- `backend/app/answering/chat_tool_router.py` 与 `backend/app/api/chat.py`：关联 route、tool execution、pre-recovery 和 final outcome；
- `backend/app/main.py`：默认装配 ECDICT spelling provider 和可选 trace sink；
- `backend/tests/`：unit / contract / regression；
- 独立 spelling benchmark runner、manifest 和 report；
- 仅在确有必要时最小调整前端已有 candidate / support 渲染。

不把 `NullStructuredLookupRepository` 改造成名不副实的 ECDICT repository，也不让新的 spelling provider 接管 meaning / shape / family 等其他检索职责。

## 交付顺序

1. 固化现状 benchmark 与 trace contract；
2. 建立独立 candidate provider 和 decision policy 的单元红测；
3. 接入 ordinary lookup，验证 provider-off HTTP 行为；
4. 接入 request-scoped trace，证明能区分 pre-recovery failure 与 final answer；
5. 跑 calibration，冻结阈值；
6. 跑 held-out benchmark 和性能 / 内存门；
7. 跑现有回归、浏览器 smoke，输出正式 comparison report；
8. 只有全部验收门通过，才把该路径视为默认错拼能力。

## 后续阶段

本设计完成后，后续优化应按独立 spec 排队：

1. 英文整句与中文自然表达的统一 Query Frame / 槽位抽取；
2. 中文反查的词性意识排序；
3. 词典释义反查与自然描述语义找词的能力拆分；
4. 在同一观测和 benchmark 合同下比较 rule-only、LLM-only 与 hybrid routing；
5. 最后才评估 LangGraph clarification / retry loop。

这些后续项不属于 Spelling Recovery V1。

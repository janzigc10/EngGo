# Dynamic Light Grounding 设计

## 背景

EngGo 早期的 grounding 依赖少量人工结构化关系，例如 `confusion_group`、`root_family` 和 `rootFamilyView`。这套方式在 500-700 个结构化词条阶段能提供稳定答案，但现在 source lemma / ECDICT 底座已经接近 8k 词，人工分组不再适合作为泛问主流程的入口。

旧分组不是无效，而是不完整。它们应该从“能不能回答的门票”降级为“排序加权、质量样例和回归测试”。新模式的主入口应改为 dynamic light grounding：每次用户提出泛问时，从当前考试词库动态生成一个小候选池，再让模型基于候选池总结。

## 目标

1. 用动态候选 grounding 接管泛问、易混、词形、前缀、后缀、片段和中文语义召回主流程。
2. 避免继续人工穷尽 8k 词的所有易混组、同根组、前缀组和语义组。
3. 保留模型回答的自然度，但把模型主答案限制在词库候选池内。
4. 保留 exact lookup 的确定性体验：普通查词仍走结构化 / ECDICT / source lemma 模板，不进入模型总结。
5. 让旧 `confusion_group` / `root_family` 只作为 boost、fixture 和 regression baseline，不再作为回答 gate。

## 非目标

1. 第一版不做全量人工重标注。
2. 第一版不把 8k 词两两比较后持久化为人工组。
3. 第一版不要求引入向量数据库；embedding 可以作为后续 MeaningExpert。
4. 第一版不删除旧分组数据表或旧测试，先降低它们在主流程中的地位。
5. 第一版不改变 ordinary exact lookup 的模板化回答策略。

## 新查询流程

```text
用户问题
  -> Query Router
  -> ordinary exact lookup?
       -> 是：结构化/ECDICT/source lemma 模板答
       -> 否：进入 dynamic light grounding
  -> Scope Filter
  -> Expert Activation
  -> Candidate Merge
  -> Ranking
  -> Model Summary
  -> UI 标注“基于考试词表候选总结”
```

### 1. Query Router

Router 先判断用户是不是在问普通查词。

普通查词示例：

```text
access 是什么意思
make up 是什么意思
accent 的意思
```

这些继续走 `standard_lookup`，不进入 dynamic light grounding。

dynamic light grounding 处理：

```text
commend comment command 怎么区分
con 开头哪些容易混
recent 附近有哪些像的词
spect 这串相关的词怎么整理
表示要求别人做事的词有哪些
tion 结尾的词有哪些
```

### 2. Scope Filter

每个候选必须来自当前考试范围。例如用户目标是 CET-6，则候选必须满足：

```text
candidate.scopes includes cet6
```

不在当前 scope 的词不能进入模型主候选池。

### 3. Expert Activation

新流程不在线全量跑所有算法，而是按 query 激活少数 experts。它类似 MoE 的部分激活：每个 expert 负责一种召回信号，每次只返回 topK。

建议第一版 experts：

| Expert | 触发条件 | 作用 |
| --- | --- | --- |
| ExactTermExpert | query 中出现英文词 | 保证用户明确写出的词进入候选 |
| ShapeExpert | 多英文词、像、看错、区分等 | edit distance 找形近词 |
| NgramExpert | 形近或拼写混淆问题 | character n-gram 找视觉近邻 |
| PrefixSuffixExpert | `con 开头`、`tion 结尾` | 用 prefix / suffix index 召回 |
| FragmentExpert | `spect`、`stitute`、`struct`、`re...ct` | 用 substring / pattern 召回 |
| MeaningKeywordExpert | 中文泛问，如“要求”“评论”“建议” | 用中文释义关键词召回 |
| StructuredGroupExpert | 候选命中旧人工组 | 给旧组成员 boost，不做 gate |
| EcdictMeaningExpert | source-only 缺少结构化释义 | 用 ECDICT 补基础 meaning |

第一版可以先做“伪专家”：仍从内存词表扫描，但只跑被激活的信号。8k 规模足够小，先保证质量和可解释性。后续再把 prefix、suffix、n-gram、meaning 做成真正索引。

### 4. Candidate Merge

每个 expert 返回候选后，统一合并去重。候选对象建议保留：

```ts
type LightGroundingCandidate = {
  lemma: string;
  scopes: ExamScopeCode[];
  sourceKind: "structured" | "source_lemma" | "external_dictionary_basic";
  meaningsZh: string[];
  partOfSpeech?: string;
  signals: Array<{
    type:
      | "exact"
      | "edit_distance"
      | "ngram_overlap"
      | "common_prefix"
      | "prefix"
      | "suffix"
      | "fragment"
      | "meaning_keyword"
      | "structured_group";
    weight: number;
    detail?: string;
  }>;
  structuredGroupIds?: string[];
  score: number;
};
```

这里的 `score` 只用于排序，不代表模型置信度，也不代表人工确认关系。

### 5. Ranking

排序原则：

1. 当前考试范围内是硬门槛。
2. 用户明确写出的词排在最前面。
3. 多信号命中的词优先。
4. 问题是形近词时，优先 `edit_distance` / `ngram_overlap` / `common_prefix`。
5. 问题是中文语义时，优先 `meaning_keyword`，后续可加入 embedding。
6. 旧人工组命中只加权，不决定能不能回答。
7. source lemma + ECDICT 可以进入候选，但不能伪装成人工结构化关系。
8. 每次最多给模型 12-18 个候选，模型最终讲 3-6 个重点词。

## 模型输入

模型不直接接收全词库，也不直接接收旧人工 group。它只接收本次 query 的小候选池。

示例：

```text
用户问题：
commend comment command 怎么区分

当前范围：
CET-6

候选池：
1. commend | 嘉奖；推荐 | source_lemma | signals: exact, edit_distance, ngram_overlap, common_prefix
2. comment | 评论；发表意见 | structured | signals: exact, edit_distance, ngram_overlap, common_prefix
3. command | 命令；指挥 | source_lemma | signals: exact, edit_distance
4. commence | 开始 | source_lemma | signals: edit_distance, common_prefix
5. commute | 通勤 | source_lemma | signals: common_prefix
```

模型 system prompt 必须约束：

```text
这些候选来自当前考试词库，不代表完整人工易混组。
主答案只能围绕候选池。
优先讲用户明确提到的词。
不要把候选外词作为主答案。
不要声称这些就是全部同根词或全部易混词。
不要讲过度词源理论。
候选质量弱时，要说明这是基于词库候选的初步整理。
```

正式产品第一版建议默认禁止候选外词进入主列表。若模型确实补充候选外词，应进入单独字段，例如：

```ts
extraMentionedTerms: string[];
```

默认 UI 不展示，先用于调试和 smoke 评估。

## 模型输出

建议新增或收敛到一个主 answer style：

```ts
answerStyle: "broad_vocab_summary";
groundingStrength: "light";
```

旧的 `confusion_untangle` 和 `root_family_summary` 可以作为 `broad_vocab_summary` 下的子类型或 presentation hint，而不是继续作为两条独立主路。

返回结构示例：

```ts
{
  answerKind: "grounded",
  answerStyle: "broad_vocab_summary",
  groundingStrength: "light",
  queryMode: "broad_vocab",
  candidates: LightGroundingCandidate[],
  selectedMainTerms: ["commend", "comment", "command"],
  supportLabel: "基于 CET-6 词库候选总结",
  containsCuratedGroup: false
}
```

## UI 呈现

UI 需要明确区分强结构化关系和动态候选总结：

```text
普通查词：
结构化词条 / 外部基础词典 / 来源词表命中

动态泛问：
基于 CET-6 词库候选总结

命中旧人工组时：
包含已整理易混组成员
```

不要把 dynamic light grounding 显示成“已整理易混组”。它只能表示本次候选有词库证据和召回理由。

## 旧 Grounding 的新角色

旧 `confusion_group`、`root_family` 和 `rootFamilyView` 不再作为主流程 gate。

旧角色：

```text
没有人工组 -> no_match
有人工组 -> 强回答
```

新角色：

```text
没有人工组 -> 仍可动态候选回答
有人工组 -> 候选排序 boost + regression baseline
```

保留旧数据的原因：

1. 它们是人工确认的高质量样例。
2. 它们可以用于回归测试，防止新动态流程把老问题讲差。
3. 它们能帮助第一版 ranking 更稳。

但它们不再代表完整词库地图。

## 全量跑与部分激活

在线查询不应该每次全量计算 8k 词的所有信号。推荐：

```text
离线：
全量建索引、抽样 smoke、发现高风险 cluster。

在线：
query router 激活少数 experts，每个 expert 返回 topK。
```

第一版可以先不优化性能：

```text
8k 内存扫描 + 激活信号过滤
```

等产品行为稳定后，再优化为：

```text
prefix index
suffix index
character n-gram index
meaning keyword index
structured group map
```

## 第一版实施范围建议

第一版先做：

1. 新增 `broad_vocab_summary` query mode / answer style。
2. 把泛问、形近、多词区分、前缀、后缀、片段、中文语义召回接入 dynamic candidate grounding。
3. 复用 `scripts/lib/grounding-strategy-probe.ts` 的候选选择思想，但移入正式 retrieval/answering 层。
4. 旧 `confusion_group` 只参与 boost，不再决定是否 no-match。
5. 普通 exact lookup 不变。
6. UI 显示“基于考试词表候选总结”，不显示“已整理易混组”。

第一版暂缓：

1. embedding / 向量召回。
2. 持久化所有候选对。
3. 删除旧 root / confusion 代码。
4. 重写收藏和复习系统。
5. 大规模人工补标签。

## 验证策略

### 单元测试

覆盖：

1. `commend/comment/command` 能召回三词并排前。
2. `recent 附近有哪些像的词` 能召回 `recent/resent`。
3. `con 开头哪些容易混` 能召回当前 scope 内 `con-` 候选。
4. `表示要求别人做事的词` 能召回 `request/require/demand`，并避免弱相关词排太前。
5. 旧人工组命中只加分，不作为唯一 gate。
6. ordinary exact lookup 不进入 broad summary。

### Provider Smoke

扩展现有 probe，从 14 条增加到 50-100 条学生式泛问。

检查：

1. 候选是否全部在当前 scope。
2. 用户明确写出的词是否进入 top candidates。
3. 模型是否把候选外词当主答案。
4. 答案是否过度词源化。
5. `direct model` 与 `dynamic grounding + model` 的差距是否仍明显。

### 产品 Smoke

接入 `/api/chat` 后，至少验证：

```text
commend comment command 怎么区分
有没有和 command 长得像的词
con 开头哪些词容易混
re 开头哪些词容易混
spect 这串相关的词怎么整理
表示要求别人做事的词有哪些
access 是什么意思
make up 是什么意思
```

其中普通查词必须保持 deterministic template，不被 broad path 污染。

## 新 Session 建议入口

新 session 开始后先读：

1. `AGENTS.md`
2. `progress.md` 顶部 dynamic light grounding 交接
3. 本文档
4. `docs/superpowers/plans/2026-05-11-grounding-strategy-probe.md`
5. `scripts/lib/grounding-strategy-probe.ts`
6. `output/grounding-strategy-probe/broad-student-v2.md`

然后先写 implementation plan，不要直接改 runtime。第一刀建议只做 retrieval 层候选 builder 和 focused tests。

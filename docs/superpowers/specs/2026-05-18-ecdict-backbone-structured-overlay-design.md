# ECDICT 主底座与 Structured Overlay 设计

## 背景

EngGo 早期的自有结构化词库基于几百个词条和几十个易混组构建。在那个阶段，人工维护 `confusion_group`、结构化释义、教学边界和少量词族关系，可以支撑聊天主舞台的第一版体验。

现在词库底座已经扩大到 ECDICT 级别。旧 structured 数据只覆盖旧阶段的小样本，它不再代表当前词库规模下的全局总结。如果继续围绕旧 DB 扩写复杂关系，维护成本会快速超过产品收益：每新增一批词，都要补释义、词性、别名、易混组、排序、教学备注和回归样例，这条路不适合作为长期主线。

新的方向是把 ECDICT 作为运行时默认词库底座，把旧 structured 数据降级为冻结覆盖层和质量样例。

## 核心结论

```text
ECDICT = 默认大词库底座
旧 structured DB = 冻结资产 / 可选精修覆盖层 / 回归样例
轻量人工 override = 后续少量高价值补丁
dynamic grounding = 易混、形近、词形、语义召回主流程
```

这里的重点不是把 ECDICT 伪装成高可信人工词库，而是承认它适合做大覆盖的基础来源。人工数据只保留真正有价值的精修部分，不再作为可回答性的前置条件。

## 数据角色

### ECDICT

ECDICT 是默认运行时词库底座，负责：

- 普通查词的基础释义和词性展示。
- 短语、连字符词和 exact phrase fallback。
- 当前考试 tag 候选，例如 `ky -> postgrad`。
- broad / shape / fragment / semantic 查询的候选池。
- 在 DB 不可用时继续支撑用户可见回答。

ECDICT 返回内容必须继续标记为 `external_dictionary_basic` 或 `external_dictionary_exact`。它可以提供基础释义和候选证据，但不能自动生成高可信教学关系。

### Structured Overlay

现有 structured 数据以后只做覆盖层，负责：

- 少量人工审核过的高质量释义。
- 少量黄金易混组和教学边界样例。
- dynamic grounding 的排序参考或 regression baseline。
- 已有 smoke / test 的稳定基准。

Structured overlay 不再是主词库资产，也不再是回答能否成立的 gate。DB 不可用时，各回答分支必须能继续走 ECDICT / source fallback。

### Lightweight Override

后续如果确实需要人工补词，默认只写轻量 override：

```text
lemma
scope
partOfSpeech
shortMeaningZh
aliases optional
note optional
```

不要默认继续维护复杂字段，例如全量例句、搭配、易混组、教学 rank、词根族、人工 review workflow。只有当某个场景反复被用户触发且 ECDICT 明显不足时，才补一条小 override。

## 查询流程

### 普通查词

```text
用户问题
  -> normalize: standard_lookup
  -> ordinary lookup
     -> structured overlay 可用且 in-scope: 用 structured 模板
     -> structured DB 不可用或 miss: 继续 ECDICT / source fallback
     -> ECDICT miss: no-match 或受控 model fallback
```

这条链路的目标是：`substitute 是什么意思`、`make up 是什么意思`、`according to 是什么意思` 这类请求不依赖 DB 在线。

### 易混、形近、词族和语义召回

```text
用户问题
  -> normalize + LearningIntentPlan
  -> dynamic grounding
     -> ECDICT 当前 tag 候选优先
     -> structured overlay 仅作 boost / regression
     -> hard constraints 过滤
  -> broad answer plan
  -> deterministic fallback 或受控 provider summary
```

这条链路的目标是：`有个像 institute 的词`、`re开头cile结尾的单词`、`co开头的意思是合作的单词` 这类请求从 ECDICT 大候选池中动态组织，而不是等待人工提前建组。

## 当前需要调整的层

1. `ordinary_lookup`
   - 捕获 `StructuredLookupUnavailable`。
   - 将 structured candidate 当成 `None`。
   - 继续执行现有 source / ECDICT fallback。
   - 不捕普通 SQL/query/schema 错误。

2. `normalize_query` / `LearningIntentPlan`
   - 把“像 X 的词”“和 X 很像的词”“有个像 X 的词”归到 shape-neighbor / broad recall。
   - 避免误判成 `standard_lookup`。

3. `advanced_lookup` / `direct_compare`
   - DB 访问只作为 structured overlay。
   - 已知 DB 不可用时降级为空 structured 池。
   - 不让旧 `confusion_group` 再变成 broad 可回答性的 gate。

4. `answer / grounding`
   - ECDICT 结果继续显示外部基础词典身份。
   - 普通查词保持块状短格式。
   - 不输出裸 `confusion_group`、范围尾巴或主动扩词。

5. `docs / tests`
   - 把旧 structured 数据的职责写成冻结覆盖层。
   - 补无 DB smoke，验证 ECDICT 主底座能独立回答核心路径。

## 非目标

- 不把 ECDICT 全量灌进 Prisma DB。
- 不继续人工扩全 `confusion_group`。
- 不删除现有 structured 数据。
- 不把 ECDICT 改名为 `structured`。
- 不让 ECDICT 自动产生考试优先级、词根族或高可信教学备注。
- 不用 API 层粗暴 catch 所有异常来伪装稳定。

## 验证基线

下一轮实现需要至少覆盖：

- DB 不可用时，`substitute 是什么意思` 返回 ECDICT fallback，`providerRequestId=null`。
- DB 不可用时，`restrain 和 constrain 的区别` 返回 ECDICT compare fallback。
- DB 不可用时，`re开头cile结尾的单词` 返回 ECDICT broad candidate `reconcile`。
- `有个像 institute 的词` 不走 ordinary lookup，而走 shape-neighbor / broad recall。
- `mitigate 是什么意思`、`make up 是什么意思` 等普通 exact lookup 仍保持干净模板，不回流 broad vocab。

## 长期迁移方向

如果 Prisma dev 继续成为本地开发负担，不优先删 structured 数据，而是优先把 structured overlay 迁出运行时 DB 依赖：

```text
Prisma structured DB
  -> exported static JSON / SQLite / read-only index
  -> runtime optional overlay
```

这样可以保留旧人工数据的价值，同时让产品主链路不被本地 DB 可用性绑住。

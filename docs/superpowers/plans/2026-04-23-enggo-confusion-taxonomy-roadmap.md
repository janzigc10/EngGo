# EngGo Confusion Taxonomy Roadmap

> 状态：roadmap / next-session handoff，不是已执行 implementation plan。下一 session 如要落地，请先基于本文拆正式 implementation plan。

## 一句话方向

EngGo 不只是查词工具，而是把学习者脑子里的英语“浆糊”分类、解开、固化的考试学习工具。

下一阶段的重点不应只是继续堆词库，而是先把 EngGo 的“解混淆语言”定下来：系统先判断用户是哪种混淆，再用对应的回答形态处理。

## 两条已经明确不同的主线

### 1. 易混解团：Confusion Untangle

用户状态：

- 脑子里有两个或几个长得像、意思像、用法像的词。
- 用户不是完全不知道词义，而是临场不知道该选哪个。

典型输入：

- `stationary 和 stationery 哪个是文具`
- `transmit 和 transit 怎么区分`
- `conform comply abide 区别`
- `access assess excess 怎么区分`

回答目标：

- 不铺百科。
- 不讲长词源。
- 给一个“下一次做题能用”的判断入口。
- 把糊团分成 2-3 个稳定分叉。

推荐回答形态：

```text
你会混，是因为……

先问一句：
这里是 A，还是 B，还是 C？

A → word1
B → word2
C → word3

题里抓：
word1 collocation
word2 collocation
word3 collocation

一句话收住：
word1 = ...
word2 = ...
word3 = ...
```

例子：

```text
conform / comply / abide by

你会混，是因为中文都像“遵守”。

先问一句：
是“符合标准”，还是“照要求做”，还是“信守约定”？

符合标准 → conform to
照要求做 → comply with
信守约定 → abide by

题里抓：
conform to standards
comply with rules
abide by the decision
```

设计原则：

- 口诀不是主菜，只在真的能 3 秒复述时出现。
- 避免牵强字母联想，例如 `e = envelope` 这类中间物太多的记忆法。
- 优先使用场景、动作、搭配作为分叉依据。

### 2. 词根家族地图：Root Family Map

用户状态：

- 脑子里有一个碎片、词根、前缀或半截拼写。
- 用户想知道它能长出哪些词，以及这些词之间是什么关系。

典型输入：

- `stitute 是什么`
- `re 和 con 有什么词根组合`
- `同一个词根既有 re 又有 con 的总结`
- `tempt 这一族怎么记`
- `pre 相关词总结一下`

回答目标：

- 给结构，不只给释义。
- 有地图感，可以比易混解团更展开。
- 标明优先级，避免让学生全背。
- 明确哪些组合不成立，不硬凑规律。

推荐回答形态：

```text
这个碎片大概表示……

它需要前缀给方向：
prefix1 + root → word1：动作故事 → 现代义
prefix2 + root → word2：动作故事 → 现代义

优先背：
word1 / word2 / word3

看眼熟即可：
low-frequency word

特别提醒：
不是每个词根都能机械套所有前缀。
```

例子：

```text
stitute 不是独立单词，更像“放置/建立”的词根部件。

in- = 放进去
in + stitute → institute
把制度/机构放进去 → 建立、设立；机构

con- = 放到一起
con + stitute → constitute
放在一起形成整体 → 构成、组成

sub- = 放在下面备用
sub + stitute → substitute
放在下面顶替 → 替代、替代品

re- = 放回去
re + stitute → restitute
放回原处 → 归还、恢复

pro- = 放到前面
pro + stitute → prostitute
历史演变义，低优先级，知道即可
```

设计原则：

- 词源故事可以用，但必须服务记忆，不要变成词源百科。
- 每个分支都要短：前缀方向 + 动作故事 + 现代义。
- 对 `tempt` 这类不能凑出常见 `re-` 派生词的情况，要明确说“不成立 / 不考 / 不要硬套”。

## 更全面的学习者混淆类型地图

下面是目前讨论出的完整 taxonomy。不要下一轮一次性全做，先用它指导设计边界。

### A. 形近解团

长得像、拼写接近。

- `stationary / stationery`
- `breath / breathe`
- `access / assess / excess`

回答法：判断入口 + 分流规则 + 搭配锁。

### B. 词根家族地图

碎片、词根、前缀能长出哪些词。

- `stitute`
- `re- / con- 同根`
- `tempt`

回答法：前缀方向 + 家族地图 + 优先级 + 不硬凑。

### C. 中文同义分流

中文翻译一样或接近，但英语边界不同。

- `限制：limit / restrict / constrain / restrain`
- `推测：guess / infer / deduce / speculate / conclude`
- `影响：affect / effect / influence / impact`
- `遵守：comply / conform / abide by / obey`

回答法：不要从中文释义开始，直接给语义分流。

```text
限制：
设上限 → limit
规定不许超出 → restrict
外部条件卡住 → constrain
按住情绪/行为 → restrain
```

### D. 词性派生树

同根不同词性或派生后意义跑偏。

- `respect / respectful / respectable / respective`
- `economic / economical / economy / economics`
- `imaginary / imaginative / imaginable`

回答法：词根主干 + 派生分支 + 哪个已经跑偏。

### E. 搭配锁

意思相近，但介词或宾语固定。

- `comply with`
- `conform to`
- `abide by`
- `adapt to`
- `adjust to`

回答法：固定搭配优先，少讲抽象同义。

### F. 前缀方向图

前缀带来的空间、方向、关系混淆。

- `pre- / pro-`
- `trans- / inter- / intra-`
- `in- / im- / un- / dis-`

回答法：方向图 + 高频词，不做大全。

### G. 发音近似

听起来像，听力或口语里容易错。

- `weather / whether`
- `later / latter`
- `principal / principle`
- `through / thorough / though`

回答法：听感差异 + 句法位置 + 一两个固定搭配。

### H. 碎片召回

用户只记得一截或拼歪。

- `accomm...`
- `re...ct`
- `有个词里面有 -tain`

回答法：候选列表 + 置信度 + 追问，不低置信度硬猜。

### I. 场景错配

词义会，但使用场景放错。

- `economic / economical`
- `historic / historical`
- `classic / classical`
- `personal / personnel`

回答法：场景分流 + 固定名词搭配。

### J. 逻辑关系

阅读题里谁暗示、谁推断、谁导致。

- `imply / infer`
- `evidence / conclusion`
- `assume / presume / suppose`

回答法：角色分工。

```text
作者 imply
读者 infer
证据 support conclusion
```

## 下一阶段推荐优先级

### P0：先做回答风格与模式区分

不要先继续盲目扩 seed。先把回答形态定下来，让已有 P0 seed 和真实模型输出更像 EngGo。

建议第一刀：

1. `confusion_untangle` 回答风格：用于形近词、中文同义分流、搭配锁。
2. `root_family_summary` 回答风格：用于词根/前缀/碎片总结。
3. `eval:answer-style`：用 MiniMax key 跑 8-12 条真实问题，检查是否符合 EngGo 风格。

### P1：小批量补数据

在 P0 风格稳定后，再从 candidate pool 的 P1 里挑 8-12 组扩 seed。

优先选：

- `desert / dessert`
- `weather / whether`
- `later / latter`
- `beside / besides`
- `causal / casual`
- `eligible / illegible`
- `adverse / averse`
- `altitude / attitude`
- `dairy / diary`
- `through / thorough / though`

### P2：词根数据模型

如果 `root_family_summary` 要做得稳定，后续可能需要显式数据，而不是靠模型即兴。

候选结构：

- `root_family`
  - id
  - root fragment
  - core image
  - scope priority
- `root_family_member`
  - lemma
  - prefix
  - prefix direction
  - action story
  - modern meaning
  - priority: must_memorize / recognize / low_priority

本轮先不要建表，先用 spec + prompt + eval 证明回答形态。

## Answer Style Guardrails

### 通用禁止项

- 不要把回答写成泛泛词典百科。
- 不要新增 grounding 外的词作为主解释对象。
- 不要把合理句子误标成错误句，只能说“表达重点不同”。
- 不要硬凑不存在或低频到不值得背的组合。
- 不要给牵强口诀。口诀必须 3 秒内能复述，否则不要给。

### 易混解团输出要求

- 必须有“先问一句”。
- 必须有 2-4 个分流项。
- 必须有考试搭配或题眼。
- 允许一个短口诀，但不能替代判断入口。

### 词根家族地图输出要求

- 必须解释碎片为何不是完整词，或为何能作为构词部件。
- 必须按前缀方向展开。
- 必须标优先级。
- 必须说明“不成立 / 低频 / 不建议背”的分支。

## 建议下一 session 执行方式

下一 session 如果要直接实现，建议使用 `superpowers:subagent-driven-development`。

可拆成 3 个相对独立的 subagent 任务：

1. **Answer Style Explorer**
   - 读取 `build-system-prompt.ts`、`build-system-prompt.test.ts`、`run-shape-neighbor-eval.ts`
   - 输出当前 prompt 如何影响 MiniMax 回答，以及最小改动建议

2. **Query Mode / Normalization Explorer**
   - 读取 `normalize-query.ts`、`retrieve-candidates.ts`
   - 判断是否应先新增 `root_family_summary` query mode，还是先用 answer-style hint 不改 retrieval structure

3. **Eval Worker**
   - 新建或设计 `scripts/run-answer-style-eval.ts`
   - 覆盖 `stationary/stationery`、`transmit/transit`、`conform/comply/abide by`、`stitute`、`tempt`、`re/con 同根总结`
   - 检查未 grounding 词、是否有“先问一句”、是否过长、是否硬凑

注意：如果用户未明确授权 subagent，主 agent 不应擅自 spawn；但下个 session 可以向用户说明推荐使用 subagent，并在用户同意后并行推进。

## 下一 session 第一件事

1. 先读：
   - `progress.md`
   - `bugs.md`
   - 本文档
   - `docs/superpowers/plans/2026-04-23-shape-neighbor-p0-seed-expansion.md`
2. 复跑：
   - `corepack pnpm exec prisma dev ls`
   - `corepack pnpm exec tsx scripts/check-seed-content.ts`
   - `corepack pnpm eval:shape`
3. 基于本文创建正式 implementation plan：
   - 名字建议：`2026-04-23-enggo-answer-style-and-root-map.md`
   - 第一阶段只做 prompt/eval/query-mode 最小闭环，不直接新建 root 数据表。

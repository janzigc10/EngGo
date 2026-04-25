# Engineering Growth Log

这个文档用来记录我在 EngGo 项目里解决问题、修正判断和形成工程方法的过程。

它不是开发流水账，也不替代 `progress.md`。`progress.md` 记录项目交接；这里记录的是我作为开发者怎么理解问题、怎么做取舍、怎么验证方案，以及这些经历以后怎么转化成简历和面试里的工程故事。

## 记录方式

每条记录尽量回答这几个问题：

- 当时遇到的真实问题是什么？
- 我一开始怎么理解，有没有误判？
- 哪个信号让我重新思考？
- 我最后怎么重新建模或拆解问题？
- 我具体做了什么工程动作？
- 我怎么验证它真的变好了？
- 这件事让我学到了什么？
- 如果面试里讲，我应该怎么概括？

## 2026-04-25 Confusion Cluster 升级

### 当时的问题

我一开始以为“模糊搜索”主要是拼写相似、拼错召回，比如用户记得一个词长得像另一个词，系统帮他找出来。

但在和用户讨论、看用户发来的易混词截图之后，我意识到用户真正关心的不是单纯 fuzzy match，而是：学生脑子里容易混在一起的词，应该被系统主动组织到一起辨析。

这类词可能是形近，也可能是同词根、同前缀、中文意思接近、搭配边界接近。比如 `institute / institution / constitute / substitute`，它们不是普通拼错关系，而是应该放在一起记的一组词。

### 我最初的误判

我一开始复用了旧的 smoke case 去测试 404-entry 词库，这只能证明旧闭环没有被扩词破坏，不能证明新增词库或新分组真的有价值。

用户指出这个问题后，我意识到测试问题本身也要跟着产品目标变化。如果目标是验证新增的易混组能力，就不能继续只问旧题。

这个提醒让我重新理解：测试不是“跑过就行”，测试问题必须正面对准新能力。

### 关键转折

关键转折是把 `confusion group` 从“形近词组”升级成“学生应该放在一起辨析的一组词”。

这不是推翻旧系统，而是给旧系统加了一层更清楚的解释：

- 输入方式：用户可能通过 direct compare、shape search、root fragment、中文意思、拼错等方式进来。
- 知识组织：系统判断是 single entry，还是 confusion cluster。
- 回答样式：普通查词走 `standard_lookup`，易混组走 `confusion_untangle`，词根片段问题走 `root_family_summary`。

这样模型不需要自己猜“这题到底怎么讲”，检索层和数据层先把问题定位好，再让模型负责讲清楚。

### 具体方案

我给 confusion group 增加了轻量元数据：

- `labels`：说明成组原因，比如 `shape_like`、`root_family`、`exam_high_value`。
- `anchorPattern`：指出共同片段，比如 `stitute`、`respect`。
- `quickDistinction`：给模型最短辨析抓手。
- `examHook`：告诉模型考试里应该抓什么搭配、词性或题眼。

同时我改了 retrieval 和 prompt：

- 普通查词和显式 cluster compare 分开选组，避免 `institute 是什么意思` 被强行展开成词根家族。
- `institute substitute constitute 怎么分`、`跟 institute 一样那几个词怎么记` 这类问题会进入 `root-stitute` cluster。
- `confusion_untangle` prompt 会读 label：遇到 `root_family` 就补同根/共同片段视角，遇到 `shape_like` 就补形近/拼写边界。

### 验证结果

我跑了 deterministic eval 和真实 provider smoke。

本地 deterministic eval：

- `eval:answer-style` 10/10 pass。
- `real-smoke` 当前为 409 entries / 33 confusion groups。

真实 provider smoke 里，我问了这些问题：

- `stitute 是什么`
- `institute substitute constitute 怎么分`
- `跟 institute 一样那几个词怎么记`
- `tempt 这一族怎么记`
- `attempt tempt temptation contempt 怎么分`
- `跟 access 很像的词有哪些`
- `respect 那组词怎么分`
- `institute 是什么意思`
- `academic 是什么意思`

结果显示，cluster 相关问题明显变清楚：

- `institute / institution / constitute / substitute` 能按共同片段、词义、词性和搭配拆开。
- `tempt` 这一族不再被错误说成“不是完整单词”，而是写成“既是独立单词，也是构词核心碎片”。
- `access / assess / excess` 能按拼写和搭配边界讲。
- `respect / respective / respectful / respectable` 能点出 `respective` 不能按 `respect` 推成“尊敬的”。

也暴露了两个后续问题：

- `standard_lookup` 普通查词还偏啰嗦，比如 `academic 是什么意思` 会加例句和未召回词。
- `root_family_summary` 仍会点名低优先级范围外分支，后续可以更收束。

### 我学到的

这次最大的收获是：LLM 输出质量的提升，不一定来自更强的 few-shot，而常常来自更清楚的问题建模和更稳定的 grounding。

以前我更像是在教模型“你要像一个好老师”。这一版变成了“系统先准备好讲义，模型照着讲成一个好老师”。

few-shot 仍然有用，但它更适合当格式样板；真正决定答案是否清楚的是结构化材料：

- 这是不是易混组？
- 为什么这些词要放在一起？
- 哪个共同片段导致混淆？
- 哪两个最容易混？
- 考试里抓什么边界？
- 哪些词不能扩出去？

当这些信息提前被系统组织好，模型自然就能答得更稳、更短、更像产品想要的样子。

### 面试表述

我可以这样讲这段经历：

> 我在做一个面向考试英语的聊天式学习项目时，发现单纯 few-shot prompt 无法稳定解决易混词辨析。后来我把问题拆成输入分流、知识组织和回答样式三层，把原来的 confusion group 升级为带 label 的 confusion cluster，让检索层先判断这些词为什么应该放在一起，再把结构化 grounding 交给模型生成答案。升级后，真实 provider smoke 中 `institute / constitute / substitute`、`tempt / attempt / contempt`、`access / assess / excess` 等 case 的回答明显更清楚，说明效果提升主要来自问题建模和 grounding，而不是只靠 prompt 调参。

## 待补记录

后续可以继续补这些成长点：

- 从 demo seed 到 source-backed `real-smoke`：为什么不能直接抠商业词书，如何用官方 lemma source 做可审计范围。
- 低置信度 no-match：为什么宁可不答，也不能为了看起来聪明而硬猜。
- Windows + Prisma dev 环境坑：如何定位本地 DB 不健康，而不是误判业务代码回归。
- `standard_lookup` 收紧：如何把普通查词也从“模型自由讲”收成“短、准、基于 grounding”。

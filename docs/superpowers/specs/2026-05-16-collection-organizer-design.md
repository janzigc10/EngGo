# Collection Organizer 1.0 Design

## Goal

把聊天回答里已经收藏的词沉淀成可整理、可复习的数据资产。第一刀只整理本地收藏，不做账号、云同步、数据库迁移或复杂复习算法。

## Product Boundary

- 收藏页是学习闭环的第一站：用户先能看清自己收藏了哪些词、来自哪个考试范围、基础释义是否可靠。
- 复习卡片和进度统计依赖收藏数据的结构化字段，但本设计只为它们铺路，不实现完整复习流。
- 聊天主舞台继续负责产生 grounded answer；收藏动作只把当前候选的学习字段保存下来，不反向改变检索或回答策略。

## Data Model

LocalStorage 继续使用 `enggo.collectedWords`，按 exam target 分桶。旧数据仍兼容：

- `lemma`: 必填，展示词形。
- `note`: 必填，兼容旧收藏说明。
- `partOfSpeech`: 可选，优先来自候选的 ECDICT / structured POS。
- `meaningZh`: 可选，主展示短义；旧数据缺失时回退到 `note`。
- `sourceKind`: 可选，区分结构化词条、来源词表、外部基础词典。
- `reviewStatus`: 可选，目前只保留 `unreviewed`，用于标记外部基础释义。
- `collectedAt`: 保存/更新收藏时间。

同一 exam target 下按 lemma 去重；再次收藏同一 lemma 时更新内容和时间。

## UX

收藏页保持工作台式密度，不做营销型页面：

- 顶部显示总收藏数和当前整理状态。
- 每个考试范围一组，展示收藏数。
- 每条收藏显示 lemma、POS/短义、来源标签、收藏时间。
- 每条收藏提供删除动作。
- 每条收藏提供“继续追问”入口，回到聊天页并预填关于该词的追问草稿。

视觉 thesis：安静、像学习资料夹；信息密度比首页高，但保持移动端扫读。

内容 plan：状态概览、词书分组、词条操作、空状态。

交互 thesis：

- 收藏页随 localStorage 更新刷新。
- 删除后立即从当前页消失。
- “继续追问”把用户带回聊天主舞台，而不是在收藏页制造第二个聊天入口。

## Testing

- Store 单元测试覆盖结构化字段、去重更新、删除、旧数据兼容。
- AnswerActions 测试覆盖收藏动作写入 POS/meaning/source metadata。
- CollectionsPanel 组件测试覆盖分组展示、删除、继续追问链接。


# EngGo 项目地图

## 项目定位
EngGo 是一个面向高考、四级、六级、考研用户的聊天式英语学习平台。

它不是普通词书，也不是开放式英语问答壳。当前核心价值是：
- 用考试范围帮助用户缩小学习范围
- 从模糊记忆、拼写片段、中文表达或形近词中找回候选
- 讲清易混词、相近词和词形家族的边界
- 把命中的词条沉淀到收藏与后续复习流程

当前产品原则是：

> 范围优先，不范围专制。

RAG / 词库是证据系统，不是回答许可系统。命中范围时要明确标注、支持收藏；未命中当前小词库但用户意图清楚时，可以走 non-grounded `plain` 回答，但不能假装来自当前考试词库。

## 当前稳定能力
- 聊天式 MVP 主舞台已落地，首页是聊天工作台。
- 用户可选择并持久化当前考试目标。
- 数据库使用 Prisma + PostgreSQL，词库数据来自 `data/exam-vocab/`。
- `seed` 数据覆盖高考、四级、六级、考研；`real-smoke` 当前只覆盖高考、四级、六级。
- `real-smoke` 当前约 546 entries / 34 confusion groups，已进入 500-1000 词基础 RAG MVP 区间。
- 检索主线包括：
  - exact 普通查词
  - 中文核心义召回
  - typo / fuzzy recall
  - shape-neighbor / 易混词组
  - expression recall
  - root / fragment family recall
- 回答风格主线包括：
  - `standard_lookup`
  - `confusion_untangle`
  - `root_family_summary`
  - non-grounded `plain`
- UI 已支持受控 Markdown 子集渲染、表格渲染、命中状态摘要和收藏工具折叠。

## 当前边界
- 不把 `re+con` 这类语义/词根理论问题硬塞进词形过滤 parser；如果要支持，先定义产品边界。
- typo 不走全局阈值放宽，只走“唯一候选 + 明确拼写模式”的窄门。
- 普通查词 exact 命中不应自动带出裸 `confusion_group`。
- `postgrad` 暂不进入 `real-smoke`，除非找到 entry-level 可机读且可确认来源的官方词表。
- 不直接抠商业词书的完整释义、例句、辨析、助记和章节编排。
- embedding 只能作为语义召回补充，不作为形近词、考试范围和基础释义的主干。

## 代码地图
- `src/app/api/chat/route.ts`：聊天 API 入口，含 greeting short-circuit。
- `src/features/retrieval/`：query normalize、候选召回、root fragment recall、SQL 辅助。
- `src/features/answering/`：grounding 构建、system prompt、provider 调用、chat service。
- `src/features/chat/`：聊天类型、前端 session hook。
- `src/components/chat/`：聊天工作台、输入框、消息线程、答案渲染、收藏动作。
- `data/exam-vocab/seed/`：开发基础词库。
- `data/exam-vocab/real-smoke/`：source-backed 真实词库 smoke 数据。
- `prisma/`：schema、migration、seed 入口。
- `scripts/`：内容校验、deterministic eval、provider smoke runner。
- `tests/e2e/`：Playwright e2e。

## 文档地图
- 协作入口：`AGENTS.md`
- 当前交接：`progress.md`
- 环境坑和已知问题：`bugs.md`
- 长期项目地图：本文件
- 文档索引：`docs/README.md`
- 产品/技术 spec：`docs/superpowers/specs/`
- 已执行或历史 implementation plan：`docs/superpowers/plans/`
- 个人成长复盘：`docs/engineering-growth-log.md`

## 进入新任务时的阅读顺序
1. 读 `AGENTS.md`、`progress.md`、`bugs.md`
2. 需要长期背景时读 `context.md`
3. 需要定位历史设计时读 `docs/README.md`
4. 只打开与当前任务直接相关的 spec / plan
5. 最后进入代码、测试和真实 smoke

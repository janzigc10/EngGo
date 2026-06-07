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
- 默认词库来自 ECDICT CSV 和生成后的 compact JSON；Prisma + PostgreSQL 只保留为旧 structured overlay / 历史回归资产。
- `data/exam-vocab/ecdict-wordbook/` 当前约 7,348 entries，前端词书按 ECDICT tag-derived scope closure 组织。
- `seed` / `real-smoke` 是历史开发与回归数据，不再是 Learn / Review / Progress / Chat 的默认词书事实源。
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
- `/api/chat` 后端已迁移到 Python FastAPI；Next.js 只负责前端页面，浏览器通过 `chat-api-client` 直接请求 FastAPI。

## 当前边界
- 不把 `re+con` 这类语义/词根理论问题硬塞进词形过滤 parser；如果要支持，先定义产品边界。
- typo 不走全局阈值放宽，只走“唯一候选 + 明确拼写模式”的窄门。
- 普通查词 exact 命中不应自动带出裸 `confusion_group`。
- `postgrad` 暂不进入 `real-smoke`，除非找到 entry-level 可机读且可确认来源的官方词表。
- 不直接抠商业词书的完整释义、例句、辨析、助记和章节编排。
- embedding 只能作为语义召回补充，不作为形近词、考试范围和基础释义的主干。

## 代码地图
- `src/features/chat/chat-api-client.ts`：浏览器侧 FastAPI chat client，默认请求 `http://127.0.0.1:8000/api/chat`，可由 `NEXT_PUBLIC_ENGGO_FASTAPI_URL` 覆盖。
- `backend/app/`：Python FastAPI 聊天后端，包含 query normalize、候选召回、grounding、answer policy 和 provider 调用。
- `src/features/chat/`：聊天响应契约、前端 session hook 和短期会话上下文处理。
- `src/components/chat/`：聊天工作台、输入框、消息线程、答案渲染、收藏动作。
- `data/exam-vocab/seed/`：开发基础词库。
- `data/exam-vocab/real-smoke/`：source-backed 真实词库 smoke 数据。
- `prisma/`：schema、migration、seed 入口。
- `scripts/`：FastAPI-first dev/smoke 入口、HTTP 产品 smoke、provider smoke runner 和 ECDICT wordbook 生成。
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

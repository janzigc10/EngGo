# EngGo 滚动交接

## 当前阶段
产品设计与首份 MVP implementation plan 已完成，项目当前进入“按 plan 执行 + 仓库初始化”阶段。

## 本 Session 已完成
- 明确产品核心定位：考试范围内的模糊检索与易混词辨析
- 明确首版考试范围：高考、四级、六级、考研
- 明确首页形态：聊天主舞台
- 明确整体产品形态：聊天主舞台 + 学习骨架
- 完成产品设计 spec：
  - `docs/superpowers/specs/2026-04-21-exam-english-chat-design.md`
- 参考 `D:\student_time_plan` 的最新协作文档用法，重构当前项目的协作骨架
- 完成当前项目的协作文档落盘：
  - `AGENTS.md`
  - `context.md`
  - `progress.md`
  - `bugs.md`
- 复查当前 spec、协作文档与目录现状，确认下一步应先产出 MVP implementation plan，而不是直接开始仓库搭建或页面开发
- 完成首份 MVP implementation plan：
  - `docs/superpowers/plans/2026-04-21-enggo-chat-mvp.md`
- 明确首版技术方向不是“前后端立即分离”也不是“本地 JSON 原型栈”，而是：
  - `Next.js` 单体全栈
  - `PostgreSQL`
  - `Prisma`
  - 结构化检索优先，LLM 编排在后
- 完成技术架构设计落盘：
  - `docs/superpowers/specs/2026-04-21-enggo-technical-architecture-design.md`
- 将 implementation plan 升级为“可部署 MVP”版本，纳入数据库、迁移、seed、`pg_trgm` 与监控入口

## 当前优先级
1. 按 implementation plan 执行 Task 1：初始化可部署仓库骨架与聊天主舞台外壳
2. 执行 Task 2：建立 PostgreSQL schema、迁移与 seed 导入链路
3. 执行 Task 3：实现数据库驱动的考试范围检索、模糊召回与排序
4. 继续按 plan 顺序推进聊天 API、前端交互与学习骨架

## 下一 Session 第一件事
- 打开 `docs/superpowers/plans/2026-04-21-enggo-chat-mvp.md`，从 Task 1 开始逐 step 执行，并在每个 step 完成后立即勾选 checkbox。

## 当前阻塞 / 风险
- 当前目录不是独立 git 仓库，任何正式开发前都需要先解决仓库初始化与忽略策略问题。
- 当前还没有代码骨架，Task 1 之前无法验证任何真实交互链路。
- `DATABASE_URL` / `DIRECT_URL` / `OPENAI_API_KEY` 的环境配置会直接影响 Task 2 与 Task 4 的可执行性。
- 首版 seed 数据量与内容质量会直接影响 Task 3 之后的体验稳定性。

## 待办池
- 正式仓库初始化
- `.gitignore` 策略确定
- PostgreSQL 与部署环境配置落地
- 初始代码与测试基线建立

## 最近验证基线
- 产品方向已获用户确认
- 首页交互方向已通过可视化讨论收敛
- 当前尚无代码级测试基线，需在项目初始化后建立

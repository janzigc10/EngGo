# EngGo 滚动交接

## 当前阶段
已完成 Task 1 与 Task 2，项目进入“数据库驱动检索内核”阶段；下一步按 plan 执行 Task 3。

## 本 Session 已完成
- 完成 Task 1：仓库初始化、聊天主舞台首页外壳、Playwright 基线与首个提交。
- 完成 Task 2：PostgreSQL / Prisma 内容底座落地。
  - 建立 `ExamScope`、`VocabularyEntry`、`VocabularyAlias`、`VocabularyMeaning`、`ConfusionGroup`、`ConfusionGroupMember` schema
  - 落地 `src/lib/db.ts`、content import schema、seed loader、repository 最小接口
  - 补齐 `data/exam-vocab/seed/` 首版内容：34 条词条、8 组易混词，覆盖高考 / CET-4 / CET-6 / 考研
  - 生成初始迁移 SQL：`prisma/migrations/20260421060000_init_content/migration.sql`
  - 因当前 Windows + local Prisma Postgres 环境的 schema-engine 问题，采用 `prisma migrate diff --script` + `prisma db execute --file ...` workaround 应用本地 schema
  - 增加 seed 内容合同校验与事务回滚测试，修复“检查脚本只打印数量”和“seed 失败会半清空数据库”的风险
- `bugs.md` 已同步记录 Prisma 本地环境问题与当前 workaround。

## 当前优先级
1. 执行 Task 3：实现数据库驱动的考试范围检索、模糊召回与排序
2. 为 `pg_trgm` 设计并落地下一条 migration / workaround
3. 继续按 plan 推进聊天 API、前端交互与学习骨架

## 下一 Session 第一件事
- 打开 `docs/superpowers/plans/2026-04-21-enggo-chat-mvp.md`，从 Task 3 Step 1 开始，先写 retrieval 相关失败测试，再继续实现。

## 当前阻塞 / 风险
- 当前机器上的 `prisma migrate dev` / `prisma migrate resolve` 对 local Prisma Postgres 不稳定；Task 3 之后如继续新增 migration，仍需沿用 `migrate diff` + `db execute` workaround，或切换到标准 PostgreSQL 环境。
- `OPENAI_API_KEY` / `SENTRY_DSN` 尚未配置，会影响 Task 4 及上线前验证。

## 最近验证基线
- `pnpm test src/features/content/content-repository.test.ts`
- `pnpm test src/features/content/seed-content-rules.test.ts`
- `pnpm test src/features/content/seed-content.test.ts`
- `pnpm exec tsx scripts/check-seed-content.ts`
- `pnpm exec prisma db seed`
- 直连查询结果：`exam_scope=4`、`vocabulary_entry=34`、`confusion_group=8`

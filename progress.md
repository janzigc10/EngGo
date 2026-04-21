# EngGo 滚动交接

## 当前阶段
已完成 Task 1、Task 2、Task 3、Task 4，项目进入“聊天工作台、考试目标持久化与客户端交互”阶段；下一步按 plan 执行 Task 5。

## 本 Session 已完成
- 完成 Task 1：仓库初始化、聊天主舞台首页外壳、Playwright 基线与首个提交。
- 完成 Task 2：PostgreSQL / Prisma 内容底座落地。
  - 建立 `ExamScope`、`VocabularyEntry`、`VocabularyAlias`、`VocabularyMeaning`、`ConfusionGroup`、`ConfusionGroupMember` schema
  - 落地 `src/lib/db.ts`、content import schema、seed loader、repository 最小接口
  - 补齐 `data/exam-vocab/seed/` 首版内容：34 条词条、8 组易混词，覆盖高考 / CET-4 / CET-6 / 考研
  - 生成初始迁移 SQL：`prisma/migrations/20260421060000_init_content/migration.sql`
  - 因当前 Windows + local Prisma Postgres 环境的 schema-engine 问题，采用 `prisma migrate diff --script` + `prisma db execute --file ...` workaround 应用本地 schema
  - 增加 seed 内容合同校验与事务回滚测试，修复“检查脚本只打印数量”和“seed 失败会半清空数据库”的风险
- 完成 Task 3：数据库驱动检索、模糊召回与排序。
  - 实现 query mode 检测与输入归一化：`meaning_lookup` / `fuzzy_recall` / `direct_compare` / `direct_lookup`
  - 新增 `pg_trgm` 迁移：`prisma/migrations/20260421070000_enable_pg_trgm/migration.sql`
  - 实现 alias / lemma trigram 召回、应用层排序、易混组扩展与 direct compare 视图
  - 为匹配产品预期，补充 `comply` 的中文释义包含“遵从”
- 完成 Task 4：回答编排层、provider 抽象与聊天 API。
  - 新增 `.env.example`，补齐 `OPENAI_API_KEY` / `DATABASE_URL` / `DIRECT_URL` / `SENTRY_DSN` 样例
  - 用 `buildGrounding` 固定“主答案 -> 易混边界 -> 范围提醒 -> 下一步”的回答节奏
  - 新增 `buildSystemPrompt`、`chat-provider`、`chat-service` 与 `request-id`，让 retrieval grounding 进入模型请求
  - 落地 `POST /api/chat`：参数校验、调用 retrieval + chat service、缺失 `OPENAI_API_KEY` 时返回明确 `503`
  - 增加 `src/features/answering/chat-service.test.ts`，先红后绿覆盖 grounding 组织和 provider contract
- `bugs.md` 已同步记录 Prisma 本地环境问题与当前 workaround。

## 当前优先级
1. 执行 Task 5：实现聊天工作台、考试目标持久化与客户端交互
2. 把首页空壳接到 `/api/chat`，保持“聊天主舞台”而不是结果页
3. 为后续 Task 6 的收藏入口预留回答卡片操作区

## 下一 Session 第一件事
- 打开 `docs/superpowers/plans/2026-04-21-enggo-chat-mvp.md`，从 Task 5 Step 1 开始，先写 `ChatWorkspace` 的失败测试，再接考试目标持久化和 `/api/chat` 客户端调用。

## 当前阻塞 / 风险
- 当前机器上的 `prisma migrate dev` / `prisma migrate resolve` 对 local Prisma Postgres 不稳定；后续新增 migration 仍需沿用 `migrate diff` + `db execute` workaround，或切换到标准 PostgreSQL 环境。
- `OPENAI_API_KEY` / `SENTRY_DSN` 尚未配置；当前 `/api/chat` 已对缺失 key 返回明确 `503`，但真实模型联调和上线前验证仍会受阻。
- `corepack pnpm exec tsc --noEmit` 仍被仓库既有问题拦住，当前看到的是 `seed-content` 相关历史类型错误，不是本轮 `answering` / API 改动直接引入。

## 最近验证基线
- `pnpm test src/features/content/content-repository.test.ts`
- `pnpm test src/features/content/seed-content-rules.test.ts`
- `pnpm test src/features/content/seed-content.test.ts`
- `pnpm test src/features/retrieval/retrieve-candidates.test.ts`
- `pnpm exec tsx scripts/check-seed-content.ts`
- `pnpm exec prisma db seed`
- `corepack pnpm test src/features/answering/chat-service.test.ts`
- `corepack pnpm exec eslint 'src/features/answering/**/*.ts' 'src/app/api/chat/route.ts' 'src/features/observability/request-id.ts' 'src/lib/env.ts'`

# EngGo 滚动交接

## 当前阶段
已完成 Task 1 至 Task 7。项目状态是“chat-first MVP 的实现与验证闭环已跑通，当前进入提交/后续规划阶段”。

## 本 Session 已完成
- 完成 Task 6：接入轻量学习骨架与收藏入口。
- 新增 `src/features/collections/collection-store.ts`，按考试目标分组持久化收藏词条，并把存储边界收敛为可替换 repository。
- 在回答卡片新增 `src/components/chat/answer-actions.tsx`，支持“加入收藏”轻动作，成功后就地反馈，不打断聊天主链路。
- 落地 `/collections`、`/learn`、`/review`、`/progress` 二级页面骨架，并把顶部导航接成可点击入口。
- 为收藏链路补充脏数据兜底与持久化状态回读，避免旧 localStorage 数据导致收藏崩溃，也避免答案卡片在重挂载后误显示“加入收藏”。
- 完成 Task 7 Step 1-3：
  - 新增 `tests/e2e/chat-mvp.spec.ts`，覆盖“切换考试目标 -> 提问 -> 得到主答案 -> 加入收藏 -> 在 `/collections` 看见词条”。
  - 更新 `package.json`，补齐 `test:e2e`、`db:migrate`、`db:seed`、`verify`，并修正 `test` 脚本以支持按文件运行。
  - 重写 `README.md`，补上环境变量、首次启动、Prisma migrate / seed、seed 数据格式、`pnpm verify`、部署方式和 Windows + local Prisma Postgres workaround。
- 修正 `vitest.config.ts`，把 `tests/e2e/**` 排除出 Vitest，避免 `verify` 时把 Playwright spec 当成单元测试执行。
- 完成 Task 7 Step 4-5：
  - 将 `src/features/content/seed-content.ts` 改为使用原生 `pg` 单连接事务导入内容，保留回滚语义，同时绕开 Windows + local Prisma Postgres 下 Prisma transaction 不稳定的问题。
  - 将 `retrieve-candidates.test.ts` 中的 seed 调用改为项目内 `corepack pnpm db:seed`，不再走 `npx pnpm@latest exec prisma db seed`。
  - 将验证脚本拆成 `test:unit` + `test:integration`；`verify` 改为分阶段执行普通 Vitest、数据库集成测试和 Playwright，避免数据库测试与长生命周期 Vitest 进程互相污染。
  - 在重建本地 `prisma dev` 实例并重新执行 `pnpm db:migrate` 后，`corepack pnpm verify` 已全绿通过。
- 通过 subagent 完成 Task 6 主实现、规格审查、代码质量复审；Task 7 的实现也由 subagent 起草，主线程补了脚本/验证层收尾。

## 当前优先级
1. 决定当前分支的提交/整理方式，并准备进入下一轮产品或工程计划。
2. 若继续在本地 Windows + Prisma dev 环境开发，先检查实例健康度；如有陈旧状态，先重建再继续。
3. 下一阶段优先补齐真实 `OPENAI_API_KEY` 联调、上线前环境变量和后续产品计划。

## 下一 Session 第一件事
- 先执行 `corepack pnpm exec prisma dev ls` 或直接用 `pg` 连一次 `DATABASE_URL`，确认 `enggo` 本地库是否健康。
- 如果库实例又出现 `Connection terminated unexpectedly` / `Server has closed the connection`，先 `prisma dev rm enggo --force` 重建，再执行 `pnpm db:migrate`。

## 当前阻塞 / 风险
- 本地 `prisma dev` 环境存在两层问题：
  - 服务器元数据可能损坏，导致 `prisma dev start enggo` 因陈旧 PID 失效，需要 `prisma dev rm enggo --force` 后重建。
  - 即使代码层已经绕开部分 transaction 问题，只要实例本身进入坏状态，仍会出现 `Connection terminated unexpectedly` / `Server has closed the connection`，需要先重建实例再继续验证。
- `OPENAI_API_KEY` / `SENTRY_DSN` 尚未配置；当前 `/api/chat` 已对缺失 key 返回明确 `503`，但真实模型联调和上线前验证仍会受阻。
- `corepack pnpm exec tsc --noEmit` 仍被仓库既有 `seed-content` 历史类型错误拦住，不是本轮 Task 6 / Task 7 引入的问题。

## 最近验证基线
- `corepack pnpm test src/features/collections/collection-store.test.ts`
- `corepack pnpm test src/components/chat/answer-actions.test.tsx`
- `corepack pnpm test src/components/chat/chat-workspace.test.tsx`
- `corepack pnpm exec eslint src/features/collections/collection-store.ts src/features/collections/collection-store.test.ts src/components/chat/answer-actions.tsx src/components/chat/answer-actions.test.tsx`
- `corepack pnpm exec playwright test tests/e2e/collection-flow.spec.ts`
- `corepack pnpm exec playwright test tests/e2e/chat-mvp.spec.ts`
- `corepack pnpm db:migrate`
- `corepack pnpm db:seed`
- `corepack pnpm verify`
  - 结果：PASS（前置条件是本地 `prisma dev` 实例先处于健康状态；本次通过前执行过重建）。

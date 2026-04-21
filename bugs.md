# EngGo 已知问题与环境坑

## 当前确认问题
- 当前 Windows 环境下，`Prisma 7.7.0 + local Prisma Postgres (prisma dev)` 的 schema-engine 命令不稳定：
  - `pnpm exec prisma migrate dev --name init_content` 会报 `P1017 Server has closed the connection`
  - `pnpm exec prisma migrate resolve --applied ...` 会报 `unexpected message from server` 或 `prepared statement already exists`
  - 当前仓库里的 `pnpm db:seed` 已切到原生 `pg` 单连接事务，健康实例下可以稳定导入；但 Prisma 自己的 schema-engine / transaction 相关命令仍可能掉线
  - 当前项目 workaround：先用 `prisma migrate diff --script` 生成 `prisma/migrations/.../migration.sql`，再用 `prisma db execute --file ...` 应用到本地开发库
- 当前 Windows + local Prisma Postgres 实例在进入坏状态后，连原生 `pg` 的 `SELECT 1` 也可能报 `Connection terminated unexpectedly` / `read ECONNRESET`：
  - `prisma dev ls` 仍可能显示 `running`，但并不代表 TCP 连接健康
  - 当前恢复路径仍然是 `prisma dev rm enggo --force` 后按原端口重建，再重新执行 `pnpm db:migrate`
- 数据库集成测试不适合继续和普通 Vitest 用例放在同一个长生命周期进程里执行：
  - 当前项目 workaround 是把 `verify` 拆成 `test:unit` + `test:integration` + `test:e2e`
  - `test:integration` 中的数据库测试按文件单独启动进程，可以避免本地 Prisma dev 实例在长进程里更容易掉线
- 某些终端直接读取中文 Markdown 会出现乱码显示；文件内容本身未损坏，必要时用编辑器确认。
- `rg.exe` 在当前环境可能不可用或报 `Access is denied`，检索时需要准备 PowerShell 回退方案。

## 已处理
- 项目已经完成独立 git 初始化，不再有“落到 C:\ 根 git”的问题。
- `.gitignore` 基础策略已经落地。
- Task 1 聊天主舞台外壳已完成并提交。

## 后续关注
- 正式部署前，需要在标准 PostgreSQL 环境里重新验证常规 Prisma migration 流程。
- Task 4 开始前，需要补齐 `OPENAI_API_KEY`；上线前还要补 `SENTRY_DSN` 等环境变量。

## 不要重复走的失败路径
- 不要在没有 implementation plan 的情况下直接开始大规模搭项目。
- 不要把首页做回“搜索结果页”或“词书首页”。
- 不要把 `.superpowers/brainstorm/` 里的探索页面误当成正式前端实现。
- 不要在未确认设计变更时直接改实现；先记录问题，再决定是否调整 spec / plan。

## 本 Session 新确认
- 当前本地 `prisma dev` 服务器的状态元数据可能损坏：
  - `prisma dev ls` 会显示 `enggo` 仍然存在，但 `start` 可能因为陈旧 PID 失败
  - 可用的恢复路径是先 `prisma dev rm enggo --force`，再用原端口重建：`prisma dev -n enggo -d -p 51213 -P 51214 --shadow-db-port 51215`
  - 重建后需要重新执行 `pnpm db:migrate` 和 `pnpm db:seed`
- `pnpm verify` 已在当前仓库通过，但前提是：
  - 先保证本地 `prisma dev` 实例健康；如实例已坏，需要先重建
  - 使用当前仓库里的分阶段验证脚本，而不是把数据库集成测试继续塞回同一个 `vitest run`
- 正式部署前，仍建议在标准 PostgreSQL 环境里复跑一次迁移与验证闭环；那会比本地 Prisma dev 更接近真实部署环境。

# EngGo 已知问题与环境坑

## 当前确认问题
- 当前 Windows 环境下，`Prisma 7.7.0 + local Prisma Postgres (prisma dev)` 的 schema-engine 命令不稳定：
  - `pnpm exec prisma migrate dev --name init_content` 会报 `P1017 Server has closed the connection`
  - `pnpm exec prisma migrate resolve --applied ...` 会报 `unexpected message from server` 或 `prepared statement already exists`
  - 但 `pnpm exec prisma db execute --file ...`、`pnpm exec prisma generate`、`pnpm exec prisma db seed` 与通过 `pg` 直连的读写都正常
  - 当前项目 workaround：先用 `prisma migrate diff --script` 生成 `prisma/migrations/.../migration.sql`，再用 `prisma db execute --file ...` 应用到本地开发库
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

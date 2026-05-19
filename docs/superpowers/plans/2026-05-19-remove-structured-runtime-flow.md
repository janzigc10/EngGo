# Remove Structured Runtime Flow Plan

## Goal

验证一个实验方向：聊天 `/api/chat` 运行主流程不再依赖 structured DB。现有 structured 数据、schema、Prisma 迁移和种子文件先保留，但 FastAPI chat runtime 默认不创建、不连接、不查询 `StructuredLookupRepository`。

## Non-Goals

- 不物理删除 structured 数据、Prisma schema、迁移或 seed。
- 不新增发音、讲题、完整语法老师等新能力。
- 不把 provider 当成随意编 grounding 的来源。
- 不重写前端 UI。

## Acceptance Contract

- DB/Prisma dev 不启动时，现有六类聊天能力都不能返回 500：
  1. 普通查词
  2. direct compare
  3. shape neighbors
  4. form/fragment filter
  5. word family
  6. meaning lookup / 中译英表达召回
- structured DB 只能作为未来 overlay 保留，不能是当前 chat runtime 必需依赖。
- ECDICT 是基础词库底座；规则层负责过滤和组织候选；provider 只在明确 fallback contract 允许时参与。

## Tasks

- [x] Task 1: 盘点并切断 FastAPI chat runtime 的 structured repository 必经依赖。
  - `create_app()` 默认不再因为 `DATABASE_URL` 存在就创建 `StructuredLookupRepository` 给聊天 service。
  - 聊天 services 需要能在 repository 为 `None` 或 DB-free 模式下工作。
  - 保留 repository 类和已有 DB 测试，不做物理删除。

- [x] Task 2: 补齐 ECDICT-first runtime services 的六类能力底线。
  - ordinary lookup 继续走 ECDICT/source lemma。
  - direct compare 在无 structured DB 时能基于 ECDICT 两词返回基础对比。
  - shape/form/fragment/word family 继续基于 ECDICT 候选池。
  - meaning lookup / 中译英在无 structured DB 时不能 500；先走 ECDICT 中文释义搜索，找不到再按安全 plain/provider fallback 或保守 no-match。

- [x] Task 3: 建立 DB-free smoke 矩阵并同步文档。
  - 每类能力至少一个 no-DB smoke case。
  - 覆盖用户刚遇到的 `遵循的英文是什么`、`活动的英文是什么`。
  - 更新 `progress.md` / `bugs.md`，说明 structured 数据仍保留但已从 chat 主流程拿出。

## Verification

- RED/GREEN focused backend tests for each changed behavior.
- `corepack pnpm test scripts/lib/fastapi-db-unavailable-smoke.test.ts scripts/lib/fastapi-migrated-slice-smoke.test.ts`
- Live no-DB FastAPI smoke against a bad DB URL.
- Next proxy smoke for representative queries after restarting the dev stack.

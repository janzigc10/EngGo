# ECDICT Tag Scope Closure V1 执行计划

## 目标
把“用户选中的词书”统一为 ECDICT tag-derived scope closure，并覆盖 Learn / Review / Progress / Chat / FastAPI 检索 / E2E，修复 CET-6 不继承高考和 CET-4 基础词导致的 `activity` 漏召回。

## Scope
- 保留 `cet6-foundation-v1` 作为默认词书 ID。
- 新增四级 scope closure helper，前后端分别落地。
- 重新生成 `data/exam-vocab/ecdict-wordbook/entries.json`，直接从 ECDICT tag 生成 direct `examScopes`。
- 前端词书 registry 生成高考 / CET-4 / CET-6 / 考研四本词书。
- 聊天请求携带 active wordbook 观测字段，并让 exam target 切换同步 active wordbook。
- FastAPI 的 scope membership 改为 closure 判断；Next 只保留前端和 `/api/chat` 薄代理。
- 补 focused tests 与 E2E matrix。

## Tasks
- [x] Task 1：审核当前词书生成、聊天检索、E2E matrix 的真实入口。
- [x] Task 2：实现 ECDICT tag-derived wordbook 数据生成与前端 scope closure registry。
- [x] Task 3：实现后端 scope closure helper，并接入 ordinary / advanced / broad / dynamic retrieval。
- [x] Task 4：补 active wordbook 与 exam target 同步，并完成旧 TypeScript retrieval 退役前的边界核对。
- [x] Task 5：补 backend / frontend / E2E 测试并跑验证。
- [x] Task 6：更新 `progress.md` / `bugs.md` / `docs/README.md`，完成交接审计。

## 验收矩阵
- `activity` direct tag 是 `gaokao` / `cet4` 时，CET-6 meaning lookup 仍优先返回 `activity`。
- CET-6 词书包含直接 `gaokao` / `cet4` / `cet6` entries。
- CET-4 词书包含直接 `gaokao` / `cet4` entries，但不包含直接 `cet6` / `postgrad` entries。
- 考研词书包含 `ky`，并继承低级别基础词。
- `anti+xyz` / `re+con+sub` 等 root / prefix 边界仍保持 bounded no-match，不因 scope closure 放宽。

## 验证记录
- `corepack pnpm exec tsx scripts\generate-ecdict-wordbook.ts` -> 7348 entries；direct scopes：Gaokao 3678 / CET-4 3832 / CET-6 5390 / Postgrad 4794；closure wordbooks：Gaokao 3678 / CET-4 5299 / CET-6 7046 / Postgrad 7348。
- `C:\Users\Chen\anaconda3\python.exe -m pytest -q --basetemp tmp_pytest_scope_closure_full -p no:cacheprovider` -> 361 passed。
- `corepack pnpm test src\features\wordbook\wordbook-data.test.ts src\features\wordbook\wordbook-active-store.test.ts src\features\wordbook\wordbook-progress-store.test.ts src\features\wordbook\study-session.test.tsx src\features\wordbook\session-engine.test.ts src\features\collections\study-panels.test.tsx` -> 6 files / 79 tests passed。
- `corepack pnpm test src\features\exam-target\scope-closure.test.ts src\components\chat\chat-workspace.test.tsx src\features\chat\conversation-context.test.ts scripts\lib\conversational-learning-context-smoke.test.ts` -> 4 files / 43 tests passed。
- `corepack pnpm lint -- ...changed TS/TSX files...` -> passed。
- `C:\Users\Chen\anaconda3\python.exe scripts\run-model-routing-e2e-compare.py` -> 37 total / 37 pass / 0 fail / 24 changed；新增 `活动的英文是什么` 断言 current main first 为 `activity`。
- `git diff --check` -> passed，仅 Windows LF -> CRLF warnings。
- Legacy cleanup 后复核：`corepack pnpm test:unit` 在 sandbox 里仍会因 Windows 权限报 `EPERM ...\vitest.mjs`；同一命令在真实工作区权限下通过，31 files / 244 tests passed。旧 `src/features/retrieval/retrieve-candidates.test.ts` 已删除，不再作为 scope closure gate。

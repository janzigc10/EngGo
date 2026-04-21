# EngGo

EngGo 是一个面向高考、四级、六级、考研用户的聊天式英语学习平台。当前 MVP 的主舞台是聊天工作台，重点能力是考试范围内的模糊检索、中文提问理解、易混词辨析，以及收藏进入后续学习流程。

## 环境要求

- Node.js 20 或更高
- pnpm 10.x
- PostgreSQL

推荐先启用 Corepack：

```bash
corepack enable pnpm
```

## 环境变量

把 `.env.example` 复制成 `.env`，然后填写下面这些值：

```bash
OPENAI_API_KEY=
DATABASE_URL=
DIRECT_URL=
SENTRY_DSN=
```

- `DATABASE_URL`：应用运行时使用的数据库连接串，Prisma Client 会读它。
- `DIRECT_URL`：Prisma CLI / migrate 使用的直连地址，特别适合池化连接或某些本地 Prisma Postgres 环境。
- `OPENAI_API_KEY`：真实调用 `/api/chat` 时必需；缺失时接口会按设计返回 `503`。
- `SENTRY_DSN`：可选，当前没有配置也不影响本地开发和验证。

## 首次启动

1. 安装依赖。

```bash
pnpm install
```

2. 配置 `.env`。
3. 执行数据库迁移。

```bash
pnpm db:migrate
```

4. 导入 seed 数据。

```bash
pnpm db:seed
```

5. 启动开发服务器。

```bash
pnpm dev
```

## 数据库维护

- `pnpm db:migrate` 会执行 `prisma migrate deploy`，适合已有 migrations 的环境和部署阶段。
- `pnpm db:seed` 会执行 `prisma db seed`，把 `data/exam-vocab/seed/` 中的词表和易混组导入数据库。
- `pnpm build` / `pnpm start` 前，建议先保证数据库迁移和 seed 已经完成。

## Seed 数据格式

`data/exam-vocab/seed/entries.json` 必须是 JSON 数组，每个词条至少包含这些字段：

- `id`
- `lemma`
- `aliases`
- `pos`
- `meaningsZh`
- `examScopes`
- `examples`
- `collocations`

`data/exam-vocab/seed/confusion-groups.json` 也是 JSON 数组，每个易混组至少包含这些字段：

- `id`
- `members`
- `teachFirst`
- `whyConfusing`

可选字段包括 `commonMisusePoints`、`semanticBoundaryNotes`、`memberNotes`。

约束规则：

- `examScopes` 只能使用 `gaokao`、`cet4`、`cet6`、`postgrad`
- 词条和易混组的字符串值都应保持非空
- 易混组 `members` 至少 2 个词
- `teachFirst` 应该出现在 `members` 中

seed 导入会在本地做校验，格式不对会直接报错。

## 验证

```bash
pnpm verify
```

`pnpm verify` 会依次运行：

- `pnpm lint`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`

当前 e2e 会 mock `/api/chat`，所以本地跑 `verify` 不需要先配置 `OPENAI_API_KEY`。

## 部署

基础部署流程如下：

1. 部署前准备好生产环境变量，至少包括 `DATABASE_URL`、`DIRECT_URL`、`OPENAI_API_KEY`。
2. 安装依赖。
3. 运行 `pnpm db:migrate`。
4. 运行 `pnpm db:seed`。
5. 执行 `pnpm build`。
6. 启动 `pnpm start`，或交给支持 Next.js 的平台运行。

如果部署平台支持独立的数据库迁移步骤，建议把迁移和 seed 放到发布流水线里，而不是应用启动时。

## Windows + local Prisma Postgres workaround

当前仓库在 Windows + local Prisma Postgres 环境下，`prisma migrate dev` 和 `prisma migrate resolve` 可能不稳定。首次建立迁移时，优先用下面这条路线：

```bash
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/<timestamp>_init_content/migration.sql
pnpm exec prisma db execute --file prisma/migrations/<timestamp>_init_content/migration.sql
pnpm db:migrate
pnpm db:seed
```

如果后续再新增迁移，而 `migrate dev` 继续报 schema-engine 连接问题，也沿用同样思路：先 `migrate diff` 生成 SQL，再用 `db execute` 应用到数据库。

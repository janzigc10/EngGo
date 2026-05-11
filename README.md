# EngGo

EngGo 是一个面向高考、四级、六级、考研用户的聊天式英语学习平台。它的目标不是做普通词书，也不是做泛泛的英语聊天机器人，而是用考试范围、真实词库和模糊检索能力，帮助学生更快定位“这个阶段该学什么、哪些词容易混、应该怎么区分”。

## 项目亮点

- **聊天式学习入口**：用户可以直接用中文或中英混合提问，例如“access assess excess 怎么区分”“tion 结尾的词有哪些”“complex 和 complicate 是一个意思吗”。
- **考试范围优先**：回答优先结合当前考试目标和词库证据；未命中当前小词库时，也可以给出普通英语学习回答，但不会伪装成范围命中。
- **模糊检索与纠错**：支持 exact lookup、中文核心义召回、形近词检索、拼写 typo 候选确认、词根/后缀/碎片检索。
- **易混词辨析**：针对形近、义近、搭配相似的词，输出“词义速览 / 重点区分 / 做题抓手”式解释，而不是只给词典释义。
- **可验证工程闭环**：项目包含 seed 校验、deterministic smoke、provider smoke、React/Vitest 测试和 Playwright E2E。

## 我在项目中完成的工作

- 搭建 Next.js + Prisma + PostgreSQL 的聊天式 MVP。
- 设计并实现结构化词库数据模型，覆盖词条、词性、中文核心义、考试范围和易混组。
- 实现 retrieval -> grounding -> prompt -> provider -> UI 的回答链路。
- 设计 `standard_lookup`、`confusion_untangle`、`root_family_summary`、`plain` 等回答分支。
- 建立真实词库 smoke 数据集，当前 `real-smoke` 约 546 entries / 34 confusion groups。
- 为普通查词、形近词、typo、词根碎片、answer policy 和 UI 展示建立回归测试。
- 优化移动端阅读体验，包括 Markdown 表格渲染、命中状态摘要和收藏工具折叠。

## 示例能力

| 用户问题 | 系统行为 |
| --- | --- |
| `institute 是什么意思` | exact lookup，短解释核心义，不主动带出未请求的易混词 |
| `access assess excess 怎么区分` | 进入易混词辨析，说明每个词的核心义和做题边界 |
| `tion 结尾的词有哪些` | 结构化 suffix 检索，返回当前范围内词表和核心义 |
| `reqxust 是什么意思` | 识别为疑似拼写问题，给出候选确认，不标记为词库命中 |
| `complex 和 complicate 是一个意思吗` | 当前词库未命中时走普通英语学习回答，不显示命中状态 |
| `re+con 的词根有什么词` | 保守 no-match，避免硬造不稳定词根家族 |

## 技术栈

- **Frontend**：Next.js 16, React 19, Tailwind CSS
- **Backend**：Python FastAPI；Next.js `/api/chat` 仅作为前端侧薄代理
- **Database**：PostgreSQL, Prisma 7
- **LLM Provider**：OpenAI-compatible API abstraction
- **Testing**：Vitest, React Testing Library, Playwright
- **Tooling**：TypeScript, ESLint, pnpm, Corepack

## 架构概览

```text
User query
  -> Next.js UI
  -> Next /api/chat proxy
  -> FastAPI /api/chat
  -> retrieval / grounding / answer policy
  -> provider / deterministic fallback
  -> chat UI rendering
```

关键目录：

- `src/app/api/chat/route.ts`：Next 前端侧聊天代理，默认转发到 `http://127.0.0.1:8000/api/chat`。
- `backend/app/`：FastAPI 聊天后端，包含检索、grounding、answer policy 和 provider 调用。
- `src/features/retrieval/`：legacy TypeScript 检索实现，保留作测试、对照和回滚参考，不再是 Next `/api/chat` 默认后端。
- `src/features/answering/`：legacy TypeScript 回答实现，保留作测试、对照和回滚参考。
- `src/components/chat/`：聊天界面、答案渲染、收藏动作。
- `data/exam-vocab/`：seed 与 real-smoke 词库数据。
- `scripts/`：内容校验、产品 smoke、provider smoke。
- `docs/`：产品设计、实现计划和文档索引。

## 数据说明

- `data/exam-vocab/seed/`：开发基础数据，覆盖 `gaokao`、`cet4`、`cet6`、`postgrad`。
- `data/exam-vocab/real-smoke/`：source-backed 真实词库 smoke 数据，当前覆盖 `gaokao`、`cet4`、`cet6`。
- `postgrad` 暂未进入 `real-smoke`，因为仍缺少 entry-level、可机读、可确认来源的官方词表。
- 商业词书的完整释义、例句、辨析和助记没有直接抠入仓库。

## 本地运行

环境要求：

- Node.js 20+
- pnpm 10.x
- PostgreSQL
- Python 3.12 或本机 Anaconda Python

启用 Corepack：

```bash
corepack enable pnpm
```

安装依赖：

```bash
pnpm install
```

复制 `.env.example` 为 `.env`，并填写：

```bash
OPENAI_API_KEY=
DATABASE_URL=
DIRECT_URL=
SENTRY_DSN=
```

数据库迁移和 seed：

```bash
pnpm db:migrate
pnpm db:seed
```

启动 FastAPI + Next 开发栈：

```bash
corepack pnpm dev:fastapi
```

默认端口：FastAPI `8000`，Next `3000`。如需覆盖：

```bash
ENGGO_FASTAPI_PORT=8010 ENGGO_NEXT_PORT=3010 corepack pnpm dev:fastapi
```

## 验证命令

基础验证：

```bash
pnpm verify
```

常用产品 smoke：

```bash
corepack pnpm eval:product-smoke
corepack pnpm eval:default-fastapi-smoke
corepack pnpm eval:answer-style
corepack pnpm eval:lookalike:real-smoke
corepack pnpm eval:standard-lookup:provider
```

最近一轮记录过的验证基线包括：

- `corepack pnpm eval:default-fastapi-smoke`：13/13 migrated proxy smoke + 38/38 HTTP product proxy smoke
- `corepack pnpm eval:product-smoke`：38 total / 38 pass / 0 fail
- Answer Policy / spelling-assist 相关 focused tests：3 files / 23 tests passed
- Root fragment condition parser focused tests：5 files / 107 tests passed
- `real-smoke` 内容校验：546 entries / 34 confusion groups / scopes=gaokao, cet4, cet6

## 文档入口

- `docs/README.md`：文档索引。
- `context.md`：长期项目地图。
- `progress.md`：当前交接和下一步。
- `bugs.md`：环境坑、恢复路径和产品残留。
- `docs/superpowers/specs/`：产品和技术设计文档。
- `docs/superpowers/plans/`：历史 implementation plans。

## 当前状态

项目处于 MVP + 产品能力打磨阶段。当前优先事项是继续验收普通查词 exact lookup 是否干净，防止范围话术、裸易混组或主动扩词回流；之后再决定继续扩 `real-smoke` 数据集，还是推进泛化词根/碎片检索。

Windows + local Prisma Postgres 在本机开发时偶发不稳定，恢复路径记录在 `bugs.md`。

# EngGo

EngGo 是一个面向高考、四级、六级、考研用户的聊天式英语学习平台。它的目标不是做普通词书，也不是做泛泛的英语聊天机器人，而是用考试范围、真实词库和模糊检索能力，帮助学生更快定位“这个阶段该学什么、哪些词容易混、应该怎么区分”。

## 项目亮点

- **聊天式学习入口**：用户可以直接用中文或中英混合提问，例如“access assess excess 怎么区分”“tion 结尾的词有哪些”“complex 和 complicate 是一个意思吗”。
- **ECDICT 大词库底座**：以 ECDICT 作为默认词库来源，旧结构化 DB 保留为冻结覆盖层和历史回归资产。
- **考试范围优先**：回答优先结合当前考试目标和词库证据；未命中当前范围时，可以给出有边界的普通英语学习回答，但不会伪装成范围命中。
- **模糊检索与纠错**：支持 exact lookup、中文核心义召回、形近词检索、拼写 typo 候选确认、词根/后缀/碎片检索。
- **易混词辨析**：针对用户明确提到的词，使用词典 grounding 交给大模型组织短中文辨析，避免把普通词典释义包装成伪人工易混图谱。
- **词书学习闭环**：提供 Learn / Review / Progress 本地学习流程，支持学习队列、复习调度、错词回流、进度持久化和进行中 session 恢复。
- **可验证工程闭环**：项目包含 seed 校验、deterministic smoke、provider smoke、React/Vitest 测试和 Playwright E2E。

## 我在项目中完成的工作

- 搭建 Next.js + FastAPI 的聊天式学习应用，Next.js 作为 React 前端壳，浏览器聊天请求直接调用 FastAPI。
- 设计并实现“用户意图识别 -> 词库检索 -> grounding 构造 -> 大模型生成”的回答链路，覆盖查词、中文释义召回、易混词辨析、词形/词根召回和多轮追问。
- 接入 ECDICT 作为默认大词库底座，并实现 ECDICT tag-derived wordbook 生成管线，当前 compact dataset 约 7,348 entries。
- 将 direct compare 从人工 confusion graph 依赖调整为 ECDICT-grounded provider 辨析：用户问两个词区别时，优先用 ECDICT candidates grounding，让 provider 生成短中文边界解释。
- 实现 Learn / Review / Progress 本地学习闭环，支持词书队列、复习调度、错词回流、进度持久化、10/20/30 词 session 设置和 active session 恢复。
- 为普通查词、形近词、中文释义召回、词形碎片、direct compare、conversation context、wordbook Learn/Review 和 UI 展示建立回归测试与 smoke 验证。

## 示例能力

| 用户问题 | 系统行为 |
| --- | --- |
| `institute 是什么意思` | exact lookup，短解释核心义，不主动带出未请求的易混词 |
| `access assess excess 怎么区分` | 进入易混词辨析，说明每个词的核心义和做题边界 |
| `tion 结尾的词有哪些` | 结构化 suffix 检索，返回当前范围内词表和核心义 |
| `reqxust 是什么意思` | 识别为疑似拼写问题，给出候选确认，不标记为词库命中 |
| `complex 和 complicate 是一个意思吗` | 当前词库未命中时走普通英语学习回答，不显示命中状态 |
| `restrain 和 constrain 的区别` | 使用 ECDICT candidates grounding，让大模型生成短中文辨析 |
| `re+con 的词根有什么词` | 按词形候选保守整理，并提示不硬说成固定词根家族 |

## 技术栈

- **Frontend**：Next.js 16, React 19, Tailwind CSS
- **Backend**：Python FastAPI；Next.js 只作为前端壳，不再提供聊天代理后端
- **Data / Database**：ECDICT CSV / generated compact JSON；PostgreSQL + Prisma 7 保留作结构化覆盖层和历史回归资产
- **LLM Provider**：OpenAI-compatible API abstraction
- **Testing**：Vitest, React Testing Library, Playwright
- **Tooling**：TypeScript, ESLint, pnpm, Corepack

## 架构概览

```text
User query
  -> Next.js UI
  -> FastAPI /api/chat
  -> retrieval / grounding / answer policy
  -> provider / deterministic fallback
  -> chat UI rendering
```

关键目录：

- `src/features/chat/chat-api-client.ts`：浏览器侧 FastAPI chat client，默认调用 `http://127.0.0.1:8000/api/chat`。
- `backend/app/`：FastAPI 聊天后端，包含检索、grounding、answer policy 和 provider 调用。
- `src/features/chat/`：聊天响应契约、前端 session hook 和短期会话上下文处理。
- `src/components/chat/`：聊天界面、答案渲染、收藏动作。
- `src/features/wordbook/`：Learn / Review / Progress 本地学习状态机和 UI。
- `data/exam-vocab/`：seed、real-smoke 和 generated ECDICT compact 词库数据。
- `scripts/`：FastAPI-first dev stack、HTTP 产品 smoke、provider smoke 和 ECDICT wordbook 生成。
- `docs/`：产品设计、实现计划和文档索引。

## 数据说明

- `data/exam-vocab/seed/`：开发基础数据，覆盖 `gaokao`、`cet4`、`cet6`、`postgrad`。
- `data/exam-vocab/real-smoke/`：source-backed 真实词库 smoke 数据，当前覆盖 `gaokao`、`cet4`、`cet6`。
- `data/exam-vocab/ecdict-wordbook/`：由 ECDICT CSV exam tags 生成的 compact wordbook 数据，当前约 7,348 entries；CET-4 / CET-6 / 考研词书在 app 层按 scope closure 继承低级别基础词。
- `output/external-dictionaries/ecdict.csv`：本地 ignored 原始 ECDICT CSV，不提交到仓库；生成器会读取该文件产出 compact JSON。
- `postgrad` 词书来自 ECDICT `ky` tag，并在 app 层继承高考、CET-4 和 CET-6 基础词。
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

前端直连地址可用 `NEXT_PUBLIC_ENGGO_FASTAPI_URL` 覆盖；`corepack pnpm dev:fastapi` 会按当前 FastAPI 端口自动注入。

## 验证命令

基础验证：

```bash
pnpm verify
```

常用产品 smoke：

```bash
corepack pnpm eval:default-fastapi-smoke
corepack pnpm eval:fastapi:conversation-context-smoke
corepack pnpm eval:answer-style:provider
corepack pnpm eval:standard-lookup:provider
```

最近一轮记录过的验证基线包括：

- Direct compare focused tests：`backend/tests/test_direct_compare_answer.py` 13 passed
- Chat contract / learning context focused tests：direct compare、provider 和 context 相关测试通过
- Advanced lookup focused tests：43 passed
- Wordbook Learn / Review / Progress focused tests 与 lint 通过
- Playwright 浏览器 E2E 验证首页聊天、`/learn`、`/review`、`/progress`
- ECDICT-backed wordbook dataset：约 7,890 entries；CET-6 约 7,765，CET-4 约 6,077，Gaokao 约 2,978

## 文档入口

- `docs/README.md`：文档索引。
- `context.md`：长期项目地图。
- `progress.md`：当前交接和下一步。
- `bugs.md`：环境坑、恢复路径和产品残留。
- `docs/superpowers/specs/`：产品和技术设计文档。
- `docs/superpowers/plans/`：历史 implementation plans。

## 当前状态

项目处于 MVP + 产品能力打磨阶段。当前已完成聊天式查词/辨析主链路、ECDICT 大词库底座、Wordbook Learn / Review / Progress 和 ECDICT-grounded direct compare。下一阶段重点不是继续扩人工 confusion graph，而是把聊天、收藏、背词、复习和进度串成更自然的学习闭环，并逐步把硬路由回答链路改造成更像“模型选择内部工具”的受控学习助手。

Windows + local Prisma Postgres 在本机开发时偶发不稳定，恢复路径记录在 `bugs.md`。

# EngGo Deployable Chat-First MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付首个可部署的 EngGo MVP，让用户能在聊天主舞台里完成考试范围内的模糊找词与易混词辨析，并为后续上线迭代保留数据库、监控和检索演进空间。

**Architecture:** 采用单仓库 Next.js App Router 全栈应用，在一个代码库里同时承载页面、API、服务层与数据库访问。运行时以 Node.js 为主，数据源从第一天就落到 PostgreSQL，通过 Prisma 管理 schema 与迁移；检索先走结构化词条/易混关系 + `pg_trgm` 的确定性召回与排序，再将 grounding 交给 OpenAI Responses API 组织成教师式回答。二级学习页面继续保持轻量，避免喧宾夺主，但代码边界要为后续账号、跨设备同步和检索升级预留扩展点。

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Node.js, PostgreSQL, Prisma, Prisma Migrate, Zod, pg_trgm, OpenAI Responses API, Vitest, React Testing Library, Playwright, Sentry, pnpm

---

## Scope Decision

- 本计划只覆盖首个可交付、可部署的 MVP 纵向切片，不覆盖每日计划、提醒、用户上传资料和完整复习系统。
- 当前目录还不是独立 git 仓库，因此 Task 1 必须先完成 `git init` 与忽略策略；在此之前无法使用 git worktree。
- 首页必须保持聊天主舞台，不能因为引入数据库或二级页面而退化成搜索结果页。
- 词条、易混关系和后续用户数据的运行时真相源必须是 PostgreSQL；JSON 可以作为 seed/import 输入，但不是运行时源头。
- 首版可先不强制登录，但数据模型和服务分层要允许后续补账号体系与跨设备同步。
- 内置知识内容只覆盖支撑 MVP 验证所需的最小高频词群与易混组，后续再独立扩充词库。
- 执行本计划时，严格按 task 顺序推进；每完成一个 step 立刻勾选本文件中的 checkbox，每完成一个 task 立即同步 `progress.md`。

## Planned File Map

- `package.json`
  - 统一维护开发、测试、校验脚本与依赖。
- `.gitignore`
  - 明确忽略 `node_modules`、`.next`、`.superpowers/brainstorm/`、`.playwright-cli/` 等非仓库产物。
- `prisma/schema.prisma`
  - 数据模型定义，覆盖考试范围、词条、易混关系及后续用户数据入口。
- `prisma/migrations/`
  - 数据库迁移 SQL 历史。
- `prisma/seed.ts`
  - 首版词库与易混关系导入逻辑。
- `src/app/`
  - App Router 页面与 API 路由；首页始终保持聊天主舞台。
- `src/lib/db.ts`
  - Prisma Client 初始化与服务端数据库访问入口。
- `src/lib/env.ts`
  - 服务端环境变量校验与 runtime 配置。
- `src/components/shell/`
  - 顶层导航、考试目标切换器、页面外壳。
- `src/components/chat/`
  - 聊天线程、输入框、示例提问、答案操作区。
- `src/features/content/`
  - 词条导入 schema、seed 校验、内容查询入口。
- `src/features/retrieval/`
  - 查询模式识别、归一化、候选召回、排序和范围过滤。
- `src/features/answering/`
  - grounding 组装、系统提示词、LLM provider 封装、响应整形。
- `src/features/exam-target/`
  - 当前考试目标枚举、访客态持久化与未来用户同步边界。
- `src/features/collections/`
  - 收藏词条的数据访问层；V1 可先本地持久化，但接口层要可迁移到数据库。
- `src/features/observability/`
  - Sentry 初始化、日志辅助、请求 ID 传递。
- `tests/e2e/`
  - Playwright 端到端验证。
- `README.md`
  - 本地启动方式、环境变量、数据格式和验证命令。

## Decision Freeze For This Plan

- 首页必须是聊天工作台，不允许退化成“搜索结果页”或“词书首页”。
- 响应的主答案必须优先来自当前考试范围；范围外内容只能作为轻提醒。
- 首版知识层只做内置内容，不接用户自定义资料。
- 技术实现先选“单体全栈 + Postgres + Prisma”，而不是本地 JSON 原型栈或前后端双服务。
- 首版检索以结构化规则和 `pg_trgm` 为主，不以 vector-first 为基础方案。

### Task 1: 初始化可部署仓库骨架与聊天主舞台外壳

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `postcss.config.mjs`
- Create: `playwright.config.ts`
- Create: `vitest.config.ts`
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `src/lib/env.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/shell/app-frame.tsx`
- Create: `src/components/shell/app-nav.tsx`
- Test: `tests/e2e/app-shell.spec.ts`

- [x] **Step 1: 初始化 git 并脚手架单应用 Next.js 项目**

Run:
```bash
git init
corepack enable pnpm
pnpm create next-app . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

Expected:
- 当前目录出现 `.git/`
- `src/app/page.tsx` 与 `package.json` 已生成
- 不要把 `.superpowers/brainstorm/` 和 `.playwright-cli/` 提交进仓库

- [x] **Step 2: 写首页外壳的失败 E2E 测试**

```ts
import { expect, test } from "@playwright/test";

test("home shows chat-first workspace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("workspace-title")).toHaveText(/EngGo/i);
  await expect(page.getByTestId("active-exam-target")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByText("遵从怎么说")).toBeVisible();
});
```

Run:
```bash
pnpm exec playwright test tests/e2e/app-shell.spec.ts
```

Expected: FAIL，因为默认脚手架首页还不是聊天主舞台。

- [x] **Step 3: 用聊天主舞台替换脚手架默认首页**

Implement:
- `src/components/shell/app-frame.tsx` 提供顶部导航和二级页面入口
- `src/app/page.tsx` 只保留聊天工作台空状态、考试范围指示器、大输入框与少量示例提问
- `src/app/globals.css` 建立首版视觉变量，避免默认模板感
- `src/lib/env.ts` 先校验基础环境变量骨架，为后续数据库和 OpenAI 接入预留位
- Sentry 先只完成最小初始化，不在此 task 深挖监控细节

- [x] **Step 4: 加入 `.gitignore` 和基础校验脚本**

Required `.gitignore` entries:
```gitignore
node_modules
.next
playwright-report
test-results
.env
.env.local
.vercel
.superpowers/brainstorm/
.playwright-cli/
```

Run:
```bash
pnpm lint
pnpm exec playwright test tests/e2e/app-shell.spec.ts
```

Expected: PASS。

- [x] **Step 5: 提交仓库基础外壳**

Run:
```bash
git add .
git commit -m "feat: bootstrap chat-first app shell"
```

### Task 2: 建立 PostgreSQL schema、迁移与 seed 导入链路

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/features/content/import-types.ts`
- Create: `src/features/content/import-schema.ts`
- Create: `src/features/content/content-repository.ts`
- Create: `src/features/content/content-repository.test.ts`
- Create: `scripts/check-seed-content.ts`
- Create: `data/exam-vocab/seed/entries.json`
- Create: `data/exam-vocab/seed/confusion-groups.json`

- [x] **Step 1: 先写 schema 与 repository 的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { buildVocabularySeedPayload } from "@/features/content/import-schema";

describe("seed content schema", () => {
  it("accepts an in-scope vocabulary entry payload", () => {
    const parsed = buildVocabularySeedPayload({
      id: "comply",
      lemma: "comply",
      aliases: ["comply with"],
      pos: ["verb"],
      meaningsZh: ["遵从，依从"],
      examScopes: ["cet6", "postgrad"],
      examples: ["We must comply with the rules."],
      collocations: ["comply with rules"],
    });

    expect(parsed.lemma).toBe("comply");
  });
});
```

Run:
```bash
pnpm test src/features/content/content-repository.test.ts
```

Expected: FAIL，因为 schema、Prisma schema 与 repository 尚不存在。

- [x] **Step 2: 实现 Prisma schema、数据库访问入口与导入 schema**

Implement:
- `prisma/schema.prisma` 至少建出 `ExamScope`, `VocabularyEntry`, `VocabularyAlias`, `VocabularyMeaning`, `ConfusionGroup`, `ConfusionGroupMember`
- `src/lib/db.ts` 暴露 Prisma Client
- `import-schema.ts` 用 Zod 校验 seed 输入
- repository 先提供查询词条、按考试范围过滤、读取易混组的最小接口

- [x] **Step 3: 编写最小可用 seed 内容并完成导入脚本**

Data minimum:
- 至少 32 个词条
- 至少 8 个易混组
- 四个考试范围都要有覆盖
- 必须包含 spec 中已出现或与其直接相关的词群：`comply`, `conform`, `defer`, `restrain`, `constrain`, `respect`, `respective`, `respectful`, `respectable`, `institute`, `institution`

- [x] **Step 4: 生成迁移并跑通 seed 校验**

Run:
```bash
pnpm exec prisma migrate dev --name init_content
pnpm exec tsx scripts/check-seed-content.ts
pnpm exec prisma db seed
pnpm test src/features/content/content-repository.test.ts
```

Note:
- 当前 Windows + local Prisma Postgres 环境下，`prisma migrate dev` / `prisma migrate resolve` 会触发 Prisma schema-engine 连接错误。
- 本仓库已验证可用的临时 workaround：
```bash
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20260421060000_init_content/migration.sql
pnpm exec prisma db execute --file prisma/migrations/20260421060000_init_content/migration.sql
pnpm exec prisma generate
pnpm exec tsx scripts/check-seed-content.ts
pnpm exec prisma db seed
pnpm test src/features/content/content-repository.test.ts
```

Expected: PASS；数据库已建表，seed 可导入，错误数据会在本地直接抛出可读报错。

- [x] **Step 5: 提交数据库与内容导入基线**

Run:
```bash
git add prisma src/lib/db.ts src/features/content data/exam-vocab scripts/check-seed-content.ts
git commit -m "feat: add postgres content schema and seed flow"
```

### Task 3: 实现数据库驱动的考试范围检索、模糊召回与排序

**Files:**
- Create: `src/features/retrieval/detect-query-mode.ts`
- Create: `src/features/retrieval/normalize-query.ts`
- Create: `src/features/retrieval/retrieval-sql.ts`
- Create: `src/features/retrieval/retrieve-candidates.ts`
- Create: `src/features/retrieval/rank-candidates.ts`
- Create: `src/features/retrieval/types.ts`
- Create: `src/features/retrieval/retrieve-candidates.test.ts`
- Create: `prisma/migrations/<timestamp>_enable_pg_trgm/migration.sql`

- [x] **Step 1: 先用测试锁定四类输入模式**

```ts
import { describe, expect, it } from "vitest";
import { detectQueryMode } from "@/features/retrieval/detect-query-mode";

describe("detectQueryMode", () => {
  it("detects zh meaning lookup", () => {
    expect(detectQueryMode("遵从怎么说")).toBe("meaning_lookup");
  });

  it("detects fuzzy spelling lookup", () => {
    expect(detectQueryMode("有个像 institute 的词")).toBe("fuzzy_recall");
  });

  it("detects direct comparison", () => {
    expect(detectQueryMode("restrain 和 constrain 的区别")).toBe("direct_compare");
  });
});
```

Run:
```bash
pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: FAIL。

- [x] **Step 2: 实现 query mode 检测与输入归一化**

Implement:
- 中文问法识别
- `A 和 B 的区别` 之类的比较模式识别
- 英文片段、空格、大小写归一化

- [x] **Step 3: 启用 `pg_trgm` 并实现数据库召回**

Ranking rules:
- 当前考试范围命中优先级最高
- lemma / alias 精确命中高于模糊命中
- confusion group 成员之间要附带聚合分
- 范围外结果只在缺少高质量范围内结果时进入候选尾部

Implement:
- 迁移里启用 `pg_trgm`
- retrieval SQL 至少支持 alias / lemma 的 trigram 召回
- 应用层继续负责最后一层排序和解释原因

- [x] **Step 4: 补齐检索行为测试**

Must cover:
- 中文含义查到范围内主词
- 不完整英文能返回词群而不是单一拍脑袋结果
- 比较模式直接进入易混组视图数据
- 高歧义输入会返回多个候选并附带歧义原因

Run:
```bash
pnpm test src/features/retrieval/retrieve-candidates.test.ts
```

Expected: PASS。

- [x] **Step 5: 提交检索内核**

Run:
```bash
git add src/features/retrieval
git add prisma/migrations
git commit -m "feat: add scoped database retrieval engine"
```

### Task 4: 实现回答编排层与聊天 API

**Files:**
- Create: `.env.example`
- Create: `src/features/answering/build-grounding.ts`
- Create: `src/features/answering/build-system-prompt.ts`
- Create: `src/features/answering/chat-provider.ts`
- Create: `src/features/answering/chat-service.ts`
- Create: `src/features/answering/chat-service.test.ts`
- Create: `src/app/api/chat/route.ts`
- Create: `src/features/observability/request-id.ts`

- [x] **Step 1: 先写回答结构的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { buildGrounding } from "@/features/answering/build-grounding";

describe("buildGrounding", () => {
  it("organizes response sections in MVP order", () => {
    const grounding = buildGrounding({
      activeExamTarget: "cet6",
      query: "遵从怎么说",
      candidates: [
        { lemma: "comply", reason: "in-scope main answer" },
        { lemma: "conform", reason: "nearby confusion" },
      ],
    });

    expect(grounding.mainAnswer[0].lemma).toBe("comply");
    expect(grounding.confusionBoundary.map((item) => item.lemma)).toContain("conform");
  });
});
```

Run:
```bash
pnpm test src/features/answering/chat-service.test.ts
```

Expected: FAIL。

- [x] **Step 2: 实现环境变量与 provider 抽象**

Implement:
- `.env.example` 至少包含 `OPENAI_API_KEY=`, `DATABASE_URL=`, `DIRECT_URL=`, `SENTRY_DSN=`
- `src/lib/env.ts` 在服务端校验环境变量
- `chat-provider.ts` 暴露统一的 `generateAnswer()` 接口，方便测试时替换 fake provider
- `request-id.ts` 生成每次模型请求的关联 ID

- [x] **Step 3: 实现 grounding、系统提示词与 chat service**

Prompt contract must enforce:
- 先回答当前考试范围内的主答案
- 再解释易混边界
- 再补一句范围提示
- 最后给一个自然的下一步追问
- retrieval 结果必须作为 grounding 输入，而不是让模型自由找词

- [x] **Step 4: 暴露 `POST /api/chat`**

Request body:
```ts
{
  activeExamTarget: "gaokao" | "cet4" | "cet6" | "postgrad";
  query: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}
```

Behavior:
- 调用 retrieval 层拿候选
- 调用 chat service 组织回答
- `OPENAI_API_KEY` 缺失时返回明确的 503 JSON 错误，而不是静默失败
- 响应里要保留 request id，便于排查线上调用

- [x] **Step 5: 运行服务层测试**

Run:
```bash
pnpm test src/features/answering/chat-service.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交聊天服务层**

Run:
```bash
git add .env.example src/lib/env.ts src/features/answering src/features/observability/request-id.ts src/app/api/chat/route.ts
git commit -m "feat: add chat response orchestration"
```

### Task 5: 实现聊天工作台、考试目标持久化与客户端交互

**Files:**
- Create: `src/features/exam-target/model.ts`
- Create: `src/features/exam-target/exam-target-store.ts`
- Create: `src/features/chat/types.ts`
- Create: `src/features/chat/use-chat-session.ts`
- Create: `src/components/shell/exam-target-switcher.tsx`
- Create: `src/components/chat/chat-workspace.tsx`
- Create: `src/components/chat/message-thread.tsx`
- Create: `src/components/chat/chat-input.tsx`
- Create: `src/components/chat/example-prompts.tsx`
- Create: `src/components/chat/chat-workspace.test.tsx`

- [ ] **Step 1: 先写客户端交互的失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

it("persists active exam target and sends prompt", async () => {
  const user = userEvent.setup();
  render(<ChatWorkspace />);

  await user.click(screen.getByRole("button", { name: /CET-6/i }));
  await user.click(screen.getByText("遵从怎么说"));

  expect(screen.getByDisplayValue("遵从怎么说")).toBeInTheDocument();
});
```

Run:
```bash
pnpm test src/components/chat/chat-workspace.test.tsx
```

Expected: FAIL。

- [ ] **Step 2: 实现考试目标枚举与本地持久化**

Implement:
- `activeExamTarget` 默认值与可选值
- localStorage 持久化
- 首次加载时恢复上次选择
- 明确访客态边界，后续如果补登录可替换持久化实现而不重写 UI 组件

- [ ] **Step 3: 实现聊天工作台组件**

UI acceptance:
- 页面视觉中心必须是聊天线程与输入区
- 考试范围指示器低调但清晰
- 示例提问不超过 4 个
- 未回复时不能先展开大块结果列表

- [ ] **Step 4: 接上 `/api/chat` 并渲染答案**

Behavior:
- 发送时显示加载态
- 成功后渲染主答案、易混词与下一步引导
- 服务端报错时显示可恢复错误提示
- 调试信息不直接暴露技术细节给终端用户

- [ ] **Step 5: 跑通组件测试与手动冒烟**

Run:
```bash
pnpm test src/components/chat/chat-workspace.test.tsx
pnpm dev
```

Manual check:
- 能切换考试目标
- 能点击示例提问发起一次对话
- 页面仍然保持“聊天主舞台”而不是结果页

- [ ] **Step 6: 提交前端聊天主链路**

Run:
```bash
git add src/features/exam-target src/features/chat src/components/chat src/components/shell/exam-target-switcher.tsx src/app/page.tsx
git commit -m "feat: build chat-first learning workspace"
```

### Task 6: 接入轻量学习骨架与收藏入口

**Files:**
- Create: `src/features/collections/collection-store.ts`
- Create: `src/components/chat/answer-actions.tsx`
- Create: `src/app/collections/page.tsx`
- Create: `src/app/learn/page.tsx`
- Create: `src/app/review/page.tsx`
- Create: `src/app/progress/page.tsx`
- Create: `src/features/collections/collection-store.test.ts`
- Test: `tests/e2e/collection-flow.spec.ts`

- [ ] **Step 1: 先写收藏流的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { addCollectedWord, listCollectedWords } from "@/features/collections/collection-store";

describe("collection store", () => {
  it("stores collected words under the active exam target", () => {
    addCollectedWord("cet6", { lemma: "comply", note: "遵从" });
    expect(listCollectedWords("cet6")[0].lemma).toBe("comply");
  });
});
```

Run:
```bash
pnpm test src/features/collections/collection-store.test.ts
```

Expected: FAIL。

- [ ] **Step 2: 实现本地收藏 store 与答案操作区**

Implement:
- 词条收藏按考试范围分组
- 回答卡片上提供“加入收藏”动作
- 收藏动作成功后给轻反馈，不跳离聊天主界面
- 收藏 API 设计成可替换的数据访问边界，避免未来接数据库时重写调用层

- [ ] **Step 3: 搭二级学习骨架页面**

Pages:
- `/collections` 展示收藏词条列表
- `/learn` 展示当前考试目标与后续待开发提示
- `/review` 展示复习入口占位
- `/progress` 展示基础计数与阶段说明

- [ ] **Step 4: 跑通收藏流测试**

Run:
```bash
pnpm test src/features/collections/collection-store.test.ts
pnpm exec playwright test tests/e2e/collection-flow.spec.ts
```

Expected: PASS。

- [ ] **Step 5: 提交学习骨架入口**

Run:
```bash
git add src/features/collections src/components/chat/answer-actions.tsx src/app/collections/page.tsx src/app/learn/page.tsx src/app/review/page.tsx src/app/progress/page.tsx tests/e2e/collection-flow.spec.ts
git commit -m "feat: add lightweight learning backbone pages"
```

### Task 7: 完成可部署验证闭环与项目说明

**Files:**
- Create: `tests/e2e/chat-mvp.spec.ts`
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: 写一条 MVP 级别的端到端主流程测试**

```ts
import { expect, test } from "@playwright/test";

test("user can switch exam target, ask a fuzzy question, and save a word", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /CET-6/i }).click();
  await page.getByTestId("chat-input").fill("遵从怎么说");
  await page.getByRole("button", { name: /发送/i }).click();

  await expect(page.getByText(/comply/i)).toBeVisible();
  await page.getByRole("button", { name: /加入收藏/i }).click();
  await page.goto("/collections");
  await expect(page.getByText(/comply/i)).toBeVisible();
});
```

Run:
```bash
pnpm exec playwright test tests/e2e/chat-mvp.spec.ts
```

Expected: 先 FAIL，等主链路补完后 PASS。

- [ ] **Step 2: 增加统一验证脚本**

Update `package.json` scripts:
```json
{
  "scripts": {
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "verify": "pnpm lint && pnpm test && pnpm test:e2e"
  }
}
```

- [ ] **Step 3: 写 README，固定本地启动与数据维护方式**

README must include:
- 环境要求：Node、pnpm
- 首次启动命令
- `DATABASE_URL` / `DIRECT_URL` / `OPENAI_API_KEY` 配置说明
- `prisma migrate` 与 seed 流程
- `data/exam-vocab/seed/` 数据格式约束
- `pnpm verify` 的使用方法
- 基础部署方式说明

- [ ] **Step 4: 跑完整体验证**

Run:
```bash
pnpm verify
```

Expected:
- lint PASS
- unit tests PASS
- e2e PASS

- [ ] **Step 5: 提交 MVP 验证闭环**

Run:
```bash
git add package.json README.md tests/e2e/chat-mvp.spec.ts
git commit -m "chore: add mvp verification workflow"
```

## Exit Criteria

- 首页是稳定可用的聊天主舞台
- PostgreSQL 已成为运行时内容源头
- 用户可以持久化当前考试目标
- 中文含义查询、模糊英文回忆、直接对比三类输入至少能覆盖 MVP 主路径
- 回答遵循“主答案 -> 易混边界 -> 范围提醒 -> 下一步”的节奏
- 收藏页与学习骨架存在，但不喧宾夺主
- 项目具备基础部署、迁移、seed 与错误监控入口
- `pnpm verify` 全绿

## Deferred To Later Plans

- 登录、云端同步、跨设备收藏
- 更大规模词库扩容、词频排序优化与运营后台
- `pgvector` / semantic retrieval 的引入评估
- 每日计划、提醒、完整复习流
- 用户上传资料与自定义知识库

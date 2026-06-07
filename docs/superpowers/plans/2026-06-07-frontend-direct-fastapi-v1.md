# Frontend Direct FastAPI V1 执行计划

## Goal
让 EngGo 完成前后端边界收口：Next.js 只作为 React 前端壳，浏览器聊天请求直接调用 FastAPI，旧 Next `/api/chat` proxy 退出业务路径。

## Scope
- [x] Task 1：审查当前 chat 请求路径、环境变量、FastAPI app 配置和 smoke runner 默认值。
- [x] Task 2：新增前端 chat API client，`useChatSession` 改为直连 FastAPI。
- [x] Task 3：为 FastAPI 配置本地 Next origin CORS。
- [x] Task 4：删除 Next `/api/chat` route / proxy tests，并清理 proxy smoke scripts。
- [x] Task 5：更新 README / context / docs / progress / bugs。
- [x] Task 6：运行 focused tests、lint、stale-reference scan 和必要 smoke 验证。

## Kept Deliberately
- Next.js app shell and routes.
- FastAPI `/api/chat` contract.
- Client-only Learn / Review / Progress state.
- Prisma schema / migrations / seed history for a separate structured-overlay retirement decision.

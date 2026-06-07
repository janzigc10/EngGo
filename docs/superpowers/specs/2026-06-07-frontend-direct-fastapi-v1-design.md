# Frontend Direct FastAPI V1 Design

## Goal
Finish the backend split at the app boundary: keep Next.js as the React frontend shell, but make browser chat requests call FastAPI directly. Retire the Next `/api/chat` proxy so there is only one business backend path for chat, lookup, retrieval, and scope closure.

## Scope
- Add a small browser-side chat API client with `NEXT_PUBLIC_ENGGO_FASTAPI_URL` and default `http://127.0.0.1:8000`.
- Keep `useChatSession` responsible for UI state, local transcript, active exam target, active wordbook, and conversation context.
- Configure FastAPI CORS for local Next origins.
- Delete the Next `/api/chat` route and its proxy tests.
- Update smoke scripts so default verification targets FastAPI direct, not Next proxy.
- Update docs and `progress.md` to describe Next as frontend-only.

## Non-goals
- Do not migrate from Next.js to Vite React.
- Do not move Learn / Review / Progress state to FastAPI.
- Do not change FastAPI chat routing, retrieval, provider behavior, or scope closure.
- Do not delete Prisma schema / migrations / seed history in this pass.

## Runtime Shape
```text
Browser React UI
  -> chat-api-client
  -> FastAPI /api/chat
```

Next.js still serves the app routes and static/client assets. It no longer owns a chat API route or backend URL proxy setting.

## Configuration
- Frontend direct API base:
  - `NEXT_PUBLIC_ENGGO_FASTAPI_URL`
  - default: `http://127.0.0.1:8000`
- FastAPI CORS origins:
  - `ENGGO_CORS_ALLOW_ORIGINS`
  - default: `http://127.0.0.1:3000,http://localhost:3000`

## Verification
- Unit tests cover URL construction, custom frontend API URL, `useChatSession` request body, and FastAPI CORS.
- Stale-reference scan confirms source/scripts no longer import or call the Next proxy route.
- FastAPI direct smoke remains the product/backend verification path.

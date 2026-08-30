# Architecture

## Platform architecture

- **Stack:** TanStack Start (React 19) + Vite SSR, single fullstack process. No separate backend service.
- **Agent pipeline:** Inspector → Architect → Coder → Review Board → Git Manager, orchestrated by the workspace context.
- **Provider abstraction:** 7 providers (OpenAI, Gemini, OpenRouter, Lovable, Groq, Mistral, Hugging Face) behind one `callLlm` path with automatic model selection and fallback. No provider is hard-coded.
- **GitHub integration:** read (tree/contents/branches) and write (blobs/tree/commit/branch/PR) via the REST API. The Git Manager commits to a NEW branch only, never the base branch, never force-pushes.
- **Security:** credentials live in server-side env or per-request user overrides (`AsyncLocalStorage`), never logged, never sent to models, never committed. All provider/GitHub text is redacted.
- **Persistence:** this `.ai-dev-hub/` directory is the checkpoint. It stores project state only — never secrets. The actual source code and Git history are authoritative when they conflict with this checkpoint.

## Target repository

- **Repository:** mysindbad/dev-copilot-crew (branch `main`, commit `92b3ddf`)
- **Frontend:** React + Vite
- **Backend:** TanStack Start server functions
- **Database:** UNKNOWN
- **Deployment:** GitHub Actions deployment
- **Package manager:** bun
- **Languages:** TypeScript (96), JavaScript (1), CSS (1)
- **Entry points:** src/routes/__root.tsx, src/routes/index.tsx, src/server.ts, src/start.ts
- **API routes detected:** 0
- **Files in audit:** 115
- **Build command:** vite build
- **Dev command:** vite dev
- **Env variable names (values never stored):** GEMINI_API_KEY, GITHUB_TOKEN, GROQ_API_KEY, HF_API_KEY, LOVABLE_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY

### Known risks

- No test files exist in the repository tree — changes cannot be verified automatically.
- 1 generated/build artefacts are committed to the repository.

## Important directories

- `src/lib/*.server.ts` — server-only agent logic (inspection, architect, coder, review, git, llm, state).
- `src/lib/*.functions.ts` — TanStack Start server functions (the RPC surface).
- `src/lib/workspace.tsx` — pipeline orchestration and shared workspace state.
- `src/routes/` — file-based routes (chat, project, work).
- `src/components/` — UI; `src/components/ui/` are stock shadcn primitives.

## Important entry points

- `src/routes/__root.tsx` — root layout + providers.
- `src/server.ts` — SSR server entry.

## Important environment variables (NAME ONLY)

- `GITHUB_TOKEN`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `HF_API_KEY`, `LOVABLE_API_KEY`
- Values are supplied via secure server-side storage or the in-app Secrets panel — never committed.

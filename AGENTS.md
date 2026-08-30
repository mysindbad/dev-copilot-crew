<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Base44 dev environment

This is a **Lovable-generated TanStack Start** app (React 19 + Vite 8 SSR, single
fullstack process — no separate backend). It runs in Docker Compose via
`docker-compose.base44.yml`.

### Run
```
docker compose -f docker-compose.base44.yml up -d --build
```
- Web entry on host port **3000** (mapped to Vite dev port 5173).
- `node:22-slim` + `npm install` + `npx vite dev --host 0.0.0.0 --port 5173 --strictPort`.
- Source is bind-mounted; live reload works. `node_modules` lives in a named volume.
- Health: `GET /` must return 200.

### Quirks (non-obvious)
- **No database, no user auth.** State is in-memory `Map`s (`inspection.server.ts`,
  `project-memory.server.ts`) and browser `localStorage`. Single-user, bring-your-own-credentials.
- **"Backend" = TanStack Start server functions** in `src/lib/*.functions.ts` (RPC via `useServerFn`),
  wrapping `src/lib/*.server.ts` modules. Not a separate service.
- **Vite 8 blocks unknown Host headers by default.** `vite.config.ts` sets
  `vite.server.allowedHosts: true` so the preview's external hostname works — keep it.
- **`exactOptionalPropertyTypes: true`** is on in `tsconfig`. Optional object properties
  cannot receive explicit `undefined`; use `.default(...)` in zod schemas and `| null`
  (not `| undefined`) for nullable fields that flow into typed objects. Verify with
  `docker compose exec web npx tsc --noEmit`.
- **All server functions use the deprecated `.inputValidator()`** (consistent with the
  rest of the codebase) — a warning, not an error. Don't "fix" just the new ones.
- **Secrets are never committed.** Credentials live in env vars or per-request user
  overrides (`secrets.server.ts` AsyncLocalStorage). The app boots fine with no secrets
  (shows "not configured" states); it only needs them to actually run the agent pipeline.

### Credentials (external, user-supplied)
`GITHUB_TOKEN`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`,
`MISTRAL_API_KEY`, `HF_API_KEY` — all optional at boot. See `.base44/environment.json`.

### Verify it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` → 200.
- Home page (`/`) shows the Arabic chat UI; `/project` shows the project + state panels.
- `docker compose exec web npx tsc --noEmit` → exit 0.

### Persistent project state (`.ai-dev-hub/`)
The platform persists a checkpoint of its work into the target repository under
`.ai-dev-hub/` (project-state.json, current-task.json, capabilities.json,
architecture.md, progress.md, decisions.md, agent-context.md, history/checkpoints.jsonl).
- **Bootstrap/recovery:** `state.server.ts:bootstrapStateReal` reads the dir from GitHub
  and compares against the live branch head (state is a checkpoint, not authority).
  Consistency quirk: a checkpoint records the head *before* its own commit (a file can't
  hold its own SHA), so when the current head is a `chore(state):` commit the check
  compares `lastCommitSha` to the head's **parent**, not the head — otherwise every
  checkpoint would falsely look "stale".
- **Checkpoint:** `state.server.ts:checkpointStateReal` commits the files to the
  configured branch (fast-forward only, never force) with `chore(state): ...` messages.
- **Wiring:** `workspace.tsx` bootstraps on repo connect and checkpoints after each
  pipeline milestone (inspect/plan/code/review/git/failed). `ProjectStateView.tsx`
  surfaces recovered state on `/project`.
- Server functions: `state.functions.ts` (`bootstrapProjectState`, `checkpointProjectState`).

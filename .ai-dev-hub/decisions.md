# Architectural Decisions

Foundational decisions made when the platform was designed. Append new decisions below as they are made.

## Foundational

- Provider abstraction over 7 providers — no AI provider is hard-coded; the model is selected automatically per task kind with fallback.
- GitHub Personal Access Token for repository access — stored server-side only, never committed, never sent to a model.
- Agents are READ-ONLY except the Git Manager — the Architect/Coder/Reviewers never write to GitHub; only the Git Manager commits, and only after human approval.
- Coder guardrails — change scope is bounded to approved plan files, content must be complete (no placeholder elisions), protected paths are blocked.
- Git Manager safety — commits go to a NEW branch only; the base branch is never touched and history is never rewritten.
- No secrets in the repository — `.ai-dev-hub/` stores project state only; credentials live in env vars or secure per-request overrides.
- State is a checkpoint, not an authority — when persisted state conflicts with the actual code or Git history, the code wins and the state is repaired.
- Persistence via `.ai-dev-hub/` on the working branch — a fresh clone reconstructs project context from this directory alone.

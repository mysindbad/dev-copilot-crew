/**
 * Pure builders for the `.ai-dev-hub/` files.
 *
 * These functions turn a state snapshot into the exact file contents that get
 * committed to the repository. They have no side effects and no I/O, so the
 * persisted shape is easy to read, test and audit. No secrets ever appear
 * here — only names, counts and summaries.
 */
import {
  STATE_DIR,
  type ProjectState,
  type CurrentTask,
  type AuditFacts,
} from "./state.types";

const now = () => new Date().toISOString();

/* ----------------------------------------------------------------- JSON */

export function buildProjectStateJson(state: ProjectState): string {
  return JSON.stringify(state, null, 2) + "\n";
}

export function buildCurrentTaskJson(task: CurrentTask): string {
  return JSON.stringify(task, null, 2) + "\n";
}

export function buildCapabilitiesJson(state: ProjectState): string {
  return (
    JSON.stringify(
      {
        agents: [
          "Project Manager",
          "Inspector",
          "Architect",
          "Coder",
          "Review Board",
          "Git Manager",
        ],
        providers: state.configuredProviders,
        integrations: state.enabledIntegrations,
        phases: ["inspect", "plan", "code", "review", "git"],
      },
      null,
      2,
    ) + "\n"
  );
}

/* ----------------------------------------------------------------- MD */

function bulletList(items: string[]): string {
  if (!items.length) return "_none_\n";
  return items.map((i) => `- ${i}`).join("\n") + "\n";
}

export function buildProgressMd(state: ProjectState, task: CurrentTask): string {
  const lines: string[] = [];
  lines.push("# Progress Checkpoint", "");
  lines.push(`> Last updated: ${state.updatedAt} · checkpoint v${state.stateVersion}`, "");
  lines.push("## Current phase", "");
  lines.push(`**${state.phase}**${state.activePhase ? ` (active: ${state.activePhase})` : ""}`, "");
  lines.push("## Completed phases", "");
  lines.push(bulletList(state.completedPhases));
  lines.push("## Current task", "");
  lines.push(`- **Task:** ${task.task || "—"}`);
  lines.push(`- **Status:** ${task.status}`);
  lines.push(`- **Last action:** ${task.lastAction || "—"}`);
  lines.push(`- **Next action:** ${task.nextAction || "—"}`);
  lines.push("");
  lines.push("## What is implemented", "");
  const done = state.completedPhases;
  lines.push(done.length ? bulletList(done) : "_nothing yet_\n");
  lines.push("## What remains", "");
  lines.push(bulletList(state.pendingWork));
  lines.push("## Known problems", "");
  lines.push(bulletList(state.knownProblems));
  lines.push("## Last operations", "");
  lines.push(`- **Last success:** ${state.lastSuccessfulOperation || "—"}`);
  lines.push(`- **Last failure:** ${state.lastFailedOperation || "—"}`);
  lines.push("");
  lines.push("## Recommended next action", "");
  lines.push(state.recommendedNextAction ? `${state.recommendedNextAction}\n` : "_none_\n");
  lines.push("## Build / test status", "");
  lines.push(`- **Build:** ${state.buildStatus}`);
  lines.push(`- **Tests:** ${state.testStatus}`);
  lines.push("");
  return lines.join("\n");
}

const PLATFORM_ARCH = [
  "## Platform architecture",
  "",
  "- **Stack:** TanStack Start (React 19) + Vite SSR, single fullstack process. No separate backend service.",
  "- **Agent pipeline:** Inspector → Architect → Coder → Review Board → Git Manager, orchestrated by the workspace context.",
  "- **Provider abstraction:** 7 providers (OpenAI, Gemini, OpenRouter, Lovable, Groq, Mistral, Hugging Face) behind one `callLlm` path with automatic model selection and fallback. No provider is hard-coded.",
  "- **GitHub integration:** read (tree/contents/branches) and write (blobs/tree/commit/branch/PR) via the REST API. The Git Manager commits to a NEW branch only, never the base branch, never force-pushes.",
  "- **Security:** credentials live in server-side env or per-request user overrides (`AsyncLocalStorage`), never logged, never sent to models, never committed. All provider/GitHub text is redacted.",
  "- **Persistence:** this `.ai-dev-hub/` directory is the checkpoint. It stores project state only — never secrets. The actual source code and Git history are authoritative when they conflict with this checkpoint.",
  "",
];

export function buildArchitectureMd(state: ProjectState, auditFacts: AuditFacts | null): string {
  const lines: string[] = ["# Architecture", ""];
  lines.push(...PLATFORM_ARCH);
  lines.push("## Target repository", "");
  if (auditFacts) {
    lines.push(`- **Repository:** ${auditFacts.repository} (branch \`${auditFacts.branch}\`, commit \`${auditFacts.commitSha.slice(0, 7)}\`)`);
    lines.push(`- **Frontend:** ${auditFacts.frontend}`);
    lines.push(`- **Backend:** ${auditFacts.backend}`);
    lines.push(`- **Database:** ${auditFacts.database}`);
    lines.push(`- **Deployment:** ${auditFacts.deployment}`);
    lines.push(`- **Package manager:** ${auditFacts.packageManager}`);
    lines.push(`- **Languages:** ${auditFacts.languages.join(", ") || "UNKNOWN"}`);
    lines.push(`- **Entry points:** ${auditFacts.entryPoints.join(", ") || "UNKNOWN"}`);
    lines.push(`- **API routes detected:** ${auditFacts.apiRoutes}`);
    lines.push(`- **Files in audit:** ${auditFacts.fileCount}`);
    lines.push(`- **Build command:** ${auditFacts.buildCommand}`);
    lines.push(`- **Dev command:** ${auditFacts.devCommand}`);
    lines.push(`- **Env variable names (values never stored):** ${auditFacts.envNames.join(", ") || "none detected"}`);
    if (auditFacts.risks.length) {
      lines.push("", "### Known risks", "");
      lines.push(bulletList(auditFacts.risks));
    }
  } else {
    lines.push("_No audit available yet. Run a repository inspection to populate this section._", "");
  }
  lines.push("## Important directories", "");
  lines.push("- `src/lib/*.server.ts` — server-only agent logic (inspection, architect, coder, review, git, llm, state).");
  lines.push("- `src/lib/*.functions.ts` — TanStack Start server functions (the RPC surface).");
  lines.push("- `src/lib/workspace.tsx` — pipeline orchestration and shared workspace state.");
  lines.push("- `src/routes/` — file-based routes (chat, project, work).");
  lines.push("- `src/components/` — UI; `src/components/ui/` are stock shadcn primitives.");
  lines.push("");
  lines.push("## Important entry points", "");
  lines.push("- `src/routes/__root.tsx` — root layout + providers.");
  lines.push("- `src/server.ts` — SSR server entry.");
  lines.push("");
  lines.push("## Important environment variables (NAME ONLY)", "");
  lines.push("- `GITHUB_TOKEN`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `HF_API_KEY`, `LOVABLE_API_KEY`");
  lines.push("- Values are supplied via secure server-side storage or the in-app Secrets panel — never committed.");
  lines.push("");
  return lines.join("\n");
}

export function buildAgentContextMd(state: ProjectState, task: CurrentTask, auditFacts: AuditFacts | null): string {
  const lines: string[] = [];
  lines.push("# Agent Context", "");
  lines.push(`Reconstructed at ${now()}.`, "");
  lines.push("## Read this first", "");
  lines.push(`- The platform is in phase **${state.phase}** (checkpoint v${state.stateVersion}).`);
  lines.push(`- Last recorded commit: \`${state.repository.lastCommitSha.slice(0, 7)}\` on \`${state.repository.branch}\`.`);
  lines.push(`- Configured providers: ${state.configuredProviders.join(", ") || "none"}.`);
  lines.push(`- Default model: ${state.defaultModel || "none selected"}.`);
  lines.push(`- Workspace: audit=${state.workspace.hasAudit}, plan=${state.workspace.hasPlan}, changeSet=${state.workspace.hasChangeSet}, review=${state.workspace.hasReview}, git=${state.workspace.hasGitResult}.`);
  lines.push("");
  lines.push("## Current task", "");
  lines.push(`- ${task.task || "—"}`);
  lines.push(`- Status: ${task.status}. Next: ${task.nextAction || "—"}.`);
  lines.push("");
  lines.push("## Trust order", "");
  lines.push("1. The actual source code and Git history.");
  lines.push("2. This checkpoint.");
  lines.push("If they conflict, re-inspect and repair this checkpoint — never trust stale metadata over the code.");
  lines.push("");
  if (auditFacts) {
    lines.push("## Repository facts (from last audit)", "");
    lines.push(`- ${auditFacts.frontend} / ${auditFacts.backend} / ${auditFacts.database}`);
    lines.push(`- ${auditFacts.apiRoutes} API routes, ${auditFacts.fileCount} files.`);
    lines.push("");
  }
  return lines.join("\n");
}

/* --------------------------------------------------------- decisions.md */

export const FOUNDATIONAL_DECISIONS = [
  "Provider abstraction over 7 providers — no AI provider is hard-coded; the model is selected automatically per task kind with fallback.",
  "GitHub Personal Access Token for repository access — stored server-side only, never committed, never sent to a model.",
  "Agents are READ-ONLY except the Git Manager — the Architect/Coder/Reviewers never write to GitHub; only the Git Manager commits, and only after human approval.",
  "Coder guardrails — change scope is bounded to approved plan files, content must be complete (no placeholder elisions), protected paths are blocked.",
  "Git Manager safety — commits go to a NEW branch only; the base branch is never touched and history is never rewritten.",
  "No secrets in the repository — `.ai-dev-hub/` stores project state only; credentials live in env vars or secure per-request overrides.",
  "State is a checkpoint, not an authority — when persisted state conflicts with the actual code or Git history, the code wins and the state is repaired.",
  "Persistence via `.ai-dev-hub/` on the working branch — a fresh clone reconstructs project context from this directory alone.",
];

export function seedDecisionsMd(): string {
  const lines: string[] = ["# Architectural Decisions", ""];
  lines.push("Foundational decisions made when the platform was designed. Append new decisions below as they are made.", "");
  lines.push("## Foundational", "");
  for (const d of FOUNDATIONAL_DECISIONS) lines.push(`- ${d}`);
  lines.push("");
  return lines.join("\n");
}

export function appendDecisions(existing: string, additions: string[]): string {
  if (!additions.length) return existing;
  const stamp = now();
  const block = [`\n## ${stamp}`, ""];
  for (const d of additions) block.push(`- ${d}`);
  block.push("");
  return existing.trimEnd() + "\n" + block.join("\n");
}

/* ------------------------------------------------------------- history */

export function checkpointHistoryLine(state: ProjectState): string {
  return JSON.stringify({
    stateVersion: state.stateVersion,
    at: state.updatedAt,
    phase: state.phase,
    commit: state.repository.lastCommitSha.slice(0, 7),
    lastSuccess: state.lastSuccessfulOperation,
  }) + "\n";
}

/* ------------------------------------------------- snapshot assembly */

/**
 * Builds the fully-rebuilt snapshot files (the ones overwritten every
 * checkpoint). `decisions.md` and `history/checkpoints.jsonl` are
 * read-modify-write and are handled by the server, not here.
 */
export function buildSnapshotFiles(
  state: ProjectState,
  task: CurrentTask,
  auditFacts: AuditFacts | null,
): Record<string, string> {
  return {
    [`${STATE_DIR}/project-state.json`]: buildProjectStateJson(state),
    [`${STATE_DIR}/current-task.json`]: buildCurrentTaskJson(task),
    [`${STATE_DIR}/capabilities.json`]: buildCapabilitiesJson(state),
    [`${STATE_DIR}/architecture.md`]: buildArchitectureMd(state, auditFacts),
    [`${STATE_DIR}/progress.md`]: buildProgressMd(state, task),
    [`${STATE_DIR}/agent-context.md`]: buildAgentContextMd(state, task, auditFacts),
  };
}

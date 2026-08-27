import { z } from "zod";
import type { ArchitectPlan, ProviderId } from "./architect.types";
import type {
  ChangeSet,
  CoderAttempt,
  CoderEvent,
  CoderResult,
  FileAction,
  GuardrailReport,
  StagedFile,
} from "./coder.types";
import { unifiedDiff } from "./diff";
import { callLlm, hasProviderKey, redact } from "./llm.server";
import { parseRepoUrl } from "./inspection.server";
import { recallAudit } from "./project-memory.server";

/**
 * Phase 4 — Coder Agent.
 *
 * Reads the REAL file content at the audited commit, asks the model for full
 * replacement content for a bounded set of planned files, enforces guardrails,
 * and produces a staged change set with real diffs. Nothing is written to
 * GitHub: there is no commit, no branch creation and no push in this phase.
 */

const MAX_TARGET_FILES = 6;
const MAX_READ_BYTES = 120_000;
const MAX_OUTPUT_BYTES = 120_000;

const BLOCKED_PATH = /(^\.git\/)|(^\.github\/workflows\/)|(\.env)|(^|\/)node_modules(\/|$)/i;
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|mp4|mp3|woff2?|ttf|eot|jar|so|dll|exe|lock)$/i;

const OutputSchema = z.object({
  summary: z.string().default(""),
  notes: z.array(z.string()).default([]),
  files: z
    .array(
      z.object({
        path: z.string(),
        action: z.string().default("MODIFY"),
        reason: z.string().default(""),
        content: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

const SYSTEM = `You are the Coder Agent of a multi-agent software engineering platform.
You implement an approved Architect plan against REAL repository files.
Hard rules:
- You may only touch the files listed under ALLOWED FILES. Never invent other paths.
- For MODIFY you receive the exact current file content. Return the COMPLETE new file content, not a patch, not a fragment, and never placeholders such as "// ... rest unchanged".
- Preserve the file's existing language, style, indentation and imports. Make the smallest change that implements the step.
- For CREATE return the full content of the new file.
- For DELETE return "content": null.
- If a file should not change, omit it.
- Never include secrets, API keys or tokens in code.
- Reply with a single JSON object only, no markdown fences:
{"summary": string, "notes": string[], "files": [{"path": string, "action": "CREATE"|"MODIFY"|"DELETE", "reason": string, "content": string|null}]}`;

function safeMessage(message: string): string {
  return message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 240);
}

async function readFileAtCommit(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<{ ok: boolean; content?: string; error?: string }> {
  const token = process.env["GITHUB_TOKEN"] ?? null;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(ref)}`;

  const attempt = async (useToken: boolean) => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "my-ai-dev-team",
    };
    // The token never leaves this request; it is not logged or returned.
    if (useToken && token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { headers });
  };

  try {
    let res = await attempt(true);
    // Same degradation as inspection: a rejected token falls back to public access.
    if (token && (res.status === 401 || res.status === 403)) res = await attempt(false);
    if (res.status === 404) return { ok: false, error: "not found at this commit" };
    if (res.status === 403)
      return { ok: false, error: "GitHub rate limit reached — configure a valid GITHUB_TOKEN" };
    if (!res.ok) return { ok: false, error: `GitHub ${res.status}` };
    const json = (await res.json()) as { content?: string; encoding?: string; size?: number };
    if (!json.content || json.encoding !== "base64")
      return { ok: false, error: "unreadable content" };
    if ((json.size ?? 0) > MAX_READ_BYTES) return { ok: false, error: "file too large to edit" };
    const buf = Buffer.from(json.content, "base64");
    const text = buf.toString("utf8");
    if (text.includes("\u0000")) return { ok: false, error: "binary file" };
    return { ok: true, content: text };
  } catch (error) {
    return {
      ok: false,
      error: safeMessage(error instanceof Error ? error.message : "network error"),
    };
  }
}


function normalizeAction(value: string): FileAction {
  const v = value.toUpperCase();
  return v === "CREATE" || v === "DELETE" ? v : "MODIFY";
}

function pathIsAcceptable(path: string): string | null {
  if (!path || path.startsWith("/") || path.includes("..")) return "unsafe path";
  if (BLOCKED_PATH.test(path)) return "protected path (git, workflows, env or dependencies)";
  if (BINARY_EXT.test(path)) return "binary or lock file";
  return null;
}

export interface CoderArgs {
  plan: ArchitectPlan;
  stepOrders: number[];
  primaryProvider: ProviderId;
  primaryModel: string;
  fallbackProvider: ProviderId | "none";
  fallbackModel: string;
}

export async function implementPlanReal(args: CoderArgs): Promise<CoderResult> {
  const events: CoderEvent[] = [];
  const attempts: CoderAttempt[] = [];
  const now = () => new Date().toISOString();
  const push = (label: string, state: CoderEvent["state"], detail: string) =>
    events.push({ label, state, detail, at: now() });

  const plan = args.plan;
  if (!plan?.repository || !plan.commitSha) {
    return {
      ok: false,
      error: "No architect plan available. Generate a plan first.",
      errorKind: "no_plan",
      attempts,
      events,
    };
  }

  const parsed = parseRepoUrl(plan.repository);
  if (!parsed) {
    return {
      ok: false,
      error: `Cannot resolve repository "${plan.repository}".`,
      errorKind: "repo_read",
      attempts,
      events,
    };
  }

  const selected = plan.steps.filter(
    (s) => args.stepOrders.length === 0 || args.stepOrders.includes(s.order),
  );
  if (selected.length === 0) {
    return {
      ok: false,
      error: "Select at least one plan step to implement.",
      errorKind: "no_targets",
      attempts,
      events,
    };
  }
  push("Steps selected", "ok", `${selected.length} of ${plan.steps.length} plan steps`);

  // Targets: files named by the selected steps, restricted to the plan's own
  // affected-file list so the agent cannot widen its own blast radius.
  const planned = new Map(plan.affectedFiles.map((f) => [f.path, f]));
  const wanted: string[] = [];
  for (const step of selected) {
    for (const f of step.files) if (!wanted.includes(f)) wanted.push(f);
  }
  for (const f of plan.affectedFiles) if (!wanted.includes(f.path)) wanted.push(f.path);

  const blocked: { path: string; reason: string }[] = [];
  const targets: string[] = [];
  for (const path of wanted) {
    const problem = pathIsAcceptable(path);
    if (problem) {
      blocked.push({ path, reason: problem });
      continue;
    }
    if (targets.length >= MAX_TARGET_FILES) {
      blocked.push({ path, reason: `file budget reached (${MAX_TARGET_FILES} files per run)` });
      continue;
    }
    targets.push(path);
  }
  if (targets.length === 0) {
    return {
      ok: false,
      error: "Every planned file was blocked by the change guardrails.",
      errorKind: "all_blocked",
      attempts,
      events,
    };
  }
  push("Change scope bounded", blocked.length ? "warn" : "ok", `${targets.length} file(s) in scope, ${blocked.length} blocked`);

  // Read the real current content at the audited commit.
  const current = new Map<string, string | null>();
  for (const path of targets) {
    const read = await readFileAtCommit(parsed.owner, parsed.repo, path, plan.commitSha);
    if (read.ok && typeof read.content === "string") current.set(path, read.content);
    else if (read.error === "not found at this commit") current.set(path, null);
    else {
      blocked.push({ path, reason: read.error ?? "unreadable" });
    }
  }
  for (const b of blocked) current.delete(b.path);
  const readable = targets.filter((t) => current.has(t));
  if (readable.length === 0) {
    return {
      ok: false,
      error: `Could not read any target file at commit ${plan.commitSha.slice(0, 7)}: ${blocked
        .map((b) => `${b.path} (${b.reason})`)
        .join("; ")}`,
      errorKind: "repo_read",
      attempts,
      events,
    };
  }
  push(
    "Repository files read",
    "ok",
    `${readable.length} file(s) at ${plan.commitSha.slice(0, 7)} (${readable.filter((p) => current.get(p) === null).length} new)`,
  );

  const promptLines: string[] = [];
  promptLines.push(`TASK: ${plan.request}`, "");
  promptLines.push(`REPOSITORY: ${plan.repository} @ ${plan.branch} (${plan.commitSha.slice(0, 7)})`, "");
  promptLines.push("PLAN SUMMARY:", plan.summary, "", "APPROACH:", plan.approach, "");
  promptLines.push("STEPS TO IMPLEMENT NOW:");
  for (const s of selected)
    promptLines.push(`- [${s.order}] ${s.title} (${s.agent}, risk ${s.risk}): ${s.detail}`);
  promptLines.push("", "ALLOWED FILES:");
  for (const path of readable) {
    const info = planned.get(path);
    const exists = current.get(path) !== null;
    promptLines.push(
      `- ${path} — planned change ${info?.change ?? "UNKNOWN"}, ${exists ? "exists in repo" : "does not exist yet"}${info?.reason ? `: ${info.reason}` : ""}`,
    );
  }
  promptLines.push("", "CURRENT FILE CONTENT:");
  for (const path of readable) {
    const content = current.get(path);
    promptLines.push(`----- FILE: ${path} -----`);
    promptLines.push(content == null ? "(file does not exist yet)" : content);
    promptLines.push(`----- END FILE: ${path} -----`, "");
  }

  const routes: { provider: ProviderId; model: string }[] = [];
  if (args.primaryModel) routes.push({ provider: args.primaryProvider, model: args.primaryModel });
  if (args.fallbackProvider !== "none" && args.fallbackModel)
    routes.push({ provider: args.fallbackProvider, model: args.fallbackModel });
  if (routes.length === 0) {
    return {
      ok: false,
      error: "No model selected. Test a provider and pick a model first.",
      errorKind: "no_provider",
      attempts,
      events,
    };
  }

  for (const route of routes) {
    const started = Date.now();
    if (!hasProviderKey(route.provider)) {
      attempts.push({
        provider: route.provider,
        model: route.model,
        ok: false,
        detail: `${route.provider} API key is not configured.`,
        ms: 0,
      });
      continue;
    }
    const res = await callLlm(route.provider, route.model, SYSTEM, promptLines.join("\n"));
    const ms = Date.now() - started;
    if (!res.ok || !res.text) {
      attempts.push({
        provider: route.provider,
        model: route.model,
        ok: false,
        detail: res.error ?? "Provider call failed.",
        ms,
      });
      continue;
    }
    try {
      const out = OutputSchema.parse(extractJson(res.text));
      const runBlocked = [...blocked];
      const guardrails: GuardrailReport[] = [];
      const files: StagedFile[] = [];

      for (const item of out.files) {
        const path = item.path.trim().replace(/^\.\//, "");
        if (!readable.includes(path)) {
          runBlocked.push({ path, reason: "outside the approved plan scope" });
          continue;
        }
        const action = normalizeAction(item.action);
        const before = current.get(path) ?? null;
        if (action === "DELETE") {
          if (before === null) {
            runBlocked.push({ path, reason: "delete requested for a file that does not exist" });
            continue;
          }
          const d = unifiedDiff(before, "");
          files.push({
            path,
            action,
            reason: item.reason,
            before,
            after: null,
            additions: 0,
            deletions: d.deletions,
            diff: d.diff,
            truncatedDiff: d.truncated,
          });
          continue;
        }
        const after = item.content;
        if (typeof after !== "string" || after.trim() === "") {
          runBlocked.push({ path, reason: "model returned empty content" });
          continue;
        }
        if (Buffer.byteLength(after, "utf8") > MAX_OUTPUT_BYTES) {
          runBlocked.push({ path, reason: "proposed content exceeds the size budget" });
          continue;
        }
        if (/\.\.\.\s*(rest|remaining|unchanged)/i.test(after) || /\/\/\s*\.\.\.\s*$/m.test(after)) {
          runBlocked.push({ path, reason: "content contained placeholder elisions" });
          continue;
        }
        if (before !== null && after === before) {
          runBlocked.push({ path, reason: "no change against the current file" });
          continue;
        }
        if (before === null && action === "MODIFY") {
          runBlocked.push({ path, reason: "modify requested for a file that does not exist" });
          continue;
        }
        const d = unifiedDiff(before, after);
        files.push({
          path,
          action: before === null ? "CREATE" : "MODIFY",
          reason: item.reason,
          before,
          after,
          additions: d.additions,
          deletions: d.deletions,
          diff: d.diff,
          truncatedDiff: d.truncated,
        });
      }

      guardrails.push(
        {
          rule: "Scope limited to approved plan files",
          state: runBlocked.some((b) => b.reason.includes("outside")) ? "blocked" : "pass",
          detail: `${files.length} file(s) staged, ${runBlocked.length} rejected`,
        },
        {
          rule: `File budget (max ${MAX_TARGET_FILES} files per run)`,
          state: files.length > MAX_TARGET_FILES ? "blocked" : "pass",
          detail: `${files.length} file(s) changed`,
        },
        {
          rule: "Protected paths (.git, workflows, .env, dependencies, binaries)",
          state: "pass",
          detail: "no protected path accepted",
        },
        {
          rule: "Complete file content only (no placeholder elisions)",
          state: runBlocked.some((b) => b.reason.includes("placeholder")) ? "blocked" : "pass",
          detail: "every staged file carries full content",
        },
        {
          rule: "No commit, branch or push — staged diff only",
          state: "pass",
          detail: "Phase 4 never writes to GitHub",
        },
      );

      if (files.length === 0) {
        attempts.push({
          provider: route.provider,
          model: route.model,
          ok: false,
          detail: `No change survived the guardrails (${runBlocked.length} rejected).`,
          ms,
        });
        continue;
      }

      const audit = recallAudit(`${plan.repository}#${plan.branch}`);
      const changeSet: ChangeSet = {
        changeSetId: `${Date.now().toString(36)}-${plan.commitSha.slice(0, 7)}`,
        taskId: plan.taskId,
        request: plan.request,
        repository: plan.repository,
        branch: plan.branch,
        baseCommitSha: audit?.COMMIT_SHA ?? plan.commitSha,
        createdAt: now(),
        provider: route.provider,
        model: route.model,
        usedFallback: attempts.length > 0,
        committed: false,
        summary: out.summary || `Implemented ${selected.length} plan step(s).`,
        notes: out.notes,
        files,
        blocked: runBlocked,
        guardrails,
        totals: {
          files: files.length,
          additions: files.reduce((n, f) => n + f.additions, 0),
          deletions: files.reduce((n, f) => n + f.deletions, 0),
        },
      };
      attempts.push({
        provider: route.provider,
        model: route.model,
        ok: true,
        detail: `${changeSet.totals.files} file(s), +${changeSet.totals.additions}/-${changeSet.totals.deletions}`,
        ms,
      });
      push("Diff computed against real files", "ok", `+${changeSet.totals.additions} / -${changeSet.totals.deletions}`);
      push("Nothing committed", "ok", "change set is staged for review only");
      return { ok: true, changeSet, attempts, events };
    } catch (error) {
      attempts.push({
        provider: route.provider,
        model: route.model,
        ok: false,
        detail: redact(
          error instanceof Error ? `Invalid coder output: ${error.message}` : "Invalid coder output.",
        ),
        ms,
      });
    }
  }

  push("Implementation failed", "fail", attempts[attempts.length - 1]?.detail ?? "no attempt made");
  return {
    ok: false,
    error: attempts[attempts.length - 1]?.detail ?? "The coder agent produced no usable change.",
    errorKind: attempts.some((a) => a.detail.includes("429")) ? "provider_error" : "bad_output",
    attempts,
    events,
  };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model output was not valid JSON.");
  }
}

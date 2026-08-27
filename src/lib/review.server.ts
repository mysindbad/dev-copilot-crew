import { z } from "zod";
import type { ProviderId } from "./architect.types";
import { callLlm, hasProviderKey, redact } from "./llm.server";
import type {
  ReviewBoardResult,
  ReviewEvent,
  ReviewFinding,
  ReviewerId,
  ReviewerReport,
  Severity,
} from "./review.types";

/**
 * Phase 6 — Multi-agent Review Board.
 *
 * Every reviewer sees ONLY the real staged diff and real repository facts.
 * Nothing is simulated: a reviewer that cannot run is reported as failed,
 * never as an approval.
 */

export interface ReviewFileInput {
  path: string;
  action: "CREATE" | "MODIFY" | "DELETE";
  reason: string;
  additions: number;
  deletions: number;
  diffText: string;
}

export interface ReviewBoardInput {
  changeSetId: string;
  taskId: string;
  request: string;
  repository: string;
  branch: string;
  baseCommitSha: string;
  summary: string;
  files: ReviewFileInput[];
  reviewers: ReviewerId[];
  primaryProvider: ProviderId;
  primaryModel: string;
  fallbackProvider: ProviderId | "none";
  fallbackModel: string;
}

const REVIEWERS: Record<
  ReviewerId,
  { name: string; system: string; checklist: string[] }
> = {
  code: {
    name: "Code Reviewer",
    system:
      "You are the Code Reviewer Agent. You judge correctness, readability, dead code, error handling, naming, duplication and whether the diff actually implements the stated request.",
    checklist: [
      "Diff implements the stated request",
      "No obvious logic or off-by-one errors",
      "Errors are handled, not swallowed",
      "No leftover debug code or placeholders",
    ],
  },
  security: {
    name: "Security Reviewer",
    system:
      "You are the Security Reviewer Agent. You judge injection risks, authentication and authorization gaps, secret handling, unsafe input trust, unsafe dependencies and data exposure.",
    checklist: [
      "No hardcoded secrets or credentials",
      "User input is validated before use",
      "No new unauthenticated privileged path",
      "No sensitive data written to logs or responses",
    ],
  },
  qa: {
    name: "QA / Tester",
    system:
      "You are the QA / Tester Agent. You judge testability, missing tests, regression risk, edge cases and whether the change can be verified.",
    checklist: [
      "Change is testable as written",
      "Edge cases are covered or listed",
      "Existing behaviour is unlikely to regress",
      "A concrete verification path exists",
    ],
  },
};

const OUTPUT_RULES = `Reply with a single JSON object only, no markdown fences, matching:
{
  "verdict": "APPROVE" | "REQUEST_CHANGES",
  "summary": string,
  "findings": [{"severity":"BLOCKER"|"MAJOR"|"MINOR"|"INFO","path":string,"title":string,"detail":string,"suggestion":string}],
  "checklist": [{"item": string, "state": "pass"|"fail"|"unknown"}]
}
Rules:
- Review ONLY the diff shown. Never invent files, functions or lines that are not present.
- If something cannot be judged from the diff, say so with state "unknown" and severity "INFO".
- "path" must be one of the diff file paths, or "-" when it applies to the whole change set.
- Return REQUEST_CHANGES if and only if at least one BLOCKER or MAJOR finding exists.`;

const Schema = z.object({
  verdict: z.string().optional(),
  summary: z.string().default(""),
  findings: z
    .array(
      z.object({
        severity: z.string().optional(),
        path: z.string().default("-"),
        title: z.string().default("Finding"),
        detail: z.string().default(""),
        suggestion: z.string().default(""),
      }),
    )
    .default([]),
  checklist: z
    .array(z.object({ item: z.string(), state: z.string().optional() }))
    .default([]),
});

function now(): string {
  return new Date().toISOString();
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

function severity(value: string | undefined): Severity {
  const v = (value ?? "").toUpperCase();
  return v === "BLOCKER" || v === "MAJOR" || v === "MINOR" ? v : "INFO";
}

const MAX_DIFF_CHARS = 14_000;

function buildDiffContext(input: ReviewBoardInput): string {
  const header = [
    `Repository: ${input.repository}`,
    `Base branch: ${input.branch}`,
    `Base commit: ${input.baseCommitSha}`,
    `Task: ${input.request || input.taskId}`,
    `Coder summary: ${input.summary || "UNKNOWN"}`,
    `Files in change set: ${input.files.length}`,
    "",
  ].join("\n");

  let budget = MAX_DIFF_CHARS;
  const blocks: string[] = [];
  for (const file of input.files) {
    const body = file.diffText.slice(0, Math.max(0, Math.min(budget, 6000)));
    budget -= body.length;
    blocks.push(
      [
        `--- FILE: ${file.path} (${file.action}, +${file.additions}/-${file.deletions})`,
        `Reason: ${file.reason || "UNKNOWN"}`,
        body || "[diff omitted — size budget exhausted]",
      ].join("\n"),
    );
    if (budget <= 0) break;
  }
  return `${header}${blocks.join("\n\n")}`;
}

async function runReviewer(
  reviewer: ReviewerId,
  context: string,
  input: ReviewBoardInput,
): Promise<ReviewerReport> {
  const meta = REVIEWERS[reviewer];
  const chain: { provider: ProviderId; model: string; fallback: boolean }[] = [
    { provider: input.primaryProvider, model: input.primaryModel, fallback: false },
  ];
  if (input.fallbackProvider !== "none" && input.fallbackModel)
    chain.push({ provider: input.fallbackProvider, model: input.fallbackModel, fallback: true });

  const base: ReviewerReport = {
    reviewer,
    name: meta.name,
    ok: false,
    usedFallback: false,
    verdict: "UNKNOWN",
    summary: "",
    findings: [],
    checklist: meta.checklist.map((item) => ({ item, state: "unknown" as const })),
    ms: 0,
  };

  let lastError = "No provider attempt was made.";
  for (const link of chain) {
    if (!hasProviderKey(link.provider)) {
      lastError = `${link.provider} API key is not configured.`;
      continue;
    }
    const started = Date.now();
    const res = await callLlm(
      link.provider,
      link.model,
      `${meta.system}\nYou are READ-ONLY: you never modify code, you only report findings.\n${OUTPUT_RULES}\nChecklist you must answer: ${meta.checklist.join(" | ")}`,
      context,
    );
    const ms = Date.now() - started;
    if (!res.ok || !res.text) {
      lastError = redact(res.error ?? "Provider returned no content.");
      continue;
    }
    try {
      const parsed = Schema.parse(extractJson(res.text));
      const findings: ReviewFinding[] = parsed.findings.map((f) => ({
        severity: severity(f.severity),
        path: f.path || "-",
        title: f.title,
        detail: f.detail,
        suggestion: f.suggestion,
      }));
      const blocking = findings.some(
        (f) => f.severity === "BLOCKER" || f.severity === "MAJOR",
      );
      const declared = (parsed.verdict ?? "").toUpperCase();
      const verdict: ReviewerReport["verdict"] =
        blocking || declared === "REQUEST_CHANGES" ? "REQUEST_CHANGES" : "APPROVE";
      const checklist = meta.checklist.map((item) => {
        const match = parsed.checklist.find(
          (c) => c.item.toLowerCase().slice(0, 18) === item.toLowerCase().slice(0, 18),
        );
        const state = (match?.state ?? "unknown").toLowerCase();
        return {
          item,
          state: (state === "pass" || state === "fail" ? state : "unknown") as
            | "pass"
            | "fail"
            | "unknown",
        };
      });
      return {
        ...base,
        ok: true,
        provider: link.provider,
        model: link.model,
        usedFallback: link.fallback,
        verdict,
        summary: parsed.summary,
        findings,
        checklist,
        ms,
      };
    } catch (error) {
      lastError = redact(
        error instanceof Error ? error.message : "Reviewer output could not be parsed.",
      );
    }
  }

  return { ...base, error: lastError };
}

export async function runReviewBoard(input: ReviewBoardInput): Promise<ReviewBoardResult> {
  const events: ReviewEvent[] = [];
  const push = (label: string, state: ReviewEvent["state"], detail: string) =>
    events.push({ label, state, detail, at: now() });

  const shell = {
    changeSetId: input.changeSetId,
    repository: input.repository,
    branch: input.branch,
    baseCommitSha: input.baseCommitSha,
    createdAt: now(),
    events,
  };

  if (!input.files.length)
    return {
      ...shell,
      ok: false,
      reports: [],
      totals: { blockers: 0, majors: 0, minors: 0, infos: 0 },
      gate: "FAILED",
      error: "There is no staged change set to review.",
      errorKind: "no_changeset",
    };

  const providers: ProviderId[] = [input.primaryProvider];
  if (input.fallbackProvider !== "none") providers.push(input.fallbackProvider);
  if (!providers.some(hasProviderKey))
    return {
      ...shell,
      ok: false,
      reports: [],
      totals: { blockers: 0, majors: 0, minors: 0, infos: 0 },
      gate: "FAILED",
      error: "No AI provider key is configured for the review board.",
      errorKind: "no_provider",
    };

  const context = buildDiffContext(input);
  push("Diff packaged for review", "ok", `${input.files.length} file(s), ${context.length} chars`);

  const wanted = input.reviewers.length
    ? input.reviewers
    : (["code", "security", "qa"] as ReviewerId[]);

  const reports = await Promise.all(wanted.map((r) => runReviewer(r, context, input)));
  for (const report of reports) {
    push(
      `${report.name} review`,
      report.ok ? (report.verdict === "APPROVE" ? "ok" : "warn") : "fail",
      report.ok
        ? `${report.verdict} · ${report.findings.length} finding(s) · ${report.model} · ${report.ms}ms`
        : (report.error ?? "reviewer failed"),
    );
  }

  const all = reports.flatMap((r) => r.findings);
  const totals = {
    blockers: all.filter((f) => f.severity === "BLOCKER").length,
    majors: all.filter((f) => f.severity === "MAJOR").length,
    minors: all.filter((f) => f.severity === "MINOR").length,
    infos: all.filter((f) => f.severity === "INFO").length,
  };

  const anyOk = reports.some((r) => r.ok);
  const allOk = reports.every((r) => r.ok);
  const gate: ReviewBoardResult["gate"] = !allOk
    ? "FAILED"
    : reports.every((r) => r.verdict === "APPROVE")
      ? "APPROVED"
      : "CHANGES_REQUESTED";

  push(
    "Review board verdict",
    gate === "APPROVED" ? "ok" : gate === "CHANGES_REQUESTED" ? "warn" : "fail",
    `${gate} · ${totals.blockers} blocker(s), ${totals.majors} major(s)`,
  );

  return {
    ...shell,
    ok: anyOk,
    reports,
    totals,
    gate,
    ...(allOk
      ? {}
      : {
          error: "At least one reviewer could not complete — the change set is not approved.",
          errorKind: "provider_error" as const,
        }),
  };
}

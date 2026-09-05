import { z } from "zod";
import type {
  ArchitectAttempt,
  ArchitectPlan,
  ArchitectResult,
  ProviderId,
} from "./architect.types";
import type { RepositoryAudit } from "./inspection.types";
import { recallAudit, rememberAudit } from "./project-memory.server";
import { inspectRepositoryReal, parseRepoUrl } from "./inspection.server";
import { callLlm, hasProviderKey, redact } from "./llm.server";
import { extractJsonLoose } from "./json-extract";

const SYSTEM = `You are the Architect Agent of a multi-agent software engineering platform.
You are READ-ONLY: you never write files and never claim to have changed anything.
You receive a factual audit of a real repository and a user request.
Rules:
- Use ONLY the facts given. Never invent files, endpoints, frameworks or commands.
- If a file path is not in the provided repository facts, mark it as a new file to CREATE.
- If something cannot be determined from the facts, write "UNKNOWN" and add it to openQuestions.
- Reply with a single JSON object only, no markdown fences, matching this shape:
{
  "summary": string,
  "approach": string,
  "assumptions": string[],
  "affectedFiles": [{"path": string, "change": "CREATE"|"MODIFY"|"DELETE", "reason": string}],
  "steps": [{"order": number, "title": string, "detail": string, "agent": string, "files": string[], "risk": "LOW"|"MEDIUM"|"HIGH"}],
  "testStrategy": string[],
  "risks": string[],
  "openQuestions": string[],
  "outOfScope": string[]
}
Valid agent values: "Frontend Developer", "Backend Developer", "QA / Tester", "Security Reviewer", "Code Reviewer", "Debugger", "UI/UX Reviewer".`;

const PlanSchema = z.object({
  summary: z.string(),
  approach: z.string(),
  assumptions: z.array(z.string()).default([]),
  affectedFiles: z
    .array(
      z.object({
        path: z.string(),
        change: z.string().optional(),
        reason: z.string().default(""),
      }),
    )
    .default([]),
  steps: z
    .array(
      z.object({
        order: z.number().optional(),
        title: z.string(),
        detail: z.string().default(""),
        agent: z.string().default("UNKNOWN"),
        files: z.array(z.string()).default([]),
        risk: z.string().optional(),
      }),
    )
    .default([]),
  testStrategy: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
});

function extractJson(text: string): unknown {
  return extractJsonLoose(text);
}

function buildFacts(audit: RepositoryAudit): string[] {
  const facts: string[] = [
    `Repository: ${audit.repository} (branch ${audit.branch}, commit ${audit.commitSha.slice(0, 7)})`,
    `Frontend: ${audit.stack.frontend.value}`,
    `Backend: ${audit.stack.backend.value}`,
    `Database: ${audit.stack.database.value}`,
    `Deployment: ${audit.stack.deployment.value}`,
    `Package manager: ${audit.stack.packageManager.value}`,
    `Languages: ${audit.stack.languages.join(", ") || "UNKNOWN"}`,
    `Build command: ${audit.buildCommand || "UNKNOWN"}`,
    `Dev command: ${audit.devCommand || "UNKNOWN"}`,
    `Files inspected: ${audit.counts.inspectedFiles} of ${audit.counts.totalFiles}`,
    `Inspectable text files read: ${audit.counts.inspectedFiles} of ${audit.counts.inspectableFiles}`,
    `Inspection coverage: ${audit.coverageComplete ? "COMPLETE" : "PARTIAL — never claim a comprehensive audit"}`,
    `Tests: ${audit.tests.hasTests ? audit.tests.frameworks.join(", ") || "present" : "none detected"}`,
  ];
  return facts;
}

function buildPrompt(audit: RepositoryAudit, request: string): string {
  const lines: string[] = [];
  lines.push("USER REQUEST:", request, "");
  lines.push("REPOSITORY FACTS:", ...buildFacts(audit).map((f) => `- ${f}`), "");
  lines.push(
    "ENTRY POINTS:",
    ...(audit.entryPoints.length
      ? audit.entryPoints.map((e) => `- ${e.path} (${e.role})`)
      : ["- UNKNOWN"]),
    "",
  );
  lines.push(
    "IMPORTANT FILES:",
    ...audit.importantFiles.slice(0, 60).map((f) => `- ${f.path} [${f.category}] ${f.reason}`),
    "",
  );
  lines.push(
    "DIRECTORIES:",
    ...audit.directories.slice(0, 40).map((d) => `- ${d.path} (${d.files} files) ${d.role}`),
    "",
  );
  lines.push(
    "API ENDPOINTS:",
    ...(audit.apiMap.length
      ? audit.apiMap
          .slice(0, 50)
          .map((a) => `- ${a.method} ${a.path} in ${a.file} — auth: ${a.authentication}`)
      : ["- none detected"]),
    "",
  );
  lines.push(
    "ENV VARIABLE NAMES (values never read):",
    ...(audit.envReferences.length
      ? audit.envReferences.slice(0, 40).map((e) => `- ${e.name}`)
      : ["- none detected"]),
    "",
  );
  lines.push(
    "TEST COMMANDS:",
    ...(audit.tests.commands.length
      ? audit.tests.commands.map((c) => `- ${c.name}: ${c.command}`)
      : ["- UNKNOWN"]),
    "",
  );
  lines.push(
    "KNOWN RISKS:",
    ...(audit.risks.length ? audit.risks.map((r) => `- ${r}`) : ["- none recorded"]),
    "",
  );
  lines.push(
    "UNKNOWNS:",
    ...(audit.unknowns.length ? audit.unknowns.map((u) => `- ${u}`) : ["- none recorded"]),
  );
  return lines.join("\n");
}

export interface ArchitectArgs {
  projectId: string;
  request: string;
  primaryProvider: ProviderId;
  primaryModel: string;
  backupModels?: string[];
  fallbackProvider: ProviderId | "none";
  fallbackModel: string;
}

export async function generatePlanReal(args: ArchitectArgs): Promise<ArchitectResult> {
  const attempts: ArchitectAttempt[] = [];
  let memory = recallAudit(args.projectId);
  // Cloudflare Workers may serve inspection and planning from different isolates.
  // Rebuild the audit from the immutable project identity when local memory is absent.
  if (!memory) {
    const separator = args.projectId.lastIndexOf("#");
    const repoUrl = separator > 0 ? args.projectId.slice(0, separator) : "";
    const branch = separator > 0 ? args.projectId.slice(separator + 1) : "";
    if (repoUrl && branch && parseRepoUrl(repoUrl)) {
      const refreshed = await inspectRepositoryReal({ repoUrl, branch });
      if (refreshed.ok && refreshed.audit) {
        rememberAudit(refreshed.audit);
        memory = recallAudit(args.projectId);
      }
    }
  }
  if (!memory) {
    return {
      ok: false,
      error: "No repository audit could be loaded. Re-run inspection and try again.",
      errorKind: "no_audit",
      attempts,
    };
  }

  const comprehensiveRequest = /comprehensive|entire repository|all (?:errors|bugs|issues)|every (?:error|bug|issue)|فحص شامل|جميع الأخطاء|كل الأخطاء/i.test(
    args.request,
  );
  if (comprehensiveRequest && !memory.COVERAGE_COMPLETE) {
    return {
      ok: false,
      error: `A comprehensive audit cannot start because repository coverage is partial (${memory.INSPECTED_FILES} of ${memory.INSPECTABLE_FILES} inspectable text files read). Re-run inspection or narrow the task.`,
      errorKind: "incomplete_audit",
      attempts,
    };
  }

  // The memory entry mirrors the audit; rebuild the subset the prompt needs.
  const audit = {
    repository: memory.REPOSITORY,
    branch: memory.BRANCH,
    commitSha: memory.COMMIT_SHA,
    stack: memory.STACK,
    entryPoints: memory.ENTRY_POINTS,
    importantFiles: memory.IMPORTANT_FILES.map((path) => ({
      path,
      category: "UNKNOWN" as const,
      reason: "listed as important by inspection",
    })),
    directories: [],
    apiMap: memory.API_MAP,
    envReferences: memory.ENV_REFERENCES,
    tests: {
      frameworks: [],
      testFiles: [],
      commands: memory.TEST_COMMANDS,
      hasTests: memory.TEST_COMMANDS.length > 0,
    },
    buildCommand: memory.BUILD_COMMAND,
    devCommand: "UNKNOWN",
    counts: {
      totalFiles: memory.TOTAL_FILES,
      inspectableFiles: memory.INSPECTABLE_FILES,
      inspectedFiles: memory.INSPECTED_FILES,
      skippedFiles: Math.max(0, memory.TOTAL_FILES - memory.INSPECTED_FILES),
      byCategory: {},
    },
    coverageComplete: memory.COVERAGE_COMPLETE,
    inspectedPaths: memory.INSPECTED_PATHS,
    risks: memory.KNOWN_RISKS,
    unknowns: memory.UNKNOWNS,
  } as unknown as RepositoryAudit;

  const knownPaths = new Set(memory.INSPECTED_PATHS.concat(memory.ENTRY_POINTS.map((e) => e.path)));
  const prompt = buildPrompt(audit, args.request);

  const routes: { provider: ProviderId; model: string }[] = [];
  if (args.primaryModel) routes.push({ provider: args.primaryProvider, model: args.primaryModel });
  for (const model of args.backupModels ?? []) {
    if (model && !routes.some((route) => route.provider === args.primaryProvider && route.model === model)) {
      routes.push({ provider: args.primaryProvider, model });
    }
  }
  if (
    args.fallbackProvider !== "none" &&
    args.fallbackModel &&
    !routes.some(
      (route) => route.provider === args.fallbackProvider && route.model === args.fallbackModel,
    )
  )
    routes.push({ provider: args.fallbackProvider, model: args.fallbackModel });

  if (routes.length === 0) {
    return {
      ok: false,
      error: "No model selected. Test a provider and pick a model first.",
      errorKind: "no_provider",
      attempts,
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
    const res = await callLlm(route.provider, route.model, SYSTEM, prompt, {
      maxAttempts: 1,
      timeoutMs: 35_000,
    });
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
      const parsed = PlanSchema.parse(extractJson(res.text));
      const plan: ArchitectPlan = {
        taskId: `${Date.now().toString(36)}-${memory.COMMIT_SHA.slice(0, 7)}`,
        request: args.request,
        repository: memory.REPOSITORY,
        branch: memory.BRANCH,
        commitSha: memory.COMMIT_SHA,
        createdAt: new Date().toISOString(),
        provider: route.provider,
        model: route.model,
        usedFallback: attempts.length > 0,
        summary: parsed.summary,
        approach: parsed.approach,
        assumptions: parsed.assumptions,
        affectedFiles: parsed.affectedFiles.map((f) => ({
          path: f.path,
          change:
            f.change === "CREATE" || f.change === "MODIFY" || f.change === "DELETE"
              ? f.change
              : "UNKNOWN",
          reason: f.reason,
          existsInRepo: knownPaths.has(f.path),
        })),
        steps: parsed.steps.map((s, i) => ({
          order: s.order ?? i + 1,
          title: s.title,
          detail: s.detail,
          agent: s.agent,
          files: s.files,
          risk:
            s.risk === "LOW" || s.risk === "MEDIUM" || s.risk === "HIGH" ? s.risk : "UNKNOWN",
        })),
        testStrategy: parsed.testStrategy,
        risks: parsed.risks,
        openQuestions: parsed.openQuestions,
        outOfScope: parsed.outOfScope,
        groundingFacts: buildFacts(audit),
      };
      attempts.push({
        provider: route.provider,
        model: route.model,
        ok: true,
        detail: `Plan generated (${plan.steps.length} steps)`,
        ms,
      });
      return { ok: true, plan, attempts };
    } catch (error) {
      attempts.push({
        provider: route.provider,
        model: route.model,
        ok: false,
        detail: redact(
          error instanceof Error ? `Invalid plan output: ${error.message}` : "Invalid plan output.",
        ),
        ms,
      });
    }
  }

  const rateLimited = attempts.some((a) => /429|rate limit|quota/i.test(a.detail));
  const attemptSummary = attempts
    .map((attempt) => `${attempt.model}: ${attempt.detail}`)
    .join(" | ")
    .slice(0, 900);
  return {
    ok: false,
    error: rateLimited
      ? `Every route was rate limited or out of quota. ${attemptSummary}`
      : `All configured model routes failed. ${attemptSummary}`,
    errorKind: rateLimited ? "rate_limit" : "provider_error",
    attempts,
  };
}

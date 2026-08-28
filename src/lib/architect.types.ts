/**
 * Phase 3 — Architect Agent contracts.
 *
 * The Architect is a READ-ONLY planning agent. It consumes the Phase 2
 * repository audit (real facts only) and returns a structured technical plan.
 * It never writes files, never commits, and never receives credentials.
 */

/** All AI providers the app can route to. OpenAI-compatible ones share one call path. */
export const PROVIDER_IDS = [
  "gemini",
  "openrouter",
  "lovable",
  "groq",
  "mistral",
  "huggingface",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Provider ids plus the synthetic "none" used for fallback selection. */
export const FALLBACK_PROVIDER_IDS = [...PROVIDER_IDS, "none"] as const;
export type FallbackProviderId = (typeof FALLBACK_PROVIDER_IDS)[number];

export interface PlanFileChange {
  path: string;
  change: "CREATE" | "MODIFY" | "DELETE" | "UNKNOWN";
  reason: string;
  existsInRepo: boolean;
}

export interface PlanStep {
  order: number;
  title: string;
  detail: string;
  agent: string;
  files: string[];
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
}

export interface ArchitectPlan {
  taskId: string;
  request: string;
  repository: string;
  branch: string;
  commitSha: string;
  createdAt: string;
  provider: ProviderId;
  model: string;
  usedFallback: boolean;
  summary: string;
  approach: string;
  assumptions: string[];
  affectedFiles: PlanFileChange[];
  steps: PlanStep[];
  testStrategy: string[];
  risks: string[];
  openQuestions: string[];
  outOfScope: string[];
  groundingFacts: string[];
}

export interface ArchitectAttempt {
  provider: ProviderId;
  model: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface ArchitectResult {
  ok: boolean;
  plan?: ArchitectPlan | undefined;
  error?: string | undefined;
  errorKind?:
    | "no_audit"
    | "incomplete_audit"
    | "no_provider"
    | "provider_error"
    | "rate_limit"
    | "bad_output"
    | "unknown"
    | undefined;
  attempts: ArchitectAttempt[];
}

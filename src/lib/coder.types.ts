/**
 * Phase 4 — Coder Agent contracts.
 *
 * The Coder Agent applies an Architect plan to real repository files under
 * strict guardrails. It produces a STAGED change set with real unified diffs
 * computed against the actual file content at the audited commit.
 * It never pushes, never commits, and never receives credentials.
 */

import type { ProviderId } from "./architect.types";

export type FileAction = "CREATE" | "MODIFY" | "DELETE";

export interface DiffLine {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
}

export interface StagedFile {
  path: string;
  action: FileAction;
  reason: string;
  /** Content at the audited commit, or null for a new file. */
  before: string | null;
  /** Proposed content, or null for a deletion. */
  after: string | null;
  additions: number;
  deletions: number;
  diff: DiffLine[];
  truncatedDiff: boolean;
}

export interface GuardrailReport {
  rule: string;
  state: "pass" | "blocked";
  detail: string;
}

export interface CoderEvent {
  label: string;
  state: "ok" | "fail" | "warn";
  detail: string;
  at: string;
}

export interface ChangeSet {
  changeSetId: string;
  taskId: string;
  request: string;
  repository: string;
  branch: string;
  baseCommitSha: string;
  createdAt: string;
  provider: ProviderId;
  model: string;
  usedFallback: boolean;
  /** Always false in Phase 4 — nothing is ever committed or pushed. */
  committed: false;
  summary: string;
  notes: string[];
  files: StagedFile[];
  blocked: { path: string; reason: string }[];
  guardrails: GuardrailReport[];
  totals: { files: number; additions: number; deletions: number };
}

export interface CoderAttempt {
  provider: ProviderId;
  model: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface CoderResult {
  ok: boolean;
  changeSet?: ChangeSet | undefined;
  error?: string | undefined;
  errorKind?:
    | "no_plan"
    | "no_provider"
    | "no_targets"
    | "repo_read"
    | "provider_error"
    | "bad_output"
    | "all_blocked"
    | "unknown"
    | undefined;
  attempts: CoderAttempt[];
  events: CoderEvent[];
}

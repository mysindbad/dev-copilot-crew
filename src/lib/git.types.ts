/**
 * Phase 5 — Git Manager contracts.
 *
 * The Git Manager is the ONLY component allowed to write to GitHub. It takes a
 * staged change set produced by the Coder Agent and, after explicit human
 * approval, creates a dedicated branch, commits the exact staged content and
 * optionally opens a pull request. It never force-pushes and never writes to
 * the base branch.
 */

export interface GitCheck {
  label: string;
  state: "pass" | "fail" | "warn" | "skip";
  detail: string;
}

export interface GitEvent {
  label: string;
  state: "ok" | "fail" | "warn";
  detail: string;
  at: string;
}

export interface GitCommitReport {
  repository: string;
  baseBranch: string;
  baseCommitSha: string;
  branch: string;
  branchUrl: string;
  commitSha: string;
  commitUrl: string;
  message: string;
  files: { path: string; action: string }[];
  pullRequest?:
    | { number: number; url: string; title: string; state: string }
    | undefined;
  createdAt: string;
}

export type GitErrorKind =
  | "no_changeset"
  | "no_token"
  | "no_write_access"
  | "branch_exists"
  | "base_moved"
  | "rate_limit"
  | "github_error"
  | "network"
  | "unknown";

export interface GitResult {
  ok: boolean;
  dryRun: boolean;
  report?: GitCommitReport | undefined;
  checks: GitCheck[];
  events: GitEvent[];
  error?: string | undefined;
  errorKind?: GitErrorKind | undefined;
}

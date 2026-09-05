/**
 * Phase 6 — Review Board contracts.
 *
 * Three read-only reviewer agents (Code Reviewer, Security Reviewer, QA / Tester)
 * inspect the STAGED diff produced by the Coder Agent before anything is
 * committed. They never write files, never commit and never receive credentials.
 */

import type { ProviderId } from "./architect.types";

export type ReviewerId = "code" | "security" | "qa";

export type Severity = "BLOCKER" | "MAJOR" | "MINOR" | "INFO";

export interface ReviewFinding {
  severity: Severity;
  path: string;
  title: string;
  detail: string;
  suggestion: string;
}

export interface ReviewerReport {
  reviewer: ReviewerId;
  name: string;
  ok: boolean;
  provider?: ProviderId;
  model?: string;
  usedFallback: boolean;
  verdict: "APPROVE" | "REQUEST_CHANGES" | "UNKNOWN";
  summary: string;
  findings: ReviewFinding[];
  checklist: { item: string; state: "pass" | "fail" | "unknown" }[];
  ms: number;
  error?: string;
}

export interface ReviewEvent {
  label: string;
  state: "ok" | "warn" | "fail";
  detail: string;
  at: string;
}

/**
 * What the review board ACTUALLY verified. Static today: the board is an
 * AI-only diff review — the platform has no build/test/lint runner, so none
 * of these may ever be reported as "passed". These statuses are the honest
 * vocabulary the UI shows next to the gate (not_run / not_available /
 * ai_review_only).
 */
export const VERIFICATION_STATUS = {
  lint: "not_available",
  typecheck: "not_available",
  tests: "not_run",
  build: "not_run",
  security: "ai_review_only",
} as const;

export type VerificationStatus = (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

export interface ReviewBoardResult {
  ok: boolean;
  changeSetId: string;
  repository: string;
  branch: string;
  baseCommitSha: string;
  createdAt: string;
  reports: ReviewerReport[];
  events: ReviewEvent[];
  totals: { blockers: number; majors: number; minors: number; infos: number };
  gate: "APPROVED" | "CHANGES_REQUESTED" | "FAILED";
  verification: VerificationStatus;
  error?: string;
  errorKind?: "no_changeset" | "no_provider" | "provider_error" | "invalid_input" | "unknown";
}

/**
 * Persistent project-state contracts.
 *
 * The platform persists a machine-readable checkpoint of its work into the
 * target repository under `.ai-dev-hub/`. A fresh environment clones the repo,
 * reads that directory, and reconstructs where development stopped — without
 * any secrets, tokens or credentials ever leaving the server.
 *
 * The persisted state is a CHECKPOINT, not an authority: when it conflicts
 * with the actual source code or Git history, the code wins and the state is
 * repaired.
 */
import type { UserSecrets } from "./user-secrets";

export const STATE_DIR = ".ai-dev-hub";
export const STATE_SCHEMA_VERSION = 1;
export const PLATFORM_VERSION = "1.0.0";
export const ARCHITECTURE_VERSION = "agent-pipeline-v1";

/** The pipeline phases, mirrored from the workspace so this file has no client import. */
export type StatePhase =
  | "idle"
  | "inspect"
  | "plan"
  | "code"
  | "review"
  | "git"
  | "done"
  | "failed";

export type BuildTestStatus = "unknown" | "passing" | "failing";

export interface WorkspaceFlags {
  hasAudit: boolean;
  hasPlan: boolean;
  hasChangeSet: boolean;
  hasReview: boolean;
  hasGitResult: boolean;
}

/** Stable, machine-readable project snapshot. No secrets, no token values. */
export interface ProjectState {
  schemaVersion: number;
  platformVersion: string;
  architectureVersion: string;
  /** Monotonic checkpoint counter; incremented on every persisted state update. */
  stateVersion: number;
  updatedAt: string;

  repository: {
    fullName: string;
    branch: string;
    /** The actual base-branch head SHA at checkpoint time (server-verified). */
    lastCommitSha: string;
  };

  phase: StatePhase;
  completedPhases: StatePhase[];
  activePhase: StatePhase | null;

  /** What the connected project can do (names only, never keys). */
  capabilities: string[];
  enabledIntegrations: string[];
  configuredProviders: string[];
  defaultModel: string | null;

  workspace: WorkspaceFlags;

  buildStatus: BuildTestStatus;
  testStatus: BuildTestStatus;

  pendingWork: string[];
  knownProblems: string[];

  lastSuccessfulOperation: string | null;
  lastFailedOperation: string | null;
  recommendedNextAction: string | null;
}

/** The task the agent is currently working on (or last worked on). */
export interface CurrentTask {
  task: string;
  status: "not_started" | "in_progress" | "completed" | "blocked" | "failed";
  phase: string;
  completed: string[];
  remaining: string[];
  lastAction: string;
  nextAction: string;
  updatedAt: string;
}

/** Compact, evidence-based facts about the target repository, from the audit. */
export interface AuditFacts {
  repository: string;
  branch: string;
  commitSha: string;
  frontend: string;
  backend: string;
  database: string;
  deployment: string;
  packageManager: string;
  languages: string[];
  entryPoints: string[];
  apiRoutes: number;
  fileCount: number;
  buildCommand: string;
  devCommand: string;
  /** Environment variable NAMES only — values are never captured. */
  envNames: string[];
  risks: string[];
}

/**
 * Everything the server needs to persist one checkpoint. `secrets` is NOT here:
 * credentials travel per-request via the secrets override store and are handled
 * by the server-function wrapper, never passed into the state logic.
 */
export interface CheckpointRequest {
  repository: string;
  branch: string;
  phase: StatePhase;
  completedPhases: StatePhase[];
  capabilities: string[];
  enabledIntegrations: string[];
  configuredProviders: string[];
  defaultModel: string | null;
  workspace: WorkspaceFlags;
  buildStatus: BuildTestStatus;
  testStatus: BuildTestStatus;
  pendingWork: string[];
  knownProblems: string[];
  lastSuccessfulOperation: string | null;
  lastFailedOperation: string | null;
  recommendedNextAction: string | null;
  task: CurrentTask;
  /** Null when no audit is available yet. */
  auditFacts: AuditFacts | null;
  newDecisions: string[];
}

export interface RecoveredState {
  state: ProjectState | null;
  task: CurrentTask | null;
  progressMd: string | null;
  architectureMd: string | null;
  decisionsMd: string | null;
}

export interface BootstrapResult {
  ok: boolean;
  recovered: RecoveredState;
  /** The actual base-branch head SHA at recovery time (server-verified). */
  actualCommitSha: string | null;
  /** True when the persisted state agrees with the live repository. */
  consistent: boolean;
  /** Human-readable inconsistencies between the checkpoint and the live repo. */
  inconsistencies: string[];
  error?: string;
}

export interface StateCommitResult {
  ok: boolean;
  commitSha?: string;
  commitUrl?: string;
  stateVersion?: number;
  error?: string;
}

/** Re-exported so the client can read the constant without importing server code. */
export type { UserSecrets };

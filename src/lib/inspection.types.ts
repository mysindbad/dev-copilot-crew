/**
 * Phase 2 — repository inspection contracts.
 *
 * These types are the stable contract a future Architect Agent (Phase 3) will
 * consume. They contain repository facts only — never credentials.
 */

export type FileCategory =
  | "SOURCE"
  | "CONFIG"
  | "DEPENDENCY"
  | "API"
  | "BACKEND"
  | "FRONTEND"
  | "DATABASE"
  | "TEST"
  | "DEPLOYMENT"
  | "DOCUMENTATION"
  | "ASSET"
  | "GENERATED"
  | "UNKNOWN";

export const UNKNOWN = "UNKNOWN" as const;

export interface ClassifiedFile {
  path: string;
  size: number;
  category: FileCategory;
}

export interface StackDetection {
  /** Detected value, or "UNKNOWN" when there is no evidence. */
  value: string;
  /** Real file paths / package names that justify the detection. */
  evidence: string[];
}

export interface Stack {
  frontend: StackDetection;
  backend: StackDetection;
  database: StackDetection;
  deployment: StackDetection;
  packageManager: StackDetection;
  languages: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
  purpose: string;
  authentication: string;
  externalDependencies: string[];
}

export interface DataFlowStep {
  label: string;
  files: string[];
}

export interface DataFlow {
  title: string;
  steps: DataFlowStep[];
}

export interface EnvReference {
  /** Variable NAME only. Values are never read, stored or transmitted. */
  name: string;
  referencedBy: string[];
}

export interface TestAudit {
  frameworks: string[];
  testFiles: string[];
  commands: { name: string; command: string }[];
  hasTests: boolean;
}

export interface HealthCategory {
  category: string;
  status: "GOOD" | "PARTIAL" | "WEAK" | "UNKNOWN";
  evidence: string;
}

export interface InspectionEvent {
  label: string;
  state: "ok" | "fail" | "warn";
  detail: string;
  at: string;
}

export interface RepositoryAudit {
  projectId: string;
  repository: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  commitDate: string;
  inspectedAt: string;
  private: boolean;
  truncatedTree: boolean;
  largeRepository: boolean;
  counts: {
    totalFiles: number;
    inspectableFiles: number;
    inspectedFiles: number;
    skippedFiles: number;
    byCategory: Record<string, number>;
  };
  /** True only when every inspectable text file in the returned Git tree was read. */
  coverageComplete: boolean;
  /** Real paths whose contents were read; never inferred paths. */
  inspectedPaths: string[];
  stack: Stack;
  entryPoints: { path: string; role: string }[];
  importantFiles: { path: string; category: FileCategory; reason: string }[];
  directories: { path: string; files: number; role: string }[];
  apiMap: ApiEndpoint[];
  dataFlow: DataFlow[];
  envReferences: EnvReference[];
  tests: TestAudit;
  buildCommand: string;
  devCommand: string;
  architecture: string[];
  health: HealthCategory[];
  risks: string[];
  unknowns: string[];
  events: InspectionEvent[];
}

export type InspectionErrorKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "invalid_branch"
  | "rate_limit"
  | "network"
  | "empty_repository"
  | "no_token"
  | "invalid_url"
  | "unknown";

export interface InspectionResult {
  ok: boolean;
  audit?: RepositoryAudit | undefined;
  cached?: boolean | undefined;
  error?: string | undefined;
  errorKind?: InspectionErrorKind | undefined;
  rateLimit?: { remaining: number; resetAt: string } | undefined;
  events: InspectionEvent[];
}


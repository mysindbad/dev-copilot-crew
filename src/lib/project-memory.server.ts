import type { RepositoryAudit } from "./inspection.types";

/**
 * Project Memory — server-side store of the latest repository audit per
 * project (repository + branch). It holds repository facts only: no tokens,
 * no API keys, no environment variable values.
 */

export interface ProjectMemoryEntry {
  PROJECT_ID: string;
  REPOSITORY: string;
  BRANCH: string;
  LAST_INSPECTION: string;
  COMMIT_SHA: string;
  STACK: RepositoryAudit["stack"];
  ENTRY_POINTS: RepositoryAudit["entryPoints"];
  ARCHITECTURE: string[];
  API_MAP: RepositoryAudit["apiMap"];
  DATA_FLOW: RepositoryAudit["dataFlow"];
  ENV_REFERENCES: { name: string; referencedBy: string[] }[];
  TEST_COMMANDS: { name: string; command: string }[];
  BUILD_COMMAND: string;
  DEPLOYMENT: string;
  IMPORTANT_FILES: string[];
  TOTAL_FILES: number;
  INSPECTABLE_FILES: number;
  INSPECTED_FILES: number;
  COVERAGE_COMPLETE: boolean;
  INSPECTED_PATHS: string[];
  KNOWN_RISKS: string[];
  UNKNOWNS: string[];
}

const memory = new Map<string, ProjectMemoryEntry>();

export function rememberAudit(audit: RepositoryAudit): ProjectMemoryEntry {
  const entry: ProjectMemoryEntry = {
    PROJECT_ID: audit.projectId,
    REPOSITORY: audit.repository,
    BRANCH: audit.branch,
    LAST_INSPECTION: audit.inspectedAt,
    COMMIT_SHA: audit.commitSha,
    STACK: audit.stack,
    ENTRY_POINTS: audit.entryPoints,
    ARCHITECTURE: audit.architecture,
    API_MAP: audit.apiMap,
    DATA_FLOW: audit.dataFlow,
    // Names only — values are never captured.
    ENV_REFERENCES: audit.envReferences.map((e) => ({ name: e.name, referencedBy: e.referencedBy })),
    TEST_COMMANDS: audit.tests.commands,
    BUILD_COMMAND: audit.buildCommand,
    DEPLOYMENT: audit.stack.deployment.value,
    IMPORTANT_FILES: audit.importantFiles.map((f) => f.path),
    TOTAL_FILES: audit.counts.totalFiles,
    INSPECTABLE_FILES: audit.counts.inspectableFiles,
    INSPECTED_FILES: audit.counts.inspectedFiles,
    COVERAGE_COMPLETE: audit.coverageComplete,
    INSPECTED_PATHS: audit.inspectedPaths,
    KNOWN_RISKS: audit.risks,
    UNKNOWNS: audit.unknowns,
  };
  memory.set(entry.PROJECT_ID, entry);
  return entry;
}

export function recallAudit(projectId: string): ProjectMemoryEntry | undefined {
  return memory.get(projectId);
}

export function listMemory(): ProjectMemoryEntry[] {
  return [...memory.values()];
}

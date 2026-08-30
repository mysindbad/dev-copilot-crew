import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SecretsPayload } from "./user-secrets";
import { STATE_SCHEMA_VERSION } from "./state.types";

/**
 * Server-function surface for the persistent project-state layer.
 *
 * - `bootstrapProjectState`: read `.ai-dev-hub/` from a repository and
 *   reconstruct project context (with consistency checks).
 * - `checkpointProjectState`: persist a checkpoint back into the repository.
 *
 * Credentials travel per-request via the secrets override store and never leave
 * the handler.
 */

const BootstrapInput = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1),
  secrets: SecretsPayload,
});

export const bootstrapProjectState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BootstrapInput.parse(input))
  .handler(async ({ data }) => {
    const { bootstrapStateReal } = await import("./state.server");
    const { withSecrets } = await import("./secrets.server");
    return withSecrets(data.secrets, async () =>
      bootstrapStateReal({ repoUrl: data.repoUrl, branch: data.branch }),
    );
  });

const TaskSchema = z.object({
  task: z.string(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked", "failed"]),
  phase: z.string(),
  completed: z.array(z.string()).default([]),
  remaining: z.array(z.string()).default([]),
  lastAction: z.string(),
  nextAction: z.string(),
  updatedAt: z.string(),
});

const AuditFactsSchema = z.object({
  repository: z.string(),
  branch: z.string(),
  commitSha: z.string(),
  frontend: z.string(),
  backend: z.string(),
  database: z.string(),
  deployment: z.string(),
  packageManager: z.string(),
  languages: z.array(z.string()).default([]),
  entryPoints: z.array(z.string()).default([]),
  apiRoutes: z.number(),
  fileCount: z.number(),
  buildCommand: z.string(),
  devCommand: z.string(),
  envNames: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

const CheckpointInput = z.object({
  repository: z.string().min(1),
  branch: z.string().min(1),
  phase: z.enum([
    "idle",
    "inspect",
    "plan",
    "code",
    "review",
    "git",
    "done",
    "failed",
  ]),
  completedPhases: z
    .array(
      z.enum([
        "idle",
        "inspect",
        "plan",
        "code",
        "review",
        "git",
        "done",
        "failed",
      ]),
    )
    .default([]),
  capabilities: z.array(z.string()).default([]),
  enabledIntegrations: z.array(z.string()).default([]),
  configuredProviders: z.array(z.string()).default([]),
  defaultModel: z.string().nullable().default(null),
  workspace: z.object({
    hasAudit: z.boolean(),
    hasPlan: z.boolean(),
    hasChangeSet: z.boolean(),
    hasReview: z.boolean(),
    hasGitResult: z.boolean(),
  }),
  buildStatus: z.enum(["unknown", "passing", "failing"]),
  testStatus: z.enum(["unknown", "passing", "failing"]),
  pendingWork: z.array(z.string()).default([]),
  knownProblems: z.array(z.string()).default([]),
  lastSuccessfulOperation: z.string().nullable().default(null),
  lastFailedOperation: z.string().nullable().default(null),
  recommendedNextAction: z.string().nullable().default(null),
  task: TaskSchema,
  auditFacts: AuditFactsSchema.nullable().default(null),
  newDecisions: z.array(z.string()).default([]),
  secrets: SecretsPayload,
});

export const checkpointProjectState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CheckpointInput.parse(input))
  .handler(async ({ data }) => {
    const { checkpointStateReal } = await import("./state.server");
    const { withSecrets } = await import("./secrets.server");
    return withSecrets(data.secrets, async () => checkpointStateReal(data));
  });

export { STATE_SCHEMA_VERSION };

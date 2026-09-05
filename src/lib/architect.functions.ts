import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SecretsPayload } from "./user-secrets";
import type { RepositoryAudit } from "./inspection.types";
import { PROVIDER_IDS, FALLBACK_PROVIDER_IDS } from "./architect.types";
import type { ArchitectResult } from "./architect.types";

const ArchitectInput = z.object({
  projectId: z.string().min(1),
  audit: z.custom<RepositoryAudit>().optional(),
  request: z.string().min(8),
  primaryProvider: z.enum(PROVIDER_IDS),
  primaryModel: z.string(),
  backupModels: z.array(z.string().min(1)).max(3).default([]),
  fallbackProvider: z.enum(FALLBACK_PROVIDER_IDS),
  fallbackModel: z.string(),
  secrets: SecretsPayload,
});

export const generateArchitecturePlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ArchitectInput.parse(input))
  .handler(async ({ data }): Promise<ArchitectResult> => {
    const { generatePlanReal } = await import("./architect.server");
    const { withSecrets } = await import("./secrets.server");
    return withSecrets(data.secrets, async () => generatePlanReal(data));
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SecretsPayload } from "./user-secrets";
import type { InspectionResult } from "./inspection.types";

const InspectInput = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1),
  secrets: SecretsPayload,
});

export const inspectRepository = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InspectInput.parse(input))
  .handler(async ({ data }): Promise<InspectionResult> => {
    const { inspectRepositoryReal } = await import("./inspection.server");
    const { rememberAudit } = await import("./project-memory.server");
    const { withSecrets } = await import("./secrets.server");
    return withSecrets(data.secrets, async () => {
      const result = await inspectRepositoryReal(data);
      if (result.ok && result.audit) rememberAudit(result.audit);
      return result;
    });
  });

const MemoryInput = z.object({ projectId: z.string().min(1) });

export const getProjectMemory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MemoryInput.parse(input))
  .handler(async ({ data }) => {
    const { recallAudit } = await import("./project-memory.server");
    return { entry: recallAudit(data.projectId) ?? null };
  });

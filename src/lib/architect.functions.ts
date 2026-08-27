import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ArchitectResult } from "./architect.types";

const ArchitectInput = z.object({
  projectId: z.string().min(1),
  request: z.string().min(8),
  primaryProvider: z.enum(["gemini", "openrouter"]),
  primaryModel: z.string(),
  fallbackProvider: z.enum(["gemini", "openrouter", "none"]),
  fallbackModel: z.string(),
});

export const generateArchitecturePlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ArchitectInput.parse(input))
  .handler(async ({ data }): Promise<ArchitectResult> => {
    const { generatePlanReal } = await import("./architect.server");
    return generatePlanReal(data);
  });

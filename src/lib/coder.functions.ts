import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ArchitectPlan } from "./architect.types";
import type { CoderResult } from "./coder.types";

const PlanInput = z.object({
  taskId: z.string(),
  request: z.string(),
  repository: z.string().min(1),
  branch: z.string().min(1),
  commitSha: z.string().min(1),
  summary: z.string().default(""),
  approach: z.string().default(""),
  affectedFiles: z
    .array(
      z.object({
        path: z.string(),
        change: z.string(),
        reason: z.string().default(""),
        existsInRepo: z.boolean().default(false),
      }),
    )
    .default([]),
  steps: z
    .array(
      z.object({
        order: z.number(),
        title: z.string(),
        detail: z.string().default(""),
        agent: z.string().default("UNKNOWN"),
        files: z.array(z.string()).default([]),
        risk: z.string().default("UNKNOWN"),
      }),
    )
    .default([]),
});

const CoderInput = z.object({
  plan: PlanInput,
  stepOrders: z.array(z.number()).default([]),
  primaryProvider: z.enum(["gemini", "openrouter"]),
  primaryModel: z.string(),
  fallbackProvider: z.enum(["gemini", "openrouter", "none"]),
  fallbackModel: z.string(),
});

export const implementPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CoderInput.parse(input))
  .handler(async ({ data }): Promise<CoderResult> => {
    const { implementPlanReal } = await import("./coder.server");
    return implementPlanReal({
      ...data,
      plan: data.plan as unknown as ArchitectPlan,
    });
  });

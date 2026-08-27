import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ReviewBoardResult } from "./review.types";

const Input = z.object({
  changeSetId: z.string().min(1),
  taskId: z.string().default(""),
  request: z.string().default(""),
  repository: z.string().min(1),
  branch: z.string().min(1),
  baseCommitSha: z.string().min(1),
  summary: z.string().default(""),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        action: z.enum(["CREATE", "MODIFY", "DELETE"]),
        reason: z.string().default(""),
        additions: z.number().default(0),
        deletions: z.number().default(0),
        diffText: z.string().default(""),
      }),
    )
    .min(1),
  reviewers: z.array(z.enum(["code", "security", "qa"])).default([]),
  primaryProvider: z.enum(["gemini", "openrouter"]),
  primaryModel: z.string().min(1),
  fallbackProvider: z.enum(["gemini", "openrouter", "none"]).default("none"),
  fallbackModel: z.string().default(""),
});

export const reviewChangeSet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ReviewBoardResult> => {
    const { runReviewBoard } = await import("./review.server");
    return runReviewBoard(data);
  });

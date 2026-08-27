import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChatResult } from "./chat.types";

const Input = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  language: z.enum(["ar", "en"]).default("ar"),
  context: z.object({
    repository: z.string().default(""),
    branch: z.string().default(""),
    commitSha: z.string().default(""),
    stack: z.array(z.string()).default([]),
    entryPoints: z.array(z.string()).default([]),
    apiRoutes: z.number().default(0),
    fileCount: z.number().default(0),
    planSummary: z.string().default(""),
    changeSetSummary: z.string().default(""),
    reviewGate: z.string().default(""),
  }),
  primaryProvider: z.enum(["gemini", "openrouter"]),
  primaryModel: z.string().default(""),
  fallbackProvider: z.enum(["gemini", "openrouter", "none"]).default("none"),
  fallbackModel: z.string().default(""),
});

export const teamLeadChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ChatResult> => {
    const { runTeamLeadTurn } = await import("./chat.server");
    return runTeamLeadTurn(data);
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChangeSet } from "./coder.types";
import type { GitResult } from "./git.types";

const ChangeSetInput = z.object({
  changeSetId: z.string(),
  taskId: z.string(),
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
        after: z.string().nullable().default(null),
      }),
    )
    .min(1),
});

const GitInput = z.object({
  changeSet: ChangeSetInput,
  branchName: z.string().min(1),
  commitMessage: z.string().default(""),
  openPullRequest: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export const commitStagedChanges = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GitInput.parse(input))
  .handler(async ({ data }): Promise<GitResult> => {
    const { commitChangeSet } = await import("./git.server");
    return commitChangeSet({
      ...data,
      changeSet: data.changeSet as unknown as ChangeSet,
    });
  });

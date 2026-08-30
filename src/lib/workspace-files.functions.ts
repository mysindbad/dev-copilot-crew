import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SecretsPayload } from "./user-secrets";
import { getRepoTree, getFileContent } from "./workspace-files.server";

const TreeInput = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1),
  secrets: SecretsPayload,
});

export const fetchRepoTree = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TreeInput.parse(input))
  .handler(async ({ data }) => {
    const { withSecrets } = await import("./secrets.server");
    return withSecrets(data.secrets, async () =>
      getRepoTree({ repoUrl: data.repoUrl, branch: data.branch }),
    );
  });

const FileInput = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1),
  path: z.string().min(1),
  secrets: SecretsPayload,
});

export const fetchFileContent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FileInput.parse(input))
  .handler(async ({ data }) => {
    const { withSecrets } = await import("./secrets.server");
    return withSecrets(data.secrets, async () =>
      getFileContent({ repoUrl: data.repoUrl, branch: data.branch, path: data.path }),
    );
  });

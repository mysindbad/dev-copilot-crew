import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SecretsPayload } from "./user-secrets";

const BaseInput = z.object({
  repoUrl: z.string().min(1).max(500),
  branch: z.string().min(1).max(250),
  secrets: SecretsPayload,
});

const ReadInput = BaseInput.extend({
  path: z.string().min(1).max(500),
});

const SaveInput = ReadInput.extend({
  content: z.string().max(1_000_000),
  sha: z.string().min(1).max(100),
  message: z.string().min(1).max(200),
});

export const listWorkspaceFiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BaseInput.parse(input))
  .handler(async ({ data }) => {
    const { withSecrets } = await import("./secrets.server");
    const { listWorkspaceFiles: list } = await import("./workspace-files.server");
    return withSecrets(data.secrets, () => list(data));
  });

export const readWorkspaceFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReadInput.parse(input))
  .handler(async ({ data }) => {
    const { withSecrets } = await import("./secrets.server");
    const { readWorkspaceFile: read } = await import("./workspace-files.server");
    return withSecrets(data.secrets, () => read(data));
  });

export const saveWorkspaceFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data }) => {
    const { withSecrets } = await import("./secrets.server");
    const { saveWorkspaceFile: save } = await import("./workspace-files.server");
    return withSecrets(data.secrets, () => save(data));
  });

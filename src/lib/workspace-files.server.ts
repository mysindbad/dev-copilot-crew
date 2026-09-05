import { getSecret } from "./secrets.server";

export type WorkspaceFile = {
  path: string;
  sha: string;
  size: number;
  language: string | null;
};

export type WorkspaceFileContent = WorkspaceFile & {
  content: string;
  encoding: "utf-8";
};

export type WorkspaceFileResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const patterns = [
    /^https?:\\/\\/(?:www\\.)?github\\.com\\/([^/\\s]+)\\/([^/\\s]+)$/i,
    /^git@github\\.com:([^/\\s]+)\\/([^/\\s]+)$/i,
    /^([A-Za-z0-9-_.]+)\\/([A-Za-z0-9-_.]+)$/,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1] && match[2]) return { owner: match[1], repo: match[2] };
  }
  return null;
}

function safeError(message: string, status: number): string {
  if (status === 401 || status === 403) return "GitHub rejected the request. Check repository permissions.";
  if (status === 404) return "Repository or file was not found for this branch.";
  if (status === 409) return "The repository changed while you were editing. Refresh the file before saving.";
  return message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}

function encodeFilePath(path: string) {
  return path.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/");
}

function languageForPath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React",
    css: "CSS", html: "HTML", json: "JSON", md: "Markdown", py: "Python", go: "Go",
    rs: "Rust", java: "Java", yml: "YAML", yaml: "YAML", sql: "SQL",
  };
  return extension ? languages[extension] ?? null : null;
}

async function githubRequest(path: string, init: RequestInit = {}) {
  const token = getSecret("GITHUB_TOKEN");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "ai-dev-hub");
  if (token) headers.set("Authorization", "Bearer " + token);
  return fetch("https://api.github.com" + path, { ...init, headers });
}

async function githubWrite(path: string, body: unknown) {
  const token = getSecret("GITHUB_TOKEN");
  if (!token) return null;
  return fetch("https://api.github.com" + path, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-dev-hub",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
  });
}

export async function listWorkspaceFiles(input: { repoUrl: string; branch: string }): Promise<WorkspaceFileResult<WorkspaceFile[]>> {
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return { ok: false, error: "Invalid GitHub repository URL." };
  const path = "/repos/" + parsed.owner + "/" + parsed.repo + "/git/trees/" + encodeURIComponent(input.branch) + "?recursive=1";
  const response = await githubRequest(path);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: safeError(body?.message ?? "Unable to read repository files.", response.status) };
  }
  const body = (await response.json()) as { tree?: Array<{ path: string; type: string; sha: string; size?: number }> };
  const files = (body.tree ?? []).filter((entry) => entry.type === "blob").slice(0, 3000).map((entry) => ({
    path: entry.path, sha: entry.sha, size: entry.size ?? 0, language: languageForPath(entry.path),
  }));
  return { ok: true, data: files };
}

export async function readWorkspaceFile(input: { repoUrl: string; branch: string; path: string }): Promise<WorkspaceFileResult<WorkspaceFileContent>> {
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return { ok: false, error: "Invalid GitHub repository URL." };
  if (!input.path.trim() || input.path.includes("..")) return { ok: false, error: "Invalid file path." };
  const path = "/repos/" + parsed.owner + "/" + parsed.repo + "/contents/" + encodeFilePath(input.path) + "?ref=" + encodeURIComponent(input.branch);
  const response = await githubRequest(path);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: safeError(body?.message ?? "Unable to read file.", response.status) };
  }
  const body = (await response.json()) as { path: string; sha: string; size: number; encoding?: string; content?: string };
  if (!body.content || body.encoding !== "base64") return { ok: false, error: "This file is too large or is not a text file." };
  return { ok: true, data: {
    path: body.path, sha: body.sha, size: body.size, language: languageForPath(body.path),
    content: Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf8"), encoding: "utf-8",
  } };
}

export async function saveWorkspaceFile(input: { repoUrl: string; branch: string; path: string; content: string; sha: string; message: string }): Promise<WorkspaceFileResult<{ commitSha: string; fileSha: string }>> {
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return { ok: false, error: "Invalid GitHub repository URL." };
  if (!getSecret("GITHUB_TOKEN")) return { ok: false, error: "A GitHub token with write access is required to save files." };
  if (!input.path.trim() || input.path.includes("..")) return { ok: false, error: "Invalid file path." };
  if (input.content.length > 1_000_000) return { ok: false, error: "Files larger than 1 MB cannot be edited in the workspace." };
  if (!input.message.trim()) return { ok: false, error: "A commit message is required." };
  const path = "/repos/" + parsed.owner + "/" + parsed.repo + "/contents/" + encodeFilePath(input.path);
  const response = await githubWrite(path, {
    message: input.message.trim(), content: Buffer.from(input.content, "utf8").toString("base64"), branch: input.branch, sha: input.sha,
  });
  if (!response) return { ok: false, error: "A GitHub token with write access is required to save files." };
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: safeError(body?.message ?? "Unable to save file.", response.status) };
  }
  const body = (await response.json()) as { content?: { sha?: string }; commit?: { sha?: string } };
  if (!body.content?.sha || !body.commit?.sha) return { ok: false, error: "GitHub did not return the saved file commit." };
  return { ok: true, data: { commitSha: body.commit.sha, fileSha: body.content.sha } };
}

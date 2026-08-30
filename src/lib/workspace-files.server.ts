/**
 * GitHub file-tree + content reading for the IDE workspace.
 *
 * Reuses the same GitHub REST API pattern as the inspection layer but returns
 * a lightweight tree the file explorer can render. No secrets ever leave the
 * server — only file paths, types and text contents.
 */
import { getSecret } from "./secrets.server";

const API = "https://api.github.com";

export interface TreeNode {
  path: string;
  name: string;
  type: "blob" | "tree";
  size: number;
}

export interface TreeResult {
  ok: boolean;
  ref: string;
  truncated: boolean;
  nodes: TreeNode[];
  error?: string;
}

export interface FileContentResult {
  ok: boolean;
  path: string;
  content: string;
  binary: boolean;
  size: number;
  error?: string;
}

function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const patterns = [
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)$/i,
    /^git@github\.com:([^/\s]+)\/([^/\s]+)$/i,
    /^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/,
  ];
  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m && m[1] && m[2]) return { owner: m[1], repo: m[2] };
  }
  return null;
}

async function gh(path: string, token: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "my-ai-dev-team",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${API}${path}`, { headers });
}

/** Read the full recursive tree at a ref. */
export async function getRepoTree(input: {
  repoUrl: string;
  branch: string;
}): Promise<TreeResult> {
  const token = getSecret("GITHUB_TOKEN") ?? null;
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return { ok: false, ref: "", truncated: false, nodes: [], error: "Invalid repository URL." };

  // Resolve branch head SHA
  const branchRes = await gh(
    `/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(input.branch)}`,
    token,
  );
  if (!branchRes.ok)
    return { ok: false, ref: "", truncated: false, nodes: [], error: `Branch "${input.branch}" not found.` };
  const branch = (await branchRes.json()) as { commit: { sha: string } };
  const sha = branch.commit.sha;

  const treeRes = await gh(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees/${sha}?recursive=1`,
    token,
  );
  if (!treeRes.ok)
    return { ok: false, ref: sha, truncated: false, nodes: [], error: `Could not read tree (HTTP ${treeRes.status}).` };

  const body = (await treeRes.json()) as {
    tree: { path: string; type: string; size?: number }[];
    truncated: boolean;
  };

  const nodes: TreeNode[] = body.tree
    .filter((t) => t.type === "blob" || t.type === "tree")
    .map((t) => {
      const segs = t.path.split("/");
      return {
        path: t.path,
        name: segs[segs.length - 1] ?? t.path,
        type: (t.type === "tree" ? "tree" : "blob") as "tree" | "blob",
        size: t.size ?? 0,
      };
    })
    // Exclude heavy/generated directories to keep the explorer usable
    .filter((n) => !n.path.startsWith("node_modules/") && !n.path.startsWith(".git/"));

  return { ok: true, ref: sha, truncated: body.truncated, nodes };
}

/** Read a single file's text content at a ref. */
export async function getFileContent(input: {
  repoUrl: string;
  branch: string;
  path: string;
}): Promise<FileContentResult> {
  const token = getSecret("GITHUB_TOKEN") ?? null;
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return { ok: false, path: input.path, content: "", binary: false, size: 0, error: "Invalid repository URL." };

  const encoded = input.path.split("/").map(encodeURIComponent).join("/");
  const res = await gh(
    `/repos/${parsed.owner}/${parsed.repo}/contents/${encoded}?ref=${encodeURIComponent(input.branch)}`,
    token,
  );
  if (!res.ok)
    return { ok: false, path: input.path, content: "", binary: false, size: 0, error: `HTTP ${res.status}` };

  const body = (await res.json()) as {
    content?: string;
    encoding?: string;
    size?: number;
  };

  const size = body.size ?? 0;
  // Reject files that are obviously binary or too large
  if (size > 512_000)
    return { ok: true, path: input.path, content: "[File too large to display]", binary: true, size };

  if (body.encoding === "base64" && body.content) {
    const raw = Buffer.from(body.content, "base64").toString("utf8");
    // Detect binary by checking for null bytes
    const buf = Buffer.from(body.content, "base64");
    if (buf.includes(0))
      return { ok: true, path: input.path, content: "[Binary file]", binary: true, size };
    return { ok: true, path: input.path, content: raw, binary: false, size };
  }

  return { ok: true, path: input.path, content: body.content ?? "", binary: false, size };
}

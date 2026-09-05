import { getSecret } from "./secrets.server";
import type { ChangeSet } from "./coder.types";
import type { GitCheck, GitCommitReport, GitEvent, GitResult } from "./git.types";
import { parseRepoUrl } from "./inspection.server";

/**
 * Phase 5 — Git Manager.
 *
 * Writes a Coder change set to GitHub on a NEW branch only:
 * base branch is never touched, history is never rewritten, and the commit
 * content is byte-for-byte the staged content the human approved.
 */

const API = "https://api.github.com";

function now(): string {
  return new Date().toISOString();
}

function safeMessage(message: string): string {
  return message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 240);
}

export function suggestBranchName(changeSet: ChangeSet): string {
  const slug = (changeSet.request || changeSet.taskId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `ai-dev-team/${slug || "change"}-${changeSet.changeSetId.slice(0, 8)}`;
}

export function sanitizeBranchName(input: string): string | null {
  const name = input.trim().replace(/^refs\/heads\//, "");
  if (!name) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(name)) return null;
  if (name.includes("..") || name.endsWith("/") || name.endsWith(".lock")) return null;
  if (["main", "master", "develop", "production"].includes(name)) return null;
  return name;
}

async function gh(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "my-ai-dev-team",
      // The token stays inside this request; it is never logged or returned.
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text };
}

function ghError(res: { status: number; json: any }): string {
  const msg = typeof res.json?.message === "string" ? res.json.message : `HTTP ${res.status}`;
  return safeMessage(msg);
}

export interface CommitInput {
  changeSet: ChangeSet;
  branchName: string;
  commitMessage: string;
  openPullRequest: boolean;
  dryRun: boolean;
}

export async function commitChangeSet(input: CommitInput): Promise<GitResult> {
  const checks: GitCheck[] = [];
  const events: GitEvent[] = [];
  const push = (label: string, state: GitEvent["state"], detail: string) =>
    events.push({ label, state, detail, at: now() });

  const { changeSet } = input;
  const fail = (
    error: string,
    errorKind: GitResult["errorKind"],
  ): GitResult => ({ ok: false, dryRun: input.dryRun, checks, events, error, errorKind });

  if (!changeSet || changeSet.files.length === 0)
    return fail("No staged change set to commit.", "no_changeset");

  const parsed = parseRepoUrl(changeSet.repository);
  if (!parsed) return fail(`Unrecognised repository: ${changeSet.repository}`, "github_error");
  const { owner, repo } = parsed;

  const token = getSecret("GITHUB_TOKEN") ?? null;
  if (!token) {
    checks.push({
      label: "GitHub token",
      state: "fail",
      detail: "No GITHUB_TOKEN configured — writing requires an authenticated token.",
    });
    return fail("A GitHub token with write access is required to commit.", "no_token");
  }
  checks.push({ label: "GitHub token", state: "pass", detail: "server-side token present" });

  const branch = sanitizeBranchName(input.branchName);
  if (!branch)
    return fail(
      "Invalid branch name. Use letters, numbers, '-', '_', '/' and never a protected branch.",
      "github_error",
    );
  checks.push({ label: "Target branch is new and non-protected", state: "pass", detail: branch });

  try {
    // 1. Repository + write permission.
    const repoRes = await gh(`/repos/${owner}/${repo}`, token);
    if (repoRes.status === 401 || repoRes.status === 403)
      return fail(`GitHub rejected the token: ${ghError(repoRes)}`, "no_write_access");
    if (!repoRes.ok) return fail(`GitHub error: ${ghError(repoRes)}`, "github_error");
    const canPush = Boolean(repoRes.json?.permissions?.push);
    checks.push({
      label: "Write access",
      state: canPush ? "pass" : "fail",
      detail: canPush ? "token can push to this repository" : "token has read-only access",
    });
    if (!canPush)
      return fail("The configured GitHub token cannot push to this repository.", "no_write_access");
    push("Write access verified", "ok", `${owner}/${repo}`);

    // 2. Base branch head vs the commit the diff was computed against.
    const baseRes = await gh(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(changeSet.branch)}`,
      token,
    );
    if (!baseRes.ok) return fail(`Base branch unreadable: ${ghError(baseRes)}`, "github_error");
    const headSha: string = baseRes.json?.commit?.sha ?? "";
    const drifted = headSha !== changeSet.baseCommitSha;
    checks.push({
      label: "Base commit still current",
      state: drifted ? "fail" : "pass",
      detail: drifted
        ? `base branch moved to ${headSha.slice(0, 7)}; the approved diff must be re-audited`
        : `${changeSet.branch}@${headSha.slice(0, 7)}`,
    });
    push(
      "Base branch checked",
      drifted ? "fail" : "ok",
      drifted ? "base moved since the audit — write blocked" : "base unchanged since the audit",
    );
    if (drifted)
      return fail(
        "The base branch changed after review. Re-run inspection and review before writing.",
        "base_moved",
      );

    // 3. Branch must not already exist.
    const refRes = await gh(
      `/repos/${owner}/${repo}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
      token,
    );
    if (refRes.status === 200)
      return fail(`Branch "${branch}" already exists — choose another name.`, "branch_exists");
    checks.push({ label: "Branch availability", state: "pass", detail: `${branch} is free` });

    checks.push({
      label: "Base branch protected",
      state: "pass",
      detail: `nothing is written to ${changeSet.branch}; no force push, no history rewrite`,
    });

    const fileList = changeSet.files.map((f) => ({ path: f.path, action: f.action }));

    if (input.dryRun) {
      push("Dry run complete", "ok", `${fileList.length} file(s) ready to commit`);
      return { ok: true, dryRun: true, checks, events };
    }

    // 4. Blobs for every created/modified file.
    const treeEntries: {
      path: string;
      mode: "100644";
      type: "blob";
      sha?: string | null;
      content?: string;
    }[] = [];
    for (const file of changeSet.files) {
      if (file.action === "DELETE") {
        treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, token, {
        method: "POST",
        body: { content: Buffer.from(file.after ?? "", "utf8").toString("base64"), encoding: "base64" },
      });
      if (!blob.ok) return fail(`Blob upload failed for ${file.path}: ${ghError(blob)}`, "github_error");
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.json.sha });
    }
    push("Content uploaded", "ok", `${treeEntries.length} blob(s)`);

    // 5. Tree on top of the audited commit.
    const tree = await gh(`/repos/${owner}/${repo}/git/trees`, token, {
      method: "POST",
      body: { base_tree: changeSet.baseCommitSha, tree: treeEntries },
    });
    if (!tree.ok) return fail(`Tree creation failed: ${ghError(tree)}`, "github_error");

    // 6. Commit.
    const message =
      input.commitMessage.trim() ||
      `${changeSet.summary || "AI Dev Team change"}\n\nTask: ${changeSet.taskId}`;
    const commit = await gh(`/repos/${owner}/${repo}/git/commits`, token, {
      method: "POST",
      body: { message, tree: tree.json.sha, parents: [changeSet.baseCommitSha] },
    });
    if (!commit.ok) return fail(`Commit creation failed: ${ghError(commit)}`, "github_error");
    push("Commit created", "ok", String(commit.json.sha).slice(0, 7));

    // 7. New branch ref (create only — never an update or a force push).
    const ref = await gh(`/repos/${owner}/${repo}/git/refs`, token, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.json.sha },
    });
    if (!ref.ok) return fail(`Branch creation failed: ${ghError(ref)}`, "github_error");
    push("Branch created", "ok", branch);

    const report: GitCommitReport = {
      repository: `${owner}/${repo}`,
      baseBranch: changeSet.branch,
      baseCommitSha: changeSet.baseCommitSha,
      branch,
      branchUrl: `https://github.com/${owner}/${repo}/tree/${branch}`,
      commitSha: commit.json.sha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.json.sha}`,
      message,
      files: fileList,
      createdAt: now(),
    };

    // 8. Optional pull request for human review.
    if (input.openPullRequest) {
      const pr = await gh(`/repos/${owner}/${repo}/pulls`, token, {
        method: "POST",
        body: {
          title: changeSet.summary?.slice(0, 120) || `AI Dev Team: ${changeSet.taskId}`,
          head: branch,
          base: changeSet.branch,
          body: [
            `**Task:** ${changeSet.request || changeSet.taskId}`,
            "",
            changeSet.summary,
            "",
            `Base commit: \`${changeSet.baseCommitSha}\``,
            `Files: ${fileList.map((f) => `\`${f.path}\` (${f.action})`).join(", ")}`,
            "",
            "_Generated by My AI Dev Team after human approval of the staged diff._",
          ].join("\n"),
        },
      });
      if (pr.ok) {
        report.pullRequest = {
          number: pr.json.number,
          url: pr.json.html_url,
          title: pr.json.title,
          state: pr.json.state,
        };
        push("Pull request opened", "ok", `#${pr.json.number}`);
      } else {
        push("Pull request not opened", "warn", ghError(pr));
      }
    }

    return { ok: true, dryRun: false, report, checks, events };
  } catch (error) {
    push("Network failure", "fail", "GitHub request failed");
    return fail(
      safeMessage(error instanceof Error ? error.message : "network error"),
      "network",
    );
  }
}

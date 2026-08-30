/**
 * GitHub I/O for the persistent project-state layer.
 *
 * Reads `.ai-dev-hub/` from a repository to reconstruct project context
 * (bootstrap), and writes a checkpoint back to the working branch
 * (checkpoint). State files are committed to the configured base branch with
 * a fast-forward update only — never a force push, never a new branch.
 *
 * The server is the authority for version fields and the recorded commit SHA:
 * it fetches the live branch head itself rather than trusting the client, so a
 * stale or wrong client hint can never poison the checkpoint.
 */
import { getSecret } from "./secrets.server";
import { parseRepoUrl } from "./inspection.server";
import {
  STATE_DIR,
  STATE_SCHEMA_VERSION,
  PLATFORM_VERSION,
  ARCHITECTURE_VERSION,
  type ProjectState,
  type CurrentTask,
  type BootstrapResult,
  type RecoveredState,
  type CheckpointRequest,
  type StateCommitResult,
} from "./state.types";
import {
  buildSnapshotFiles,
  seedDecisionsMd,
  appendDecisions,
  checkpointHistoryLine,
} from "./state-files";

const API = "https://api.github.com";

const PATH = {
  state: `${STATE_DIR}/project-state.json`,
  task: `${STATE_DIR}/current-task.json`,
  progress: `${STATE_DIR}/progress.md`,
  architecture: `${STATE_DIR}/architecture.md`,
  decisions: `${STATE_DIR}/decisions.md`,
  history: `${STATE_DIR}/history/checkpoints.jsonl`,
} as const;

const now = () => new Date().toISOString();

function safeMessage(message: string): string {
  return message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}

async function gh(
  path: string,
  token: string | null,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "my-ai-dev-team",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers,
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

/** Read a single text file at a ref. Returns null when the path does not exist. */
async function readFile(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string | null,
): Promise<string | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await gh(
    `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = res.json as { content?: string; encoding?: string } | null;
  if (body?.encoding === "base64" && body.content) {
    return Buffer.from(body.content, "base64").toString("utf8");
  }
  return null;
}

async function getBranchHead(
  owner: string,
  repo: string,
  branch: string,
  token: string | null,
): Promise<{
  found: boolean;
  sha: string | null;
  message: string | null;
  parentSha: string | null;
}> {
  const res = await gh(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    token,
  );
  if (!res.ok) return { found: false, sha: null, message: null, parentSha: null };
  const c = res.json?.commit;
  return {
    found: true,
    sha: (c?.sha as string) ?? null,
    message: (c?.commit?.message as string) ?? null,
    parentSha: (c?.parents?.[0]?.sha as string) ?? null,
  };
}

function tryParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const EMPTY_RECOVERED: RecoveredState = {
  state: null,
  task: null,
  progressMd: null,
  architectureMd: null,
  decisionsMd: null,
};

/* ---------------------------------------------------------- bootstrap */

/**
 * Reconstruct project context from `.ai-dev-hub/` in the repository.
 *
 * Compares the persisted checkpoint against the live branch head: if the repo
 * moved since the checkpoint, the inconsistency is reported (never hidden) so
 * a new agent knows to re-inspect rather than trust stale metadata.
 */
export async function bootstrapStateReal(input: {
  repoUrl: string;
  branch: string;
}): Promise<BootstrapResult> {
  const token = getSecret("GITHUB_TOKEN") ?? null;
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) {
    return {
      ok: false,
      recovered: EMPTY_RECOVERED,
      actualCommitSha: null,
      consistent: false,
      inconsistencies: ["Invalid repository URL."],
      error: "Invalid repository URL.",
    };
  }

  const head = await getBranchHead(parsed.owner, parsed.repo, input.branch, token);
  if (!head.found || !head.sha) {
    return {
      ok: false,
      recovered: EMPTY_RECOVERED,
      actualCommitSha: null,
      consistent: false,
      inconsistencies: [`Branch "${input.branch}" could not be read.`],
      error: `Branch "${input.branch}" not found.`,
    };
  }
  const actualSha = head.sha;

  const [stateRaw, taskRaw, progressRaw, archRaw, decRaw] = await Promise.all([
    readFile(parsed.owner, parsed.repo, PATH.state, actualSha, token),
    readFile(parsed.owner, parsed.repo, PATH.task, actualSha, token),
    readFile(parsed.owner, parsed.repo, PATH.progress, actualSha, token),
    readFile(parsed.owner, parsed.repo, PATH.architecture, actualSha, token),
    readFile(parsed.owner, parsed.repo, PATH.decisions, actualSha, token),
  ]);

  const state = stateRaw ? tryParse<ProjectState>(stateRaw) : null;
  const task = taskRaw ? tryParse<CurrentTask>(taskRaw) : null;

  const inconsistencies: string[] = [];
  if (state) {
    if (state.repository.lastCommitSha) {
      // A file cannot contain the SHA of the commit that contains it, so the
      // checkpoint records the branch head *before* it was created (its
      // parent) as `lastCommitSha`. When the current head is itself a state
      // checkpoint commit, the checkpoint's recorded head is the head's PARENT
      // — compare against that, not the head, or every checkpoint would
      // falsely look "stale". When the head is a non-state commit, the source
      // tree moved after the checkpoint — compare against the head itself.
      const isStateCommit =
        !!head.message && head.message.startsWith("chore(state):");
      const compareTarget = isStateCommit ? head.parentSha : head.sha;
      if (compareTarget && state.repository.lastCommitSha !== compareTarget) {
        inconsistencies.push(
          `Repository moved since the checkpoint: state recorded commit ${state.repository.lastCommitSha.slice(0, 7)} but the actual ${input.branch} head is ${actualSha.slice(0, 7)}. Re-inspect to reconcile.`,
        );
      }
    }
    if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
      inconsistencies.push(
        `State schema version ${state.schemaVersion} differs from the current ${STATE_SCHEMA_VERSION}. The checkpoint may need migration.`,
      );
    }
  }

  return {
    ok: true,
    recovered: {
      state,
      task,
      progressMd: progressRaw,
      architectureMd: archRaw,
      decisionsMd: decRaw,
    },
    actualCommitSha: actualSha,
    consistent: !state ? true : inconsistencies.length === 0,
    inconsistencies,
  };
}

/* -------------------------------------------------------- checkpoint */

/**
 * Persist a checkpoint into the repository.
 *
 * Reads the previous state version + append-only files (decisions, history),
 * builds the full `.ai-dev-hub/` snapshot, and commits it to the configured
 * branch with a fast-forward ref update. Never force-pushes.
 */
export async function checkpointStateReal(
  input: CheckpointRequest,
): Promise<StateCommitResult> {
  const token = getSecret("GITHUB_TOKEN") ?? null;
  const parsed = parseRepoUrl(input.repository);
  if (!parsed) return { ok: false, error: `Invalid repository: ${input.repository}` };
  if (!token)
    return {
      ok: false,
      error: "No GITHUB_TOKEN configured — state cannot be persisted to the repository.",
    };

  const head = await getBranchHead(parsed.owner, parsed.repo, input.branch, token);
  if (!head.found || !head.sha)
    return { ok: false, error: `Branch "${input.branch}" not found.` };
  const baseSha = head.sha;

  // Previous version + append-only files, read at the current head.
  const [prevStateRaw, prevDecisions, prevHistory] = await Promise.all([
    readFile(parsed.owner, parsed.repo, PATH.state, baseSha, token),
    readFile(parsed.owner, parsed.repo, PATH.decisions, baseSha, token),
    readFile(parsed.owner, parsed.repo, PATH.history, baseSha, token),
  ]);
  const prevState = prevStateRaw ? tryParse<ProjectState>(prevStateRaw) : null;
  const stateVersion = (prevState?.stateVersion ?? 0) + 1;

  const activePhase =
    input.phase === "done" || input.phase === "failed" ? null : input.phase;

  const state: ProjectState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    platformVersion: PLATFORM_VERSION,
    architectureVersion: ARCHITECTURE_VERSION,
    stateVersion,
    updatedAt: now(),
    repository: {
      fullName: input.repository,
      branch: input.branch,
      lastCommitSha: baseSha,
    },
    phase: input.phase,
    completedPhases: input.completedPhases,
    activePhase,
    capabilities: input.capabilities,
    enabledIntegrations: input.enabledIntegrations,
    configuredProviders: input.configuredProviders,
    defaultModel: input.defaultModel,
    workspace: input.workspace,
    buildStatus: input.buildStatus,
    testStatus: input.testStatus,
    pendingWork: input.pendingWork,
    knownProblems: input.knownProblems,
    lastSuccessfulOperation: input.lastSuccessfulOperation,
    lastFailedOperation: input.lastFailedOperation,
    recommendedNextAction: input.recommendedNextAction,
  };

  const snapshot = buildSnapshotFiles(state, input.task, input.auditFacts);

  // decisions.md: seed on first run, append any new decisions otherwise.
  let decisionsContent = prevDecisions ?? seedDecisionsMd();
  if (input.newDecisions?.length) {
    decisionsContent = appendDecisions(decisionsContent, input.newDecisions);
  }

  // history/checkpoints.jsonl: append-only log.
  const historyContent = (prevHistory ?? "") + checkpointHistoryLine(state);

  const files: Record<string, string> = {
    ...snapshot,
    [PATH.decisions]: decisionsContent,
    [PATH.history]: historyContent,
  };

  try {
    // 1. Blobs for every state file.
    const treeEntries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    for (const [path, content] of Object.entries(files)) {
      const blob = await gh(`/repos/${parsed.owner}/${parsed.repo}/git/blobs`, token, {
        method: "POST",
        body: { content: Buffer.from(content, "utf8").toString("base64"), encoding: "base64" },
      });
      if (!blob.ok) return { ok: false, error: `Blob upload failed for ${path}: ${safeMessage(blob.json?.message ?? `HTTP ${blob.status}`)}` };
      treeEntries.push({ path, mode: "100644", type: "blob", sha: blob.json.sha });
    }

    // 2. Tree on top of the current head.
    const tree = await gh(`/repos/${parsed.owner}/${parsed.repo}/git/trees`, token, {
      method: "POST",
      body: { base_tree: baseSha, tree: treeEntries },
    });
    if (!tree.ok) return { ok: false, error: `Tree creation failed: ${safeMessage(tree.json?.message ?? `HTTP ${tree.status}`)}` };

    // 3. Commit.
    const commit = await gh(`/repos/${parsed.owner}/${parsed.repo}/git/commits`, token, {
      method: "POST",
      body: {
        message: `chore(state): update AI project checkpoint (v${stateVersion})`,
        tree: tree.json.sha,
        parents: [baseSha],
      },
    });
    if (!commit.ok) return { ok: false, error: `Commit failed: ${safeMessage(commit.json?.message ?? `HTTP ${commit.status}`)}` };
    const commitSha = commit.json.sha as string;

    // 4. Fast-forward the branch ref. force:false rejects non-fast-forward.
    const ref = await gh(
      `/repos/${parsed.owner}/${parsed.repo}/git/refs/heads/${input.branch
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      token,
      { method: "PATCH", body: { sha: commitSha, force: false } },
    );
    if (!ref.ok) {
      // The commit exists but the branch did not move. Report it honestly.
      return {
        ok: false,
        commitSha,
        stateVersion,
        error: `Commit ${commitSha.slice(0, 7)} created but the branch ref could not be updated (${safeMessage(ref.json?.message ?? `HTTP ${ref.status}`)}). The branch may be protected or have moved.`,
      };
    }

    return {
      ok: true,
      commitSha,
      commitUrl: `https://github.com/${parsed.owner}/${parsed.repo}/commit/${commitSha}`,
      stateVersion,
    };
  } catch (error) {
    return {
      ok: false,
      error: safeMessage(error instanceof Error ? error.message : "network error"),
    };
  }
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Phase 1 — secure connection layer.
 *
 * Credentials live ONLY in server-side secrets (process.env), read inside
 * handlers. They are never returned to the browser, never logged, and never
 * sent to a model.
 */

const RepoInput = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1),
});

export type CheckState = "ok" | "fail" | "skip";

export interface Check {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

export interface RepoConnectionResult {
  ok: boolean;
  checks: Check[];
  repository?: {
    fullName: string;
    defaultBranch: string;
    private: boolean;
    language: string | null;
    branch: string;
    writeAccess: boolean;
    lastCommit: {
      sha: string;
      message: string;
      author: string;
      date: string;
    } | null;
  };
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

/** Strip anything that could leak a credential out of a provider message. */
function safeMessage(message: string): string {
  return message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}

async function gh(path: string, token: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "my-ai-dev-team",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`https://api.github.com${path}`, { headers });
}

export const testRepositoryConnection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RepoInput.parse(input))
  .handler(async ({ data }): Promise<RepoConnectionResult> => {
    let token: string | null = process.env["GITHUB_TOKEN"] ?? null;
    const checks: Check[] = [];

    const parsed = parseRepoUrl(data.repoUrl);
    checks.push({
      id: "url",
      label: "Repository URL valid",
      state: parsed ? "ok" : "fail",
      detail: parsed ? `${parsed.owner}/${parsed.repo}` : "Expected github.com/owner/repo",
    });
    if (!parsed) return { ok: false, checks, error: "Invalid repository URL." };

    if (!token) {
      checks.push({
        id: "token",
        label: "GitHub token present",
        state: "skip",
        detail: "No token stored — using unauthenticated public access.",
      });
    } else {
      // 1. Token validity
      const userRes = await gh("/user", token);
      if (!userRes.ok) {
        token = null;
        checks.push({
          id: "token",
          label: "GitHub token valid",
          state: "skip",
          detail: safeMessage(
            `GitHub rejected the stored token (${userRes.status}). Falling back to public access; private repositories need a valid token.`,
          ),
        });
      } else {
        const user = (await userRes.json()) as { login: string };
        checks.push({
          id: "token",
          label: "GitHub token valid",
          state: "ok",
          detail: `Authenticated as ${user.login}`,
        });
      }
    }


    // 2. Repository access
    const repoRes = await gh(`/repos/${parsed.owner}/${parsed.repo}`, token);
    if (!repoRes.ok) {
      checks.push({
        id: "repo",
        label: "Repository access",
        state: "fail",
        detail:
          repoRes.status === 404
            ? "Not found, or the token has no access to it."
            : safeMessage(`GitHub returned ${repoRes.status}`),
      });
      return { ok: false, checks, error: "Could not connect to this repository." };
    }
    const repo = (await repoRes.json()) as {
      full_name: string;
      default_branch: string;
      private: boolean;
      language: string | null;
      permissions?: { push?: boolean; admin?: boolean };
    };
    checks.push({
      id: "repo",
      label: "Repository access",
      state: "ok",
      detail: repo.full_name,
    });

    const writeAccess = Boolean(repo.permissions?.push || repo.permissions?.admin);
    checks.push({
      id: "write",
      label: "Write access",
      state: writeAccess ? "ok" : "fail",
      detail: writeAccess
        ? "Token can push to this repository"
        : "Token is read-only — commits and pushes will be blocked",
    });

    // 3. Branch access + last commit
    const branchRes = await gh(
      `/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(data.branch)}`,
      token,
    );
    if (!branchRes.ok) {
      checks.push({
        id: "branch",
        label: "Branch verified",
        state: "fail",
        detail:
          branchRes.status === 404
            ? `Branch "${data.branch}" does not exist (default is "${repo.default_branch}")`
            : safeMessage(`GitHub returned ${branchRes.status}`),
      });
      return {
        ok: false,
        checks,
        error: "Branch could not be verified.",
      };
    }
    const branch = (await branchRes.json()) as {
      name: string;
      commit: {
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      };
    };
    checks.push({
      id: "branch",
      label: "Branch verified",
      state: "ok",
      detail: branch.name,
    });

    return {
      ok: true,
      checks,
      repository: {
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        private: repo.private,
        language: repo.language,
        branch: branch.name,
        writeAccess,
        lastCommit: {
          sha: branch.commit.sha.slice(0, 7),
          message: branch.commit.commit.message.split("\n")[0] ?? "",
          author: branch.commit.commit.author?.name ?? "unknown",
          date: branch.commit.commit.author?.date ?? "",
        },
      },
    };
  });

export interface ProviderStatus {
  provider: "gemini" | "openrouter";
  configured: boolean;
  ok: boolean;
  detail: string;
  models: string[];
}

const ProviderInput = z.object({
  provider: z.enum(["gemini", "openrouter"]),
});

export const testProvider = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ProviderInput.parse(input))
  .handler(async ({ data }): Promise<ProviderStatus> => {
    if (data.provider === "gemini") {
      const key = process.env["GEMINI_API_KEY"];
      if (!key)
        return {
          provider: "gemini",
          configured: false,
          ok: false,
          detail: "GEMINI_API_KEY secret is not configured.",
          models: [],
        };
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": key },
      });
      if (!res.ok) {
        return {
          provider: "gemini",
          configured: true,
          ok: false,
          detail: safeMessage(`Gemini returned ${res.status}`),
          models: [],
        };
      }
      const body = (await res.json()) as {
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      const models = (body.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((m) => m.startsWith("gemini"))
        .sort();
      return {
        provider: "gemini",
        configured: true,
        ok: true,
        detail: `${models.length} generative models available`,
        models,
      };
    }

    const key = process.env["OPENROUTER_API_KEY"];
    if (!key)
      return {
        provider: "openrouter",
        configured: false,
        ok: false,
        detail: "OPENROUTER_API_KEY secret is not configured.",
        models: [],
      };
    const keyRes = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!keyRes.ok) {
      return {
        provider: "openrouter",
        configured: true,
        ok: false,
        detail: safeMessage(`OpenRouter returned ${keyRes.status}`),
        models: [],
      };
    }
    const modelsRes = await fetch("https://openrouter.ai/api/v1/models");
    let freeModels: string[] = [];
    if (modelsRes.ok) {
      const body = (await modelsRes.json()) as {
        data?: { id: string; pricing?: { prompt?: string; completion?: string } }[];
      };
      freeModels = (body.data ?? [])
        .filter(
          (m) =>
            Number(m.pricing?.prompt ?? "1") === 0 && Number(m.pricing?.completion ?? "1") === 0,
        )
        .map((m) => m.id)
        .sort();
    }
    return {
      provider: "openrouter",
      configured: true,
      ok: true,
      detail: `Key valid — ${freeModels.length} free models available`,
      models: freeModels,
    };
  });

export const getSecretsStatus = createServerFn({ method: "GET" }).handler(async () => ({
  github: Boolean(process.env["GITHUB_TOKEN"]),
  gemini: Boolean(process.env["GEMINI_API_KEY"]),
  openrouter: Boolean(process.env["OPENROUTER_API_KEY"]),
}));

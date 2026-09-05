/**
 * Unit tests for the shared security guardrails in src/lib/safety.ts.
 * Run with: bun test
 *
 * These are the rules that keep credentials out of user-visible text and
 * unsafe paths/branches out of GitHub writes — they must never regress
 * silently, which is why each behaviour is pinned here.
 */
import { describe, expect, test } from "bun:test";
import {
  filePathProblem,
  isProtectedBranch,
  maskSecret,
  parseRepoUrl,
  redactSecrets,
  sanitizeBranchName,
} from "../src/lib/safety";

describe("redactSecrets", () => {
  test("redacts every supported credential shape", () => {
    expect(redactSecrets("مفتاح ghp_Ab12Cd34Ef56 هنا")).toBe("مفتاح [redacted] هنا");
    expect(redactSecrets("github_pat_11AB2_CD3ef4")).toBe("[redacted]");
    expect(redactSecrets("AIzaSyA1234567890xyz")).toBe("[redacted]");
    expect(redactSecrets("sk-or-v1-abcdef123456")).toBe("[redacted]");
    expect(redactSecrets("gsk_abc123XYZ")).toBe("[redacted]");
    expect(redactSecrets("hf_abc123XYZ")).toBe("[redacted]");
  });

  test("leaves ordinary text untouched", () => {
    const text = "البناء فشل في السطر 12 من server.ts";
    expect(redactSecrets(text)).toBe(text);
  });

  test("caps the output length", () => {
    expect(redactSecrets("x".repeat(600)).length).toBe(400);
    expect(redactSecrets("y".repeat(600), 50).length).toBe(50);
  });
});

describe("maskSecret", () => {
  test("never shows a full value", () => {
    expect(maskSecret("short")).toBe("••••••");
    expect(maskSecret("ghp_Ab12Cd34Ef56")).toBe("ghp_••••••Ef56");
  });
});

describe("branch guardrails", () => {
  test("protected branches are rejected in every common spelling", () => {
    for (const name of ["main", "Master", " production ", "refs/heads/main", "develop"]) {
      expect(isProtectedBranch(name)).toBe(true);
    }
    expect(isProtectedBranch("feature/login")).toBe(false);
  });

  test("sanitizeBranchName accepts clean names and rejects the rest", () => {
    expect(sanitizeBranchName("  feature/login  ")).toBe("feature/login");
    expect(sanitizeBranchName("refs/heads/chore/hardening")).toBe("chore/hardening");
    for (const bad of ["", "   ", "main", "bad name", "a..b", "x/", "ci.lock"]) {
      expect(sanitizeBranchName(bad)).toBeNull();
    }
  });
});

describe("filePathProblem", () => {
  test("accepts normal source paths", () => {
    expect(filePathProblem("src/lib/utils.ts")).toBeNull();
    expect(filePathProblem("components/Button.jsx")).toBeNull();
  });

  test("rejects traversal and absolute paths", () => {
    expect(filePathProblem("a/../b")).toMatch(/unsafe/);
    expect(filePathProblem("a\\b")).toMatch(/unsafe/);
    expect(filePathProblem("/etc/passwd")).toMatch(/absolute/);
    expect(filePathProblem("C:\\Users\\x")).toMatch(/absolute/);
  });

  test("rejects git internals, CI workflows, env files and dependencies", () => {
    expect(filePathProblem(".git/config")).toMatch(/git internals/);
    expect(filePathProblem(".github/workflows/deploy.yml")).toMatch(/CI workflows/);
    expect(filePathProblem(".env")).toMatch(/environment/);
    expect(filePathProblem("config/.env.local")).toMatch(/environment/);
    expect(filePathProblem("node_modules/pkg/index.js")).toMatch(/dependencies/);
  });

  test("rejects credential material, binaries and lock files", () => {
    expect(filePathProblem("server.key")).toMatch(/credential/);
    expect(filePathProblem("cert.pem")).toMatch(/credential/);
    expect(filePathProblem("logo.png")).toMatch(/binary/);
    expect(filePathProblem("yarn.lock")).toMatch(/binary/);
  });

  test("rejects empty and over-long paths", () => {
    expect(filePathProblem("   ")).toMatch(/unsafe/);
    expect(filePathProblem("a".repeat(250))).toMatch(/too long/);
  });
});

describe("parseRepoUrl", () => {
  test("accepts the documented forms", () => {
    expect(parseRepoUrl("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl(" owner/repo ")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("git@github.com:owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });

  test("normalises trailing slashes and .git suffixes in every combination", () => {
    expect(parseRepoUrl("owner/repo/")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("owner/repo.git/")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("https://www.github.com/owner/repo.git/")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("git@github.com:owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
  });

  test("discards query strings and fragments", () => {
    expect(parseRepoUrl("https://github.com/owner/repo?tab=readme")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("https://github.com/owner/repo.git?t=1")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseRepoUrl("https://github.com/owner/repo#readme")).toEqual({ owner: "owner", repo: "repo" });
    // A token inside the query is dropped entirely — never kept anywhere.
    expect(parseRepoUrl("https://github.com/owner/repo?token=ghp_Secret123")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  test("rejects non-GitHub hosts", () => {
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseRepoUrl("https://bitbucket.org/owner/repo")).toBeNull();
    expect(parseRepoUrl("git@gitlab.com:owner/repo.git")).toBeNull();
  });

  test("rejects incomplete inputs", () => {
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl("   ")).toBeNull();
    expect(parseRepoUrl("owner")).toBeNull();
    expect(parseRepoUrl("owner/")).toBeNull();
    expect(parseRepoUrl("https://github.com/owner")).toBeNull();
    expect(parseRepoUrl("https://github.com/")).toBeNull();
  });

  test("rejects subpaths and credential-carrying URLs", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/tree/main")).toBeNull();
    expect(parseRepoUrl("https://github.com/owner/repo/issues/12")).toBeNull();
    expect(parseRepoUrl("https://user:pass@github.com/owner/repo")).toBeNull();
  });
});

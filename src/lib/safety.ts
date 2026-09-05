/**
 * Shared, dependency-free security helpers.
 *
 * One place for the rules that keep credentials out of logs, errors, prompts
 * and commits, and unsafe paths/branches out of GitHub writes. Pure functions
 * only — no platform imports — so they can be unit-tested directly
 * (tests/safety.test.ts) and used from both client and server code.
 */

/** Secret-shaped tokens that must never appear in logs, errors or UI text. */
const SECRET_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]+/g, // GitHub user access tokens (ghp_/gho_/ghu_/ghs_/ghr_)
  /github_pat_[A-Za-z0-9_]+/g, // GitHub fine-grained tokens
  /AIza[0-9A-Za-z\-]{10,}/g, // Google / Gemini keys
  /sk-[A-Za-z0-9\-_]{10,}/g, // OpenAI / OpenRouter (sk-or-...) keys
  /gsk_[A-Za-z0-9]+/g, // Groq keys
  /hf_[A-Za-z0-9]+/g, // Hugging Face keys
];

/** Replace anything secret-shaped and cap the length. */
export function redactSecrets(message: string, maxLength = 400): string {
  let out = message;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out.slice(0, maxLength);
}

/** Masked preview, e.g. "ghp_••••••4f2a". Never shows the full value. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

/** Branch names that must never be a write target. */
const PROTECTED_BRANCHES = [
  "main",
  "master",
  "develop",
  "development",
  "production",
  "release",
  "staging",
];

export function isProtectedBranch(name: string): boolean {
  return PROTECTED_BRANCHES.includes(name.trim().replace(/^refs\/heads\//, "").toLowerCase());
}

/** Validate a candidate branch name; null means unusable. */
export function sanitizeBranchName(input: string): string | null {
  const name = input.trim().replace(/^refs\/heads\//, "");
  if (!name) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(name)) return null;
  if (name.includes("..") || name.endsWith("/") || name.endsWith(".lock")) return null;
  if (isProtectedBranch(name)) return null;
  return name;
}

export const MAX_PATH_LENGTH = 200;

/** Git internals, CI workflows, environment files and dependencies. */
const BLOCKED_GIT_PATH = /(^|\/)\.git(\/|$)/i;
const BLOCKED_WORKFLOW_PATH = /(^|\/)\.github\/workflows\//i;
const BLOCKED_ENV_PATH = /(^|\/)\.env/i;
const BLOCKED_DEPS_PATH = /(^|\/)node_modules(\/|$)/i;
/** Credential material must never be written by an automated change set. */
const SENSITIVE_EXT = /\.(pem|key|p12|pfx|keystore)$/i;
/** Binary and lock files are out of scope for a text-editing agent. */
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|mp4|mp3|woff2?|ttf|eot|jar|so|dll|exe|lock)$/i;

/**
 * Reject unsafe repository paths: traversal, absolute paths (POSIX and
 * Windows), .git internals, CI workflows, .env files, dependencies,
 * credential material, binary/lock files and over-long paths.
 * Returns null when the path is acceptable, otherwise the rejection reason.
 */
export function filePathProblem(path: string): string | null {
  if (typeof path !== "string" || path.trim() === "") return "unsafe path";
  const clean = path.trim();
  if (clean.length > MAX_PATH_LENGTH) return "path too long";
  if (clean.startsWith("/") || /^[A-Za-z]:[\\/]/.test(clean)) return "absolute path";
  if (clean.includes("..") || clean.includes("\\")) return "unsafe path";
  if (BLOCKED_GIT_PATH.test(clean)) return "protected path (git internals)";
  if (BLOCKED_WORKFLOW_PATH.test(clean)) return "protected path (CI workflows)";
  if (BLOCKED_ENV_PATH.test(clean)) return "protected path (environment file)";
  if (BLOCKED_DEPS_PATH.test(clean)) return "protected path (dependencies)";
  if (SENSITIVE_EXT.test(clean)) return "sensitive credential file";
  if (BINARY_EXT.test(clean)) return "binary or lock file";
  return null;
}

/**
 * Accept "https://github.com/owner/repo", "git@github.com:owner/repo" and
 * "owner/repo" (with optional .git suffix / trailing slashes / query strings
 * or fragments, which are discarded and never stored); anything else is
 * rejected — including URLs that carry embedded credentials.
 */
export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  // Query strings and fragments are discarded up-front (never stored), then
  // trailing slashes, then the .git suffix — so "owner/repo.git/?tab=1"
  // parses to { owner: "owner", repo: "repo" }.
  const cleaned = input
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
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

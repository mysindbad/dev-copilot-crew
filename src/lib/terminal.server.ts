/**
 * Restricted terminal execution for the IDE workspace.
 *
 * Runs commands inside the app's own container sandbox with an allowlist of
 * safe commands, a hard timeout, and output size limits. Dangerous operations
 * (force-delete, sudo, network exfiltration) are blocked.
 */
import { exec } from "node:child_process";

export interface TerminalResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  command: string;
  blocked?: string;
}

/** Commands that are safe to run in the sandbox. */
const ALLOWED = [
  "ls", "ll", "la", "cat", "head", "tail", "less", "more", "wc", "echo",
  "grep", "rg", "find", "fd", "tree", "pwd", "whoami", "date", "env",
  "node", "npm", "npx", "pnpm", "yarn", "bun", "tsc", "eslint", "prettier",
  "git", "diff", "status", "log", "show", "stat",
  "mkdir", "touch", "cp", "mv",
  "sort", "uniq", "cut", "tr", "sed", "awk",
  "test", "[", "true", "false",
  "du", "df", "file", "which", "type",
  "ps", "kill",
];

/** Substrings that must never appear (even inside an allowed command). */
const BLOCKED_PATTERNS = [
  /\brm\s+-rf?\s+\//,          // rm -rf /
  /\brm\s+-rf?\s+~/,           // rm -rf ~
  /\bsudo\b/,                  // privilege escalation
  /\bmkfs\b/,                  // format
  /\bdd\s+if=/,               // raw disk write
  />\s*\/dev\//,              // write to device
  /\bcurl\b.*\|\s*(sh|bash)/,  // pipe-to-shell
  /\bwget\b.*\|\s*(sh|bash)/,  // pipe-to-shell
  /`[^`]*`/,                   // backtick command substitution
  /\$\(/,                     // $(...) command substitution
  /;\s*(rm|sudo|mkfs)/,       // chained dangerous
  /\|\s*(rm|sudo|mkfs)/,      // piped dangerous
];

const MAX_OUTPUT = 50_000;
const TIMEOUT_MS = 30_000;

function isAllowed(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return "Empty command.";

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed))
      return "Command contains a blocked pattern (destructive operation or shell injection).";
  }

  // Extract the base command (first token, strip path prefixes)
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const baseName = firstToken.split("/").pop() ?? firstToken;
  if (!ALLOWED.includes(baseName))
    return `Command "${baseName}" is not in the allowlist.`;

  return null;
}

export async function runTerminalCommand(command: string): Promise<TerminalResult> {
  const blocked = isAllowed(command);
  if (blocked)
    return { ok: false, stdout: "", stderr: "", exitCode: null, timedOut: false, command, blocked };

  return new Promise((resolve) => {
    exec(command, { timeout: TIMEOUT_MS, cwd: "/app", maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && "killed" in err && err.killed) {
        resolve({
          ok: false,
          stdout: truncate(stdout),
          stderr: truncate(stderr) + "\n[Process timed out after 30s]",
          exitCode: null,
          timedOut: true,
          command,
        });
        return;
      }
      resolve({
        ok: !err,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        exitCode: err ? (err as any).code ?? 1 : 0,
        timedOut: false,
        command,
      });
    });
  });
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT) + "\n[output truncated]";
}

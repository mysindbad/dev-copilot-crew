import type { DiffLine } from "./coder.types";

/**
 * Minimal, dependency-free unified diff (LCS based) used to show the REAL
 * difference between the file content at the audited commit and the content
 * proposed by the Coder Agent.
 */

const MAX_LINES = 4000;
const CONTEXT = 3;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** Longest common subsequence table walk, capped to keep it cheap. */
function lcsOps(a: string[], b: string[]): { kind: "add" | "del" | "ctx"; text: string }[] {
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    // Too large to diff line-by-line: report a whole-file replacement.
    return [
      ...a.map((text) => ({ kind: "del" as const, text })),
      ...b.map((text) => ({ kind: "add" as const, text })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j]! = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: { kind: "add" | "del" | "ctx"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      ops.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "del", text: a[i++]! });
  while (j < m) ops.push({ kind: "add", text: b[j++]! });
  return ops;
}

export interface DiffResult {
  diff: DiffLine[];
  additions: number;
  deletions: number;
  truncated: boolean;
}

export function unifiedDiff(before: string | null, after: string | null): DiffResult {
  const a = splitLines(before ?? "");
  const b = splitLines(after ?? "");
  const ops = lcsOps(a, b);

  const additions = ops.filter((o) => o.kind === "add").length;
  const deletions = ops.filter((o) => o.kind === "del").length;

  // Keep only changed regions plus limited context.
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, idx) => {
    if (op.kind === "ctx") return;
    for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(ops.length - 1, idx + CONTEXT); k++) {
      keep[k] = true;
    }
  });

  const diff: DiffLine[] = [];
  let inGap = false;
  let oldLine = 0;
  let newLine = 0;
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx]!;
    if (op.kind !== "add") oldLine++;
    if (op.kind !== "del") newLine++;
    if (!keep[idx]) {
      inGap = true;
      continue;
    }
    if (inGap) {
      diff.push({ kind: "hunk", text: `@@ -${oldLine} +${newLine} @@` });
      inGap = false;
    }
    diff.push({ kind: op.kind, text: op.text });
    if (diff.length >= MAX_LINES) {
      return { diff, additions, deletions, truncated: true };
    }
  }
  return { diff, additions, deletions, truncated: false };
}

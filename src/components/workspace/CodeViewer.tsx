/**
 * Professional code viewer with Prism syntax highlighting, line numbers,
 * and optional diff mode. Read-only by default — the AI agent does the
 * editing; the user inspects and reviews.
 */
import { useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-markdown";
import { cn } from "@/lib/utils";

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  css: "css", json: "json", sh: "bash", bash: "bash",
  py: "python", md: "markdown", html: "markup", yml: "yaml", yaml: "yaml",
};

export function langForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}

export interface DiffLine {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
}

export function CodeViewer({
  code,
  path,
  diff,
  className,
}: {
  code: string;
  path: string;
  diff?: DiffLine[];
  className?: string;
}) {
  const lang = langForPath(path);
  const grammar = Prism.languages[lang] ?? Prism.languages["javascript"];

  const lines = useMemo(() => {
    if (diff) {
      // Diff mode: each line is already classified
      return diff.map((line, i) => ({
        num: i + 1,
        html: escapeHtml(line.text),
        kind: line.kind,
      }));
    }
    // Highlight the whole block, then split by newline
    const highlighted = Prism.highlight(code, grammar!, lang);
    const split = highlighted.split("\n");
    return split.map((html, i) => ({ num: i + 1, html, kind: "ctx" as const }));
  }, [code, diff, grammar, lang]);

  return (
    <div className={cn("h-full overflow-auto bg-[#1e1e2e] font-mono text-[13px] leading-[1.6]", className)}>
      <div className="min-w-full">
        {lines.map((line) => (
          <div
            key={line.num}
            className={cn(
              "flex",
              line.kind === "add" && "bg-green-500/10",
              line.kind === "del" && "bg-red-500/10",
              line.kind === "hunk" && "bg-blue-500/10 text-blue-300",
              line.kind === "ctx" && "",
            )}
          >
            <span className="w-12 shrink-0 select-none border-r border-white/5 px-2 text-right text-white/30">
              {line.num}
            </span>
            <span
              className={cn(
                "whitespace-pre pl-3 pr-4",
                line.kind === "add" && "text-green-300",
                line.kind === "del" && "text-red-300",
                line.kind === "ctx" && "text-[#cdd6f4]",
              )}
              dangerouslySetInnerHTML={{ __html: line.html || " " }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

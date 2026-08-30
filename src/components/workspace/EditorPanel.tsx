/**
 * Code editor panel — tabbed file viewer with syntax highlighting.
 * Files are fetched from the real GitHub repository. Changed files from the
 * agent's change set can be viewed in diff mode. Read-only by default.
 */
import { useState, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace";
import { CodeViewer, type DiffLine } from "./CodeViewer";
import { X, FileCode2, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface OpenFile {
  path: string;
  content: string;
  loading?: boolean;
}

export function EditorPanel({
  openFiles,
  activePath,
  onCloseFile,
  onSearch,
}: {
  openFiles: OpenFile[];
  activePath: string | null;
  onCloseFile: (path: string) => void;
  onSearch: (query: string) => void;
}) {
  const { changeSet } = useWorkspace();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const active = openFiles.find((f) => f.path === activePath);
  const changedFile = changeSet?.files.find((f) => f.path === activePath);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    onSearch(q);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tab bar */}
      <div className="flex h-9 items-center border-b border-border bg-secondary/30">
        <div className="flex flex-1 items-center overflow-x-auto">
          {openFiles.length === 0 ? (
            <span className="px-3 text-xs text-muted-foreground">No file open</span>
          ) : (
            openFiles.map((f) => (
              <div
                key={f.path}
                className={cn(
                  "group flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs",
                  activePath === f.path ? "bg-background text-foreground" : "text-muted-foreground hover:bg-secondary/50",
                )}
              >
                <FileCode2 className="size-3.5 shrink-0 text-blue-400" />
                <span className="max-w-[140px] truncate">{f.path.split("/").pop()}</span>
                {changeSet?.files.some((cf) => cf.path === f.path) && (
                  <span className="size-1.5 rounded-full bg-amber-500" title="Modified by agent" />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onCloseFile(f.path); }}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setShowSearch((s) => !s)}
          title="Search in file"
        >
          <Search className="size-3.5" />
        </Button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Find in file..."
            className="h-7 text-xs"
            autoFocus
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileCode2 className="size-10 opacity-30" />
            <p className="text-sm">Open a file from the explorer to view its content.</p>
          </div>
        ) : active.loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Loading {active.path}...
          </div>
        ) : changedFile ? (
          // Diff mode for files modified by the agent
          <CodeViewer
            code={active.content}
            path={active.path}
            diff={changedFile.diff.map((l) => ({ kind: l.kind as "add" | "del" | "ctx" | "hunk", text: l.text }))}
          />
        ) : (
          <CodeViewer code={active.content} path={active.path} />
        )}
      </div>

      {/* Status bar */}
      {active && (
        <div className="flex items-center gap-3 border-t border-border px-3 py-1 text-[11px] text-muted-foreground">
          <span className="font-mono truncate">{active.path}</span>
          <span className="ml-auto">{active.content.split("\n").length} lines</span>
          {changedFile && <span className="text-amber-500">Modified by agent</span>}
        </div>
      )}
    </div>
  );
}

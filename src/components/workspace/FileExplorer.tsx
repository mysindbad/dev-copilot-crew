/**
 * File explorer backed by the real GitHub repository tree.
 *
 * Fetches the recursive tree via the server function, builds a collapsible
 * directory structure, supports filename search, and highlights files
 * modified by the current agent change set.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchRepoTree,
  fetchFileContent,
} from "@/lib/workspace-files.functions";
import { useWorkspace } from "@/lib/workspace";
import type { TreeNode } from "@/lib/workspace-files.server";
import {
  ChevronRight,
  ChevronDown,
  File as FileIcon,
  Folder,
  FolderOpen,
  Search,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getUserSecrets } from "@/lib/user-secrets";

interface TreeBranch {
  name: string;
  path: string;
  type: "tree" | "blob";
  size: number;
  children?: TreeBranch[];
}

function buildTree(nodes: TreeNode[]): TreeBranch[] {
  const root: TreeBranch = { name: "", path: "", type: "tree", size: 0, children: [] };
  for (const node of nodes) {
    const segs = node.path.split("/");
    let current = root;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i] ?? "";
      const isLast = i === segs.length - 1;
      const path = segs.slice(0, i + 1).join("/");
      let child = current.children!.find((c) => c.name === seg);
      if (!child) {
        const newChild: TreeBranch = {
          name: seg,
          path,
          type: isLast ? node.type : "tree",
          size: isLast ? node.size : 0,
          ...(node.type === "tree" || !isLast ? { children: [] } : {}),
        };
        current.children!.push(newChild);
        child = newChild;
      }
      if (!isLast) current = child;
    }
  }
  // Sort: directories first, then files, alphabetically
  const sortBranch = (branch: TreeBranch) => {
    if (!branch.children) return;
    branch.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    branch.children.forEach(sortBranch);
  };
  sortBranch(root);
  return root.children!;
}

const FILE_ICON_COLOR: Record<string, string> = {
  ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400",
  jsx: "text-yellow-400", css: "text-pink-400", json: "text-amber-400",
  md: "text-slate-400", html: "text-orange-400",
};

function fileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICON_COLOR[ext] ?? "text-slate-400";
}

export function FileExplorer({
  onOpenFile,
  activePath,
}: {
  onOpenFile: (path: string, content: string) => void;
  activePath: string | null;
}) {
  const { repoConfig, changeSet } = useWorkspace();
  const treeFn = useServerFn(fetchRepoTree);
  const fileFn = useServerFn(fetchFileContent);

  const [tree, setTree] = useState<TreeBranch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "src/lib", "src/components"]));
  const [search, setSearch] = useState("");
  const [ref, setRef] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const modifiedPaths = useMemo(() => {
    if (!changeSet) return new Set<string>();
    return new Set(changeSet.files.map((f) => f.path));
  }, [changeSet]);

  const loadTree = useCallback(async () => {
    if (!repoConfig.repoUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await treeFn({
        data: { ...repoConfig, secrets: getUserSecrets() },
      });
      if (res.ok) {
        setTree(buildTree(res.nodes));
        setRef(res.ref.slice(0, 7));
      } else {
        setError(res.error ?? "Failed to load tree");
      }
    } catch {
      setError("Network error loading tree");
    } finally {
      setLoading(false);
    }
  }, [repoConfig, treeFn]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const openFile = useCallback(
    async (path: string) => {
      setOpening(path);
      try {
        const res = await fileFn({
          data: { ...repoConfig, path, secrets: getUserSecrets() },
        });
        if (res.ok) onOpenFile(path, res.content);
      } catch {
        /* ignore */
      } finally {
        setOpening(null);
      }
    },
    [fileFn, repoConfig, onOpenFile],
  );

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filteredTree = useMemo(() => {
    if (!search.trim() || !tree) return tree;
    const q = search.toLowerCase();
    const filterBranches = (branches: TreeBranch[]): TreeBranch[] => {
      const result: TreeBranch[] = [];
      for (const b of branches) {
        if (b.type === "blob") {
          if (b.path.toLowerCase().includes(q)) result.push(b);
        } else if (b.children) {
          const filtered = filterBranches(b.children);
          if (filtered.length > 0 || b.name.toLowerCase().includes(q)) {
            result.push({ ...b, children: filtered });
          }
        }
      }
      return result;
    };
    return filterBranches(tree);
  }, [tree, search]);

  const renderBranch = (branch: TreeBranch, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(branch.path);
    const isActive = activePath === branch.path;
    const isModified = modifiedPaths.has(branch.path);

    if (branch.type === "blob") {
      return (
        <button
          key={branch.path}
          onClick={() => openFile(branch.path)}
          className={cn(
            "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[13px] transition-colors hover:bg-white/5",
            isActive && "bg-primary/15 text-primary",
          )}
          style={{ paddingLeft: depth * 14 + 8 }}
        >
          <FileIcon className={cn("size-3.5 shrink-0", fileColor(branch.name))} />
          <span className={cn("truncate", isModified && "text-amber-400 font-medium")}>
            {branch.name}
          </span>
          {isModified && <span className="ml-auto text-[10px] text-amber-400">M</span>}
          {opening === branch.path && <Loader2 className="ml-auto size-3 animate-spin" />}
        </button>
      );
    }

    return (
      <div key={branch.path}>
        <button
          onClick={() => toggle(branch.path)}
          className="flex w-full items-center gap-1 py-1 pr-2 text-left text-[13px] transition-colors hover:bg-white/5"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-blue-400" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-blue-400" />
          )}
          <span className="truncate">{branch.name}</span>
        </button>
        {isExpanded && branch.children?.map((c) => renderBranch(c, depth + 1))}
      </div>
    );
  };

  if (!repoConfig.repoUrl.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm text-muted-foreground">No repository connected.</p>
        <p className="text-xs text-muted-foreground/70">Open Settings to connect a GitHub repo.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={loadTree} title="Refresh">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
        <span className="font-mono">{ref || "..."}</span>
        {tree && <span className="ml-auto">{tree.length} items</span>}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading && !tree ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading tree...
          </div>
        ) : error ? (
          <div className="p-3 text-sm text-destructive">{error}</div>
        ) : filteredTree ? (
          filteredTree.map((b) => renderBranch(b, 0))
        ) : null}
      </div>
    </div>
  );
}



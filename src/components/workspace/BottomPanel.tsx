/**
 * Bottom panel — tabbed area with Terminal, Agent Activity, and Git Changes.
 * The terminal runs real commands in the sandbox via a restricted allowlist.
 * Git Changes shows the real agent change set with diffs.
 */
import { useState, useRef, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { execTerminalCommand } from "@/lib/terminal.functions";
import { useWorkspace } from "@/lib/workspace";
import { useActivity } from "@/lib/activity";
import { arabize } from "@/lib/ar";
import { CodeViewer, type DiffLine } from "./CodeViewer";
import {
  Terminal as TerminalIcon,
  Activity,
  GitCompare,
  Loader2,
  Play,
  Trash2,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tab = "terminal" | "activity" | "changes";

interface TerminalLine {
  type: "input" | "stdout" | "stderr" | "error" | "system";
  text: string;
}

export function BottomPanel() {
  const [tab, setTab] = useState<Tab>("terminal");
  const { changeSet } = useWorkspace();
  const { entries } = useActivity();
  const changeCount = changeSet?.files.length ?? 0;

  return (
    <div className="flex h-full flex-col bg-[#1a1b26]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-2 pt-1.5">
        <TabButton active={tab === "terminal"} onClick={() => setTab("terminal")} icon={TerminalIcon} label="Terminal" />
        <TabButton
          active={tab === "activity"}
          onClick={() => setTab("activity")}
          icon={Activity}
          label="Agent Activity"
          badge={entries.filter((e) => e.state === "running").length || undefined}
        />
        <TabButton
          active={tab === "changes"}
          onClick={() => setTab("changes")}
          icon={GitCompare}
          label="Git Changes"
          badge={changeCount || undefined}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "terminal" && <TerminalView />}
        {tab === "activity" && <ActivityView />}
        {tab === "changes" && <ChangesView />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof TerminalIcon;
  label: string;
  badge?: number | undefined;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-[#1a1b26] text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {badge !== undefined && (
        <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 text-[10px] text-primary">{badge}</span>
      )}
    </button>
  );
}

function TerminalView() {
  const execFn = useServerFn(execTerminalCommand);
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "system", text: "Sandbox terminal — restricted command allowlist active. Type a command and press Enter." },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setInput("");
    setLines((prev) => [...prev, { type: "input", text: cmd }]);
    setRunning(true);
    try {
      const res = await execFn({ data: { command: cmd } });
      if (res.blocked) {
        setLines((prev) => [...prev, { type: "error", text: `Blocked: ${res.blocked}` }]);
      } else {
        if (res.stdout) setLines((prev) => [...prev, { type: "stdout", text: res.stdout }]);
        if (res.stderr) setLines((prev) => [...prev, { type: "stderr", text: res.stderr }]);
        if (res.timedOut) setLines((prev) => [...prev, { type: "error", text: "Process timed out." }]);
        if (!res.stdout && !res.stderr && !res.timedOut)
          setLines((prev) => [...prev, { type: "stdout", text: `[exit ${res.exitCode}]` }]);
      }
    } catch {
      setLines((prev) => [...prev, { type: "error", text: "Network error executing command." }]);
    } finally {
      setRunning(false);
    }
  }, [input, running, execFn]);

  const clear = () => setLines([]);

  const lineColor: Record<TerminalLine["type"], string> = {
    input: "text-blue-400",
    stdout: "text-slate-300",
    stderr: "text-yellow-400",
    error: "text-red-400",
    system: "text-slate-500",
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={cn("whitespace-pre-wrap", lineColor[line.type])}>
            {line.type === "input" && <span className="text-green-400">$ </span>}
            {line.text}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-white/5 px-3 py-2">
        <span className="font-mono text-[12px] text-green-400">$</span>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), run())}
          placeholder="Enter a command..."
          disabled={running}
          className="h-7 border-none bg-transparent font-mono text-[12px] text-slate-200 focus-visible:ring-0"
        />
        {running ? (
          <Loader2 className="size-4 animate-spin text-amber-400" />
        ) : (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={run} disabled={!input.trim()}>
            <Play className="size-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={clear} title="Clear">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ActivityView() {
  const { entries } = useActivity();
  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No agent activity yet. Submit a request to see real operations.
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto px-3 py-2">
      {entries.map((e) => (
        <div key={e.id} className="flex items-start gap-2 py-1 text-xs">
          {e.state === "running" ? (
            <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-amber-500" />
          ) : e.state === "done" ? (
            <span className="mt-0.5 size-3.5 shrink-0 text-green-500">✓</span>
          ) : (
            <span className="mt-0.5 size-3.5 shrink-0 text-red-500">✗</span>
          )}
          <div className="flex-1">
            <span className="font-medium text-foreground">{e.agent}</span>{" "}
            <span className="text-muted-foreground">{arabize(e.action)}</span>
            {e.detail && <span className="text-muted-foreground/70"> — {arabize(e.detail)}</span>}
            {e.model && <span className="ml-2 font-mono text-[10px] text-muted-foreground/50">{e.model}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangesView() {
  const { changeSet } = useWorkspace();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (!changeSet || changeSet.files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No changes yet. The agent's file modifications will appear here.
      </div>
    );
  }

  const selected = changeSet.files.find((f) => f.path === selectedFile) ?? changeSet.files[0];
  const diffLines: DiffLine[] = selected
    ? selected.diff.map((l) => ({ kind: l.kind as "add" | "del" | "ctx" | "hunk", text: l.text }))
    : [];

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="w-56 shrink-0 overflow-y-auto border-r border-white/5">
        <div className="px-3 py-1.5 text-[10px] font-medium uppercase text-muted-foreground/60">
          {changeSet.files.length} files · +{changeSet.totals.additions} / -{changeSet.totals.deletions}
        </div>
        {changeSet.files.map((f) => (
          <button
            key={f.path}
            onClick={() => setSelectedFile(f.path)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5",
              selected?.path === f.path && "bg-white/10",
            )}
          >
            <span className={cn(
              "size-1.5 rounded-full",
              f.action === "CREATE" ? "bg-green-500" : f.action === "DELETE" ? "bg-red-500" : "bg-amber-500",
            )} />
            <span className="truncate font-mono">{f.path}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              +{f.additions}/-{f.deletions}
            </span>
          </button>
        ))}
      </div>
      {/* Diff viewer */}
      <div className="flex-1 overflow-hidden">
        {selected && <CodeViewer code="" path={selected.path} diff={diffLines} />}
      </div>
    </div>
  );
}

/**
 * Recovery banner — shows a summary of the recovered project state when the
 * workspace is reopened, based on the real `.ai-dev-hub` bootstrap result.
 */
import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { CheckCircle2, AlertTriangle, X, Clock, GitCommit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RecoveryBanner() {
  const { recoveredState, pipeline } = useWorkspace();
  const [dismissed, setDismissed] = useState(false);

  if (!recoveredState?.ok || dismissed) return null;
  const state = recoveredState.recovered.state;
  if (!state) return null;

  const inconsistent = !recoveredState.consistent;
  const updated = new Date(state.updatedAt);
  const ago = relativeTime(updated);

  if (inconsistent) {
    return (
      <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
        <div className="flex-1 text-sm">
          <span className="font-medium text-amber-600">Project state mismatch detected</span>
          <span className="ml-2 text-muted-foreground">
            The repository changed after the last checkpoint.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
        >
          Review Differences
        </Button>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/5 px-4 py-2.5">
      <CheckCircle2 className="size-4 shrink-0 text-primary" />
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 text-sm">
        <span className="font-medium text-primary">Project recovered</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="text-xs">Phase:</span> <span className="font-medium">{state.phase}</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3" /> {ago}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <GitCommit className="size-3" /> {state.repository.lastCommitSha.slice(0, 7)}
        </span>
        {state.buildStatus !== "unknown" && (
          <span className={cn("font-medium", state.buildStatus === "passing" ? "text-green-500" : "text-red-500")}>
            Build: {state.buildStatus}
          </span>
        )}
        {state.pendingWork.length > 0 && (
          <span className="text-muted-foreground">Pending: {state.pendingWork[0]}</span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={pipeline.running}
      >
        Continue Task
      </Button>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

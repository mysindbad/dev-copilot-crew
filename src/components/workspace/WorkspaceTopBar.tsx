/**
 * Professional workspace top bar — shows real project, repository, branch,
 * commit, build status, provider, model, and agent state. Every value comes
 * from the live workspace context, never fabricated.
 */
import { useWorkspace } from "@/lib/workspace";
import {
  GitBranch,
  GitCommitHorizontal,
  Circle,
  Bot,
  Settings,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProviderModelControl } from "./ProviderModelControl";
import { CredentialsPopover } from "./CredentialsPopover";

type PhaseTone = "ok" | "warn" | "idle" | "fail";
interface PhaseMeta {
  label: string;
  tone: PhaseTone;
  spinning: boolean;
}
const PHASE_META: Record<string, PhaseMeta> = {
  idle: { label: "Ready", tone: "idle", spinning: false },
  inspect: { label: "Inspecting", tone: "warn", spinning: true },
  plan: { label: "Thinking", tone: "warn", spinning: true },
  code: { label: "Editing", tone: "warn", spinning: true },
  review: { label: "Reviewing", tone: "warn", spinning: true },
  git: { label: "Running command", tone: "warn", spinning: true },
  done: { label: "Completed", tone: "ok", spinning: false },
  failed: { label: "Failed", tone: "fail", spinning: false },
};

export function WorkspaceTopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { repoConfig, repoResult, audit, providerConfig, pipeline, recoveredState } = useWorkspace();
  const repo = repoResult?.ok ? repoResult.repository : undefined;
  const phase = pipeline.running ? pipeline.phase : "idle";
  const meta: PhaseMeta = PHASE_META[phase] ?? PHASE_META["idle"] ?? { label: "Ready", tone: "idle", spinning: false };

  const buildStatus = recoveredState?.recovered.state?.buildStatus;
  const projectState = recoveredState?.recovered.state;

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-background px-3">
      {/* Back + project name */}
      <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
      </Link>
      <div className="flex items-center gap-1.5">
        <Bot className="size-4 text-primary" />
        <span className="text-sm font-semibold">
          {repo?.fullName ?? "No repository"}
        </span>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Branch */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <GitBranch className="size-3.5" />
        <span className="font-mono">{repoConfig.branch}</span>
      </div>

      {/* Commit */}
      {repo?.lastCommit && (
        <>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitCommitHorizontal className="size-3.5" />
            <span className="font-mono">{repo.lastCommit.sha}</span>
          </div>
        </>
      )}

      {/* Build status */}
      {buildStatus && buildStatus !== "unknown" && (
        <>
          <div className="h-5 w-px bg-border" />
          <div className={cn("flex items-center gap-1 text-xs", buildStatus === "passing" ? "text-green-500" : "text-red-500")}>
            {buildStatus === "passing" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            <span>Build {buildStatus}</span>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="ml-auto flex items-center gap-2">
        {/* Provider + model selector */}
        <ProviderModelControl />

        <div className="h-5 w-px bg-border" />

        {/* Credentials */}
        <CredentialsPopover />

        <div className="h-5 w-px bg-border" />

        {/* Agent state */}
        <div className="flex items-center gap-1.5">
          {meta.spinning ? (
            <Loader2 className={cn("size-3.5 animate-spin", meta.tone === "fail" ? "text-red-500" : meta.tone === "ok" ? "text-green-500" : "text-amber-500")} />
          ) : meta.tone === "ok" ? (
            <CheckCircle2 className="size-3.5 text-green-500" />
          ) : meta.tone === "fail" ? (
            <XCircle className="size-3.5 text-red-500" />
          ) : (
            <Circle className="size-3 fill-muted-foreground text-muted-foreground" />
          )}
          <span className={cn(
            "text-xs font-medium",
            meta.tone === "ok" && "text-green-500",
            meta.tone === "fail" && "text-red-500",
            meta.tone === "warn" && "text-amber-500",
            meta.tone === "idle" && "text-muted-foreground",
          )}>
            {meta.label}
          </span>
        </div>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onOpenSettings}>
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  );
}

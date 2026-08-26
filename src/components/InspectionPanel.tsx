import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Radar, TriangleAlert, X } from "lucide-react";
import { inspectRepository } from "@/lib/inspection.functions";
import type { InspectionResult, RepositoryAudit } from "@/lib/inspection.types";
import { StatusPill } from "./StatusPill";

export type InspectionPhase =
  | "idle"
  | "connecting"
  | "fetching"
  | "completed"
  | "failed";

const PHASE_LABEL: Record<InspectionPhase, string> = {
  idle: "not inspected",
  connecting: "connecting",
  fetching: "inspecting repository",
  completed: "completed",
  failed: "failed",
};

export function InspectionPanel({
  repoUrl,
  branch,
  connected,
  audit,
  onAudit,
}: {
  repoUrl: string;
  branch: string;
  connected: boolean;
  audit: RepositoryAudit | null;
  onAudit: (a: RepositoryAudit | null) => void;
}) {
  const run = useServerFn(inspectRepository);
  const [phase, setPhase] = useState<InspectionPhase>(audit ? "completed" : "idle");
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  async function inspect() {
    setPhase("connecting");
    setFatal(null);
    setResult(null);
    onAudit(null);
    try {
      setPhase("fetching");
      const res = await run({ data: { repoUrl, branch } });
      setResult(res);
      if (res.ok && res.audit) {
        onAudit(res.audit);
        setPhase("completed");
      } else {
        setPhase("failed");
      }
    } catch {
      setFatal("The inspection could not be completed. Please retry.");
      setPhase("failed");
    }
  }

  const running = phase === "connecting" || phase === "fetching";
  const events = result?.audit?.events ?? result?.events ?? [];

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Radar className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Repository inspection</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result?.cached && <StatusPill tone="idle">cached (same commit)</StatusPill>}
          <StatusPill
            tone={phase === "completed" ? "ok" : phase === "failed" ? "fail" : running ? "warn" : "idle"}
          >
            {PHASE_LABEL[phase]}
          </StatusPill>
        </div>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Reads the real repository tree at the current commit, prioritises architecture-relevant
        files and produces an evidence-based audit. Inspection is read-only — nothing is written,
        committed or pushed.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={inspect}
          disabled={running || !connected}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
          {running ? "Inspecting…" : audit ? "Re-inspect repository" : "Inspect repository"}
        </button>
        {!connected && (
          <span className="font-mono text-xs text-muted-foreground">
            Test the repository connection first.
          </span>
        )}
      </div>

      {(fatal || (result && !result.ok)) && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {fatal ?? result?.error}
          {result?.errorKind === "rate_limit" && result.rateLimit && (
            <div className="mt-1 font-mono text-xs">
              rate limit remaining: {result.rateLimit.remaining} · resets {result.rateLimit.resetAt}
            </div>
          )}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-5 space-y-1.5 border-t border-border pt-4">
          <span className="label-caps">Live activity</span>
          {events.map((e, i) => (
            <div key={`${e.label}-${i}`} className="flex items-start gap-2.5 text-sm">
              {e.state === "ok" ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
              ) : e.state === "warn" ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <span className="font-medium">{e.label}</span>
                <span className="ml-2 font-mono text-xs break-words text-muted-foreground">
                  {e.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {result?.rateLimit && result.ok && (
        <p className="mt-3 font-mono text-[0.68rem] text-muted-foreground">
          GitHub API calls remaining this hour: {result.rateLimit.remaining}
        </p>
      )}
    </section>
  );
}

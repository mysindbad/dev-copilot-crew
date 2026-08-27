import { useEffect, useState } from "react";
import { getUserSecrets } from "@/lib/user-secrets";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ScanEye, ShieldAlert, TestTube2, FileSearch } from "lucide-react";
import { reviewChangeSet } from "@/lib/review.functions";
import type { ChangeSet } from "@/lib/coder.types";
import type { ReviewBoardResult, ReviewerId, ReviewerReport } from "@/lib/review.types";
import type { ProviderConfig } from "./ProviderPanel";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const REVIEWERS: { id: ReviewerId; name: string; icon: typeof ScanEye }[] = [
  { id: "code", name: "Code Reviewer", icon: FileSearch },
  { id: "security", name: "Security Reviewer", icon: ShieldAlert },
  { id: "qa", name: "QA / Tester", icon: TestTube2 },
];

const SEVERITY_TONE: Record<string, string> = {
  BLOCKER: "text-destructive",
  MAJOR: "text-warning",
  MINOR: "text-muted-foreground",
  INFO: "text-muted-foreground",
};

export function ReviewPanel({
  changeSet,
  provider,
  result,
  onResult,
}: {
  changeSet: ChangeSet | null;
  provider: ProviderConfig;
  result: ReviewBoardResult | null;
  onResult: (r: ReviewBoardResult | null) => void;
}) {
  const { t } = useI18n();
  const run = useServerFn(reviewChangeSet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewerId[]>(["code", "security", "qa"]);

  useEffect(() => {
    setError(null);
  }, [changeSet]);

  const ready = Boolean(changeSet && provider.primaryModel && selected.length);

  function toggle(id: ReviewerId) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function submit() {
    if (!changeSet) return;
    setBusy(true);
    setError(null);
    onResult(null);
    try {
      const res = await run({
        data: {
          secrets: getUserSecrets(),
          changeSetId: changeSet.changeSetId,
          taskId: changeSet.taskId,
          request: changeSet.request,
          repository: changeSet.repository,
          branch: changeSet.branch,
          baseCommitSha: changeSet.baseCommitSha,
          summary: changeSet.summary,
          files: changeSet.files.map((f) => ({
            path: f.path,
            action: f.action,
            reason: f.reason,
            additions: f.additions,
            deletions: f.deletions,
            diffText: f.diff.map((l) => l.text).join("\n"),
          })),
          reviewers: selected,
          primaryProvider: provider.primaryProvider,
          primaryModel: provider.primaryModel,
          fallbackProvider: provider.fallbackProvider,
          fallbackModel: provider.fallbackModel,
        },
      });
      onResult(res);
      if (!res.ok) setError(res.error ?? "The review board could not complete.");
    } catch {
      setError("The review board is unavailable — the request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <ScanEye className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{t("panel.review.title")}</h2>
        </div>
        <StatusPill
          tone={
            result?.gate === "APPROVED"
              ? "ok"
              : result?.gate === "CHANGES_REQUESTED"
                ? "warn"
                : result
                  ? "warn"
                  : "idle"
          }
        >
          {result ? result.gate.toLowerCase().replace("_", " ") : "not reviewed"}
        </StatusPill>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Read-only reviewer agents run in parallel over the real staged diff before anything reaches
        GitHub. Each verdict comes from a real model call; a reviewer that fails is never counted as
        an approval.
      </p>

      {!changeSet ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Stage a change set with the Coder Agent first — there is nothing to review yet.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {REVIEWERS.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={cn(
                  "flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition-colors",
                  selected.includes(id)
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            className="mt-4 inline-flex items-center gap-2 rounded bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanEye className="size-4" />}
            {busy ? "Reviewing diff…" : "Run review board"}
          </button>
          {!provider.primaryModel && (
            <p className="mt-2 text-xs text-warning">
              Select a provider model above before running the review board.
            </p>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {result && (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Total label="Blockers" value={result.totals.blockers} tone="bad" />
                <Total label="Major" value={result.totals.majors} tone="warn" />
                <Total label="Minor" value={result.totals.minors} />
                <Total label="Info" value={result.totals.infos} />
              </div>

              <ul className="space-y-1 font-mono text-[0.68rem] text-muted-foreground">
                {result.events.map((e, i) => (
                  <li key={i}>
                    <span
                      className={
                        e.state === "ok"
                          ? "text-success"
                          : e.state === "warn"
                            ? "text-warning"
                            : "text-destructive"
                      }
                    >
                      [{e.state}]
                    </span>{" "}
                    {e.label} — {e.detail}
                  </li>
                ))}
              </ul>

              <div className="space-y-4">
                {result.reports.map((report) => (
                  <ReportView key={report.reviewer} report={report} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="rounded border border-border p-3">
      <span className="label-caps">{label}</span>
      <div
        className={cn(
          "mt-1 font-mono text-lg",
          value === 0
            ? "text-muted-foreground"
            : tone === "bad"
              ? "text-destructive"
              : tone === "warn"
                ? "text-warning"
                : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ReportView({ report }: { report: ReviewerReport }) {
  return (
    <div className="rounded border border-border p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{report.name}</span>
        <StatusPill
          tone={!report.ok ? "warn" : report.verdict === "APPROVE" ? "ok" : "warn"}
        >
          {report.ok ? report.verdict.toLowerCase().replace("_", " ") : "failed"}
        </StatusPill>
      </header>

      {report.ok ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{report.summary}</p>
          <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
            {report.provider} · {report.model} · {report.ms}ms
            {report.usedFallback ? " · fallback provider" : ""}
          </p>

          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {report.checklist.map((c) => (
              <li key={c.item} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "font-mono",
                    c.state === "pass"
                      ? "text-success"
                      : c.state === "fail"
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  [{c.state}]
                </span>
                <span className="text-muted-foreground">{c.item}</span>
              </li>
            ))}
          </ul>

          {report.findings.length > 0 && (
            <ul className="mt-3 space-y-2">
              {report.findings.map((f, i) => (
                <li key={i} className="rounded border border-border/70 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-mono text-[0.68rem]", SEVERITY_TONE[f.severity])}>
                      {f.severity}
                    </span>
                    <span className="font-mono text-[0.68rem] text-muted-foreground">{f.path}</span>
                    <span className="text-sm">{f.title}</span>
                  </div>
                  {f.detail && <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>}
                  {f.suggestion && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="text-foreground">Suggestion:</span> {f.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-destructive">{report.error}</p>
      )}
    </div>
  );
}

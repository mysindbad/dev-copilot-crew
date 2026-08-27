import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Loader2, ExternalLink } from "lucide-react";
import { commitStagedChanges } from "@/lib/git.functions";
import type { ChangeSet } from "@/lib/coder.types";
import type { GitCheck, GitEvent, GitCommitReport } from "@/lib/git.types";
import { StatusPill } from "./StatusPill";

function suggestBranch(changeSet: ChangeSet): string {
  const slug = (changeSet.request || changeSet.taskId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `ai-dev-team/${slug || "change"}-${changeSet.changeSetId.slice(0, 8)}`;
}

export function GitPanel({ changeSet }: { changeSet: ChangeSet | null }) {
  const run = useServerFn(commitStagedChanges);
  const [branchName, setBranchName] = useState("");
  const [message, setMessage] = useState("");
  const [openPr, setOpenPr] = useState(true);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<"dry" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<GitCheck[]>([]);
  const [events, setEvents] = useState<GitEvent[]>([]);
  const [report, setReport] = useState<GitCommitReport | null>(null);
  const [dryOk, setDryOk] = useState(false);

  useEffect(() => {
    setChecks([]);
    setEvents([]);
    setReport(null);
    setError(null);
    setApproved(false);
    setDryOk(false);
    if (changeSet) {
      setBranchName(suggestBranch(changeSet));
      setMessage(
        `${changeSet.summary?.split("\n")[0]?.slice(0, 72) || "AI Dev Team change"}\n\nTask: ${changeSet.taskId}`,
      );
    }
  }, [changeSet]);

  async function submit(dryRun: boolean) {
    if (!changeSet) return;
    setBusy(dryRun ? "dry" : "commit");
    setError(null);
    setChecks([]);
    setEvents([]);
    if (!dryRun) setReport(null);
    try {
      const res = await run({
        data: {
          changeSet: {
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
              after: f.after,
            })),
          },
          branchName,
          commitMessage: message,
          openPullRequest: openPr,
          dryRun,
        },
      });
      setChecks(res.checks);
      setEvents(res.events);
      setDryOk(Boolean(res.ok && res.dryRun));
      if (res.report) setReport(res.report);
      if (!res.ok) setError(res.error ?? "The Git Manager could not complete the request.");
    } catch {
      setError("The Git Manager is unavailable — the request could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <GitBranch className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Git manager</h2>
        </div>
        <StatusPill tone={report ? "ok" : changeSet ? "idle" : "warn"}>
          {report ? "committed to new branch" : changeSet ? "awaiting approval" : "needs a diff"}
        </StatusPill>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        The only component allowed to write to GitHub. It commits the exact approved diff to a new
        branch on top of the audited commit and can open a pull request. The base branch is never
        modified, nothing is force-pushed and no history is rewritten.
      </p>

      {!changeSet ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Stage a change set with the Coder Agent first — only a reviewed diff can be committed.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label-caps">New branch</span>
              <input
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value);
                  setDryOk(false);
                }}
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              />
            </label>
            <div>
              <span className="label-caps">Target</span>
              <div className="mt-1 font-mono text-xs break-all text-muted-foreground">
                {changeSet.repository} · base {changeSet.branch}@
                {changeSet.baseCommitSha.slice(0, 7)} · {changeSet.totals.files} file(s) +
                {changeSet.totals.additions}/−{changeSet.totals.deletions}
              </div>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="label-caps">Commit message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
          </label>

          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={openPr}
                onChange={(e) => setOpenPr(e.target.checked)}
                className="mt-1 size-3.5 accent-primary"
              />
              <span>Open a pull request into {changeSet.branch} for human review</span>
            </label>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                className="mt-1 size-3.5 accent-primary"
              />
              <span>
                I reviewed the staged diff above and approve committing it to a new branch.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => submit(true)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "dry" && <Loader2 className="size-4 animate-spin" />}
              Run pre-flight checks
            </button>
            <button
              onClick={() => submit(false)}
              disabled={busy !== null || !approved || Boolean(report)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "commit" && <Loader2 className="size-4 animate-spin" />}
              Commit to new branch
            </button>
            {!approved && !report && (
              <span className="font-mono text-[0.7rem] text-muted-foreground">
                approval required before any write
              </span>
            )}
            {dryOk && !report && (
              <span className="font-mono text-[0.7rem] text-success">
                pre-flight passed — nothing written
              </span>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      {checks.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {checks.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill
                tone={c.state === "pass" ? "ok" : c.state === "fail" ? "fail" : c.state === "warn" ? "warn" : "idle"}
              >
                {c.state}
              </StatusPill>
              <span>{c.label}</span>
              <span className="font-mono text-[0.68rem] break-all text-muted-foreground">
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {events.length > 0 && (
        <ul className="mt-3 space-y-1 font-mono text-[0.7rem] text-muted-foreground">
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <StatusPill tone={e.state === "ok" ? "ok" : e.state === "warn" ? "warn" : "fail"}>
                {e.label}
              </StatusPill>
              <span>{e.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {report && (
        <div className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
          <div className="font-mono text-[0.7rem] break-all text-muted-foreground">
            {report.repository} · branch {report.branch} · commit {report.commitSha.slice(0, 7)} ·
            base {report.baseBranch}@{report.baseCommitSha.slice(0, 7)}
          </div>
          <div className="flex flex-wrap gap-4">
            <a
              href={report.commitUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" /> View commit
            </a>
            <a
              href={report.branchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" /> View branch
            </a>
            {report.pullRequest && (
              <a
                href={report.pullRequest.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Pull request #{report.pullRequest.number}
              </a>
            )}
          </div>
          <ul className="space-y-1 font-mono text-[0.7rem] text-muted-foreground">
            {report.files.map((f) => (
              <li key={f.path}>
                {f.action} · {f.path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

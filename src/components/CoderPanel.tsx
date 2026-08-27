import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Code2, Loader2, ShieldCheck } from "lucide-react";
import { implementPlan } from "@/lib/coder.functions";
import type { ArchitectPlan } from "@/lib/architect.types";
import type { ChangeSet, CoderAttempt, CoderEvent, StagedFile } from "@/lib/coder.types";
import type { ProviderConfig } from "./ProviderPanel";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";

export function CoderPanel({
  plan,
  provider,
  changeSet,
  onChangeSet,
}: {
  plan: ArchitectPlan | null;
  provider: ProviderConfig;
  changeSet: ChangeSet | null;
  onChangeSet: (c: ChangeSet | null) => void;
}) {
  const run = useServerFn(implementPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<CoderAttempt[]>([]);
  const [events, setEvents] = useState<CoderEvent[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const steps = plan?.steps ?? [];
  const activeOrders = useMemo(
    () => (selected.length ? selected : steps.map((s) => s.order)),
    [selected, steps],
  );
  const ready = Boolean(plan) && Boolean(provider.primaryModel) && steps.length > 0;

  function toggle(order: number) {
    setSelected((prev) =>
      prev.includes(order) ? prev.filter((o) => o !== order) : [...prev, order],
    );
  }

  async function submit() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    setAttempts([]);
    setEvents([]);
    onChangeSet(null);
    try {
      const res = await run({
        data: {
          plan: {
            taskId: plan.taskId,
            request: plan.request,
            repository: plan.repository,
            branch: plan.branch,
            commitSha: plan.commitSha,
            summary: plan.summary,
            approach: plan.approach,
            affectedFiles: plan.affectedFiles,
            steps: plan.steps,
          },
          stepOrders: activeOrders,
          primaryProvider: provider.primaryProvider,
          primaryModel: provider.primaryModel,
          fallbackProvider: provider.fallbackProvider,
          fallbackModel: provider.fallbackModel,
        },
      });
      setAttempts(res.attempts);
      setEvents(res.events);
      if (res.ok && res.changeSet) onChangeSet(res.changeSet);
      else setError(res.error ?? "The Coder Agent produced no usable change.");
    } catch {
      setError("The Coder Agent is unavailable — the request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Code2 className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Coder agent</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={changeSet ? "ok" : plan ? "idle" : "warn"}>
            {changeSet ? "diff staged" : plan ? "idle" : "needs a plan"}
          </StatusPill>
          <StatusPill tone="warn">not committed</StatusPill>
        </div>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Applies the approved plan to the real files at the audited commit and returns a controlled
        change set with a real git-style diff. Nothing is written, branched, committed or pushed.
      </p>

      {plan ? (
        <>
          <span className="label-caps mt-4 block">Steps to implement</span>
          <ul className="mt-2 space-y-1.5">
            {steps.map((s) => (
              <li key={s.order} className="flex items-start gap-2.5 text-sm">
                <input
                  id={`coder-step-${s.order}`}
                  type="checkbox"
                  checked={activeOrders.includes(s.order)}
                  onChange={() => toggle(s.order)}
                  className="mt-1 size-3.5 accent-primary"
                />
                <label htmlFor={`coder-step-${s.order}`} className="cursor-pointer">
                  <span className="font-mono text-[0.7rem] text-muted-foreground">
                    [{s.order}] {s.agent} · {s.risk}
                  </span>
                  <div>{s.title}</div>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={submit}
              disabled={!ready || busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Implement plan
            </button>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {!provider.primaryModel
                ? "select a model in AI providers"
                : `${provider.primaryProvider} · ${provider.primaryModel} · base ${plan.commitSha.slice(0, 7)}`}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Generate an architect plan first — the Coder Agent only implements approved plan steps.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      {attempts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {attempts.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 font-mono text-[0.7rem]">
              <StatusPill tone={a.ok ? "ok" : "fail"}>{a.provider}</StatusPill>
              <span className="text-muted-foreground">
                {a.model} · {a.ms}ms · {a.detail}
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

      {changeSet && <ChangeSetView changeSet={changeSet} />}
    </section>
  );
}

function ChangeSetView({ changeSet }: { changeSet: ChangeSet }) {
  return (
    <div className="mt-5 space-y-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.7rem] text-muted-foreground">
        <span>{changeSet.changeSetId}</span>
        <span>·</span>
        <span>
          {changeSet.repository}@{changeSet.baseCommitSha.slice(0, 7)}
        </span>
        <span>·</span>
        <span className="text-success">+{changeSet.totals.additions}</span>
        <span className="text-destructive">−{changeSet.totals.deletions}</span>
        <span>· {changeSet.totals.files} file(s)</span>
      </div>

      <div>
        <span className="label-caps">Summary</span>
        <p className="mt-1 text-sm text-muted-foreground">{changeSet.summary}</p>
      </div>

      {changeSet.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {changeSet.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      <div>
        <span className="label-caps flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-primary" /> Guardrails
        </span>
        <ul className="mt-2 space-y-1.5">
          {changeSet.guardrails.map((g, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill tone={g.state === "pass" ? "ok" : "fail"}>{g.state}</StatusPill>
              <span>{g.rule}</span>
              <span className="font-mono text-[0.68rem] text-muted-foreground">{g.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {changeSet.blocked.length > 0 && (
        <div>
          <span className="label-caps">Rejected changes</span>
          <ul className="mt-2 space-y-1 font-mono text-[0.7rem] text-warning">
            {changeSet.blocked.map((b, i) => (
              <li key={i}>
                {b.path} — {b.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <span className="label-caps">Staged diff (not committed)</span>
        <div className="mt-2 space-y-4">
          {changeSet.files.map((f) => (
            <FileDiff key={f.path} file={f} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FileDiff({ file }: { file: StagedFile }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="font-mono text-xs break-all">{file.path}</span>
        <span className="flex items-center gap-2 font-mono text-[0.68rem]">
          <StatusPill tone={file.action === "DELETE" ? "fail" : "ok"}>{file.action}</StatusPill>
          <span className="text-success">+{file.additions}</span>
          <span className="text-destructive">−{file.deletions}</span>
        </span>
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto border-t border-border bg-muted/30 px-3 py-2 font-mono text-[0.7rem] leading-5">
          {file.diff.map((l, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre",
                l.kind === "add" && "bg-success/10 text-success",
                l.kind === "del" && "bg-destructive/10 text-destructive",
                l.kind === "hunk" && "text-primary",
                l.kind === "ctx" && "text-muted-foreground",
              )}
            >
              {l.kind === "add" ? "+" : l.kind === "del" ? "-" : l.kind === "ctx" ? " " : ""}
              {l.text}
            </div>
          ))}
          {file.truncatedDiff && <div className="text-warning">… diff truncated</div>}
        </pre>
      )}
    </div>
  );
}

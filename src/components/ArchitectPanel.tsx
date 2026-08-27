import { useEffect, useState } from "react";
import { getUserSecrets } from "@/lib/user-secrets";
import { useServerFn } from "@tanstack/react-start";
import { DraftingCompass, Loader2 } from "lucide-react";
import { generateArchitecturePlan } from "@/lib/architect.functions";
import type { ArchitectAttempt, ArchitectPlan } from "@/lib/architect.types";
import type { ProviderConfig } from "./ProviderPanel";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function ArchitectPanel({
  projectId,
  provider,
  plan,
  seedRequest,
  onPlan,
}: {
  projectId: string | null;
  provider: ProviderConfig;
  plan: ArchitectPlan | null;
  seedRequest?: string;
  onPlan: (p: ArchitectPlan | null) => void;
}) {
  const { t } = useI18n();
  const run = useServerFn(generateArchitecturePlan);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<ArchitectAttempt[]>([]);

  useEffect(() => {
    if (seedRequest) setRequest(seedRequest);
  }, [seedRequest]);

  const ready = Boolean(projectId) && Boolean(provider.primaryModel) && request.trim().length >= 8;

  async function submit() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setAttempts([]);
    try {
      const res = await run({
        data: {
          secrets: getUserSecrets(),
          projectId,
          request: request.trim(),
          primaryProvider: provider.primaryProvider,
          primaryModel: provider.primaryModel,
          fallbackProvider: provider.fallbackProvider,
          fallbackModel: provider.fallbackModel,
        },
      });
      setAttempts(res.attempts);
      if (res.ok && res.plan) {
        onPlan(res.plan);
      } else {
        onPlan(null);
        setError(res.error ?? "The Architect could not produce a plan.");
      }
    } catch {
      onPlan(null);
      setError("The Architect Agent is unavailable — the request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <DraftingCompass className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{t("panel.architect.title")}</h2>
        </div>
        <StatusPill tone={plan ? "ok" : projectId ? "idle" : "warn"}>
          {plan ? "plan ready" : projectId ? "idle" : "needs inspection"}
        </StatusPill>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
{t("panel.architect.desc")}
      </p>

      <label className="label-caps mt-4 block" htmlFor="architect-request">
        {t("panel.architect.request")}
      </label>
      <textarea
        id="architect-request"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={3}
        placeholder="e.g. Add rate limiting to the public API endpoints"
        className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-ring"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={!ready || busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("panel.architect.button")}
        </button>
        <span className="font-mono text-[0.7rem] text-muted-foreground">
          {!projectId
            ? "run an inspection first"
            : !provider.primaryModel
              ? "select a model in AI providers"
              : `${provider.primaryProvider} · ${provider.primaryModel}`}
        </span>
      </div>

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

      {plan && <PlanView plan={plan} />}
    </section>
  );
}

function PlanView({ plan }: { plan: ArchitectPlan }) {
  return (
    <div className="mt-5 space-y-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] text-muted-foreground">
        <span>task {plan.taskId}</span>
        <span>·</span>
        <span>
          {plan.repository}@{plan.commitSha.slice(0, 7)}
        </span>
        <span>·</span>
        <span>
          {plan.provider}/{plan.model}
        </span>
        {plan.usedFallback && <StatusPill tone="warn">fallback used</StatusPill>}
      </div>

      <div>
        <span className="label-caps">Summary</span>
        <p className="mt-1 text-sm">{plan.summary}</p>
      </div>

      <div>
        <span className="label-caps">Approach</span>
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{plan.approach}</p>
      </div>

      {plan.steps.length > 0 && (
        <div>
          <span className="label-caps">Implementation steps</span>
          <ol className="mt-2 space-y-2.5">
            {plan.steps.map((s) => (
              <li key={s.order} className="rounded-md border border-border bg-surface/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {s.order}. {s.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.66rem] text-muted-foreground">
                      {s.agent}
                    </span>
                    <StatusPill
                      tone={s.risk === "HIGH" ? "fail" : s.risk === "MEDIUM" ? "warn" : "idle"}
                    >
                      {s.risk.toLowerCase()}
                    </StatusPill>
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.detail}</p>
                {s.files.length > 0 && (
                  <p className="mt-1.5 font-mono text-[0.66rem] break-words text-muted-foreground">
                    {s.files.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan.affectedFiles.length > 0 && (
        <div>
          <span className="label-caps">Affected files</span>
          <ul className="mt-2 divide-y divide-border">
            {plan.affectedFiles.map((f) => (
              <li key={f.path} className="flex flex-wrap items-center gap-2 py-2">
                <StatusPill
                  tone={f.change === "DELETE" ? "fail" : f.change === "CREATE" ? "warn" : "idle"}
                >
                  {f.change.toLowerCase()}
                </StatusPill>
                <span className="font-mono text-xs break-all">{f.path}</span>
                <span
                  className={cn(
                    "font-mono text-[0.62rem]",
                    f.existsInRepo ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {f.existsInRepo ? "exists in repo" : "not in audited files"}
                </span>
                <span className="w-full text-xs text-muted-foreground">{f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <List title="Test strategy" items={plan.testStrategy} />
        <List title="Risks" items={plan.risks} />
        <List title="Open questions" items={plan.openQuestions} />
        <List title="Out of scope" items={plan.outOfScope} />
        <List title="Assumptions" items={plan.assumptions} />
        <List title="Grounding facts" items={plan.groundingFacts} mono />
      </div>
    </div>
  );
}

function List({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <span className="label-caps">{title}</span>
      <ul className="mt-1.5 space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className={cn(
              "text-muted-foreground",
              mono ? "font-mono text-[0.68rem] break-words" : "text-sm",
            )}
          >
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

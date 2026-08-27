import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Terminal,
  GitCommitHorizontal,
  Users,
  Lock,
  ListTodo,
  Languages,
} from "lucide-react";
import {
  getSecretsStatus,
  type ProviderStatus,
  type RepoConnectionResult,
} from "@/lib/connection.functions";
import type { RepositoryAudit } from "@/lib/inspection.types";
import type { ArchitectPlan } from "@/lib/architect.types";
import { ConnectRepository, type RepoConfig } from "@/components/ConnectRepository";
import { ProviderPanel, type ProviderConfig } from "@/components/ProviderPanel";
import { InspectionPanel } from "@/components/InspectionPanel";
import { RepositoryAuditView } from "@/components/RepositoryAuditView";
import { ArchitectPanel } from "@/components/ArchitectPanel";
import { CoderPanel } from "@/components/CoderPanel";
import { GitPanel } from "@/components/GitPanel";
import { ReviewPanel } from "@/components/ReviewPanel";
import { TeamChat } from "@/components/TeamChat";
import { ActivityFeed } from "@/components/ActivityFeed";
import type { ReviewBoardResult } from "@/lib/review.types";
import type { ChangeSet } from "@/lib/coder.types";
import { StatusPill } from "@/components/StatusPill";
import { useI18n, type TKey } from "@/lib/i18n";
import { useActivity } from "@/lib/activity";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My AI Dev Team — Multi-Agent Dev Platform" },
      {
        name: "description",
        content:
          "Connect a GitHub repository and AI providers to a coordinated team of specialized AI software engineering agents.",
      },
      { property: "og:title", content: "My AI Dev Team — Multi-Agent Dev Platform" },
      {
        property: "og:description",
        content:
          "A GitHub-connected multi-agent software development platform: plan, implement, test, review and approve every change.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const CONFIG_KEY = "aidevteam.config.v1";

const AGENTS: [TKey, TKey][] = [
  ["agent.pm", "perm.orchestration"],
  ["agent.architect", "perm.read"],
  ["agent.uiux", "perm.read"],
  ["agent.frontend", "perm.rwx"],
  ["agent.backend", "perm.rwx"],
  ["agent.security", "perm.read"],
  ["agent.qa", "perm.rx"],
  ["agent.debugger", "perm.rx"],
  ["agent.reviewer", "perm.read"],
];

function Dashboard() {
  const { t, lang, toggle } = useI18n();
  const tx = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const { log, finish } = useActivity();

  const secretsFn = useServerFn(getSecretsStatus);
  const { data: secrets } = useQuery({
    queryKey: ["secrets-status"],
    queryFn: () => secretsFn({}),
  });

  const [repoConfig, setRepoConfig] = useState<RepoConfig>({ repoUrl: "", branch: "main" });
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({
    primaryProvider: "gemini",
    primaryModel: "",
    fallbackProvider: "none",
    fallbackModel: "",
    freeOnly: true,
  });
  const [repoResult, setRepoResult] = useState<RepoConnectionResult | null>(null);
  const [plan, setPlan] = useState<ArchitectPlan | null>(null);
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);
  const [review, setReview] = useState<ReviewBoardResult | null>(null);
  const [audit, setAudit] = useState<RepositoryAudit | null>(null);
  const [seedRequest, setSeedRequest] = useState("");
  const [providerStatuses, setProviderStatuses] = useState<
    Partial<Record<"gemini" | "openrouter", ProviderStatus>>
  >({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { repo?: RepoConfig; provider?: ProviderConfig };
        if (parsed.repo) setRepoConfig(parsed.repo);
        if (parsed.provider) setProviderConfig(parsed.provider);
      }
    } catch {
      /* ignore malformed config */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // Non-secret configuration only — credentials never touch the browser.
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ repo: repoConfig, provider: providerConfig }),
    );
  }, [hydrated, repoConfig, providerConfig]);

  const repo = repoResult?.ok ? repoResult.repository : undefined;
  const providerReady = Object.values(providerStatuses).some((s) => s?.ok);

  function track(agent: TKey, action: TKey, model?: string, detail?: string) {
    const id = log({ agent: t(agent), action: t(action), state: "done", ...(model ? { model } : {}), ...(detail ? { detail } : {}) });
    finish(id, { state: "done" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Terminal className="size-5 text-primary" />
            <h1 className="text-sm font-semibold tracking-tight sm:text-base">{t("app.title")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={repo ? "ok" : "idle"}>
              {repo ? t("status.repoOn") : t("status.repoOff")}
            </StatusPill>
            <StatusPill tone={audit ? "ok" : "idle"}>
              {audit ? `${t("status.inspected")} ${audit.commitSha.slice(0, 7)}` : t("status.notInspected")}
            </StatusPill>
            <StatusPill tone={providerReady ? "ok" : "idle"}>
              {providerReady ? t("status.providerReady") : t("status.providerIdle")}
            </StatusPill>
            <StatusPill tone={review?.gate === "APPROVED" ? "ok" : review ? "warn" : "idle"}>
              {review
                ? `${t("status.reviewed")} ${review.gate.toLowerCase().replace("_", " ")}`
                : t("status.notReviewed")}
            </StatusPill>
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary/60"
            >
              <Languages className="size-3.5 text-primary" />
              {t("lang.toggle")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className="panel p-4 sm:p-6">
          <span className="label-caps">{t("project.current")}</span>
          {repo ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("project.repository")} value={repo.fullName} />
              <Field label={t("project.branch")} value={repo.branch} />
              <Field
                label={t("project.access")}
                value={repo.writeAccess ? t("project.rw") : t("project.ro")}
                tone={repo.writeAccess ? "ok" : "warn"}
              />
              <Field
                label={t("project.visibility")}
                value={repo.private ? t("project.private") : t("project.public")}
              />
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="label-caps">{t("project.lastCommit")}</span>
                <div className="mt-1 flex items-start gap-2 font-mono text-xs break-words text-muted-foreground">
                  <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    {repo.lastCommit?.sha} · {repo.lastCommit?.message} — {repo.lastCommit?.author}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("project.empty")}</p>
          )}
        </section>

        <ActivityFeed />

        <TeamChat
          provider={providerConfig}
          context={{
            repository: repo?.fullName ?? repoConfig.repoUrl,
            branch: repoConfig.branch,
            commitSha: audit?.commitSha ?? "",
            stack: audit
              ? [
                  audit.stack.frontend.value,
                  audit.stack.backend.value,
                  audit.stack.database.value,
                  audit.stack.deployment.value,
                ].filter((v) => v && v !== "UNKNOWN")
              : [],
            entryPoints: audit ? audit.entryPoints.map((e) => e.path).slice(0, 10) : [],
            apiRoutes: audit?.apiMap.length ?? 0,
            fileCount: audit?.counts.totalFiles ?? 0,
            planSummary: plan ? `${plan.summary} (${plan.steps.length} steps)` : "",
            changeSetSummary: changeSet
              ? `${changeSet.totals.files} files, +${changeSet.totals.additions}/-${changeSet.totals.deletions}`
              : "",
            reviewGate: review?.gate ?? "",
          }}
          onUseTask={(task) => {
            setSeedRequest(task);
            document.getElementById("architect-request")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />

        <ConnectRepository
          config={repoConfig}
          onConfigChange={setRepoConfig}
          result={repoResult}
          onResult={(r) => {
            setRepoResult(r);
            setAudit(null);
            setPlan(null);
            setChangeSet(null);
            setReview(null);
            track("agent.pm", r?.ok ? "act.connected" : "act.connect");
          }}
          tokenConfigured={Boolean(secrets?.github)}
        />

        <InspectionPanel
          repoUrl={repoConfig.repoUrl}
          branch={repoConfig.branch}
          connected={Boolean(repo)}
          audit={audit}
          onAudit={(a) => {
            setAudit(a);
            setPlan(null);
            if (a) track("agent.inspector", "act.inspected", undefined, `${a.counts.totalFiles} files`);
          }}
        />

        {audit && <RepositoryAuditView audit={audit} />}

        <ProviderPanel
          config={providerConfig}
          onConfigChange={setProviderConfig}
          secrets={{ gemini: Boolean(secrets?.gemini), openrouter: Boolean(secrets?.openrouter) }}
          statuses={providerStatuses}
          onStatus={(s) => setProviderStatuses((prev) => ({ ...prev, [s.provider]: s }))}
        />

        <ArchitectPanel
          projectId={audit?.projectId ?? null}
          provider={providerConfig}
          plan={plan}
          seedRequest={seedRequest}
          onPlan={(p) => {
            setPlan(p);
            setChangeSet(null);
            setReview(null);
            if (p) track("agent.architect", "act.planned", p.model, `${p.steps.length} steps`);
          }}
        />

        <CoderPanel
          plan={plan}
          provider={providerConfig}
          changeSet={changeSet}
          onChangeSet={(c) => {
            setChangeSet(c);
            setReview(null);
            if (c)
              track(
                "agent.frontend",
                "act.coded",
                c.model,
                `${c.totals.files} files +${c.totals.additions}/-${c.totals.deletions}`,
              );
          }}
        />

        <ReviewPanel
          changeSet={changeSet}
          provider={providerConfig}
          result={review}
          onResult={(r) => {
            setReview(r);
            if (r) track("agent.reviewer", "act.reviewed", r.reports[0]?.model, r.gate);
          }}
        />

        <GitPanel changeSet={changeSet} reviewGate={review?.gate ?? null} />

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel p-4 sm:p-6">
            <header className="flex items-center gap-2.5">
              <Users className="size-4 text-primary" />
              <h2 className="text-base font-semibold">{t("team.title")}</h2>
            </header>
            <p className="mt-2 text-sm text-muted-foreground">{t("team.desc")}</p>

            <ul className="mt-4 divide-y divide-border">
              {AGENTS.map(([name, perms]) => (
                <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">{t(name)}</span>
                  <span className="text-[0.72rem] text-muted-foreground">{t(perms)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-5">
            <section className="panel p-4 sm:p-6">
              <header className="flex items-center gap-2.5">
                <ListTodo className="size-4 text-primary" />
                <h2 className="text-base font-semibold">
                  {tx("المهمة الحالية", "Current task")}
                </h2>
              </header>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan
                  ? tx(
                      `الخطة ${plan.taskId} — ${plan.steps.length} خطوات للطلب: "${plan.request}".${changeSet ? ` المبرمج جهّز ${changeSet.totals.files} ملف: +${changeSet.totals.additions}/-${changeSet.totals.deletions} بانتظار موافقتك.` : " تخطيط فقط، لم يُكتب أي كود بعد."}`,
                      `Plan ${plan.taskId} — ${plan.steps.length} steps for "${plan.request}".${changeSet ? ` Coder staged ${changeSet.totals.files} file(s): +${changeSet.totals.additions}/-${changeSet.totals.deletions}.` : " Planning only; no code written yet."}`,
                    )
                  : tx(
                      "لا توجد مهمة نشطة. تحدّث مع قائد الفريق أعلاه، ثم أنشئ خطة المهندس المعماري.",
                      "No active task. Talk to the Team Lead above, then generate an Architect plan.",
                    )}
              </p>
            </section>

            <section className="panel p-4 sm:p-6">
              <header className="flex items-center gap-2.5">
                <Lock className="size-4 text-primary" />
                <h2 className="text-base font-semibold">
                  {tx("حماية المفاتيح", "Credential security")}
                </h2>
              </header>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  {tx(
                    "توكن GitHub ومفاتيح المزوّدين محفوظة على الخادم فقط.",
                    "GitHub token and provider keys are stored as server-side secrets.",
                  )}
                </li>
                <li>
                  {tx(
                    "تُقرأ المفاتيح داخل الخادم فقط ولا تصل إلى المتصفح أبدًا.",
                    "Secrets are read only inside server handlers, never sent to the browser.",
                  )}
                </li>
                <li>
                  {tx(
                    "لا مفاتيح في المتصفح ولا في السجلات ولا في طلبات النماذج.",
                    "No credentials in localStorage, logs, agent prompts or model requests.",
                  )}
                </li>
                <li>
                  {tx(
                    "أخطاء المزوّدين تُنقّى قبل عرضها.",
                    "Provider errors are redacted before being shown.",
                  )}
                </li>
              </ul>
            </section>
          </div>
        </div>

        <section className="panel p-4 sm:p-6">
          <span className="label-caps">{t("team.roadmap")}</span>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              [tx("المرحلة 1", "Phase 1"), tx("طبقة اتصال آمنة", "Secure connection layer")],
              [tx("المرحلة 2", "Phase 2"), tx("فحص المستودع", "Repository inspection")],
              [tx("المرحلة 3", "Phase 3"), tx("المهندس المعماري (تخطيط)", "Architect agent (planning)")],
              [tx("المرحلة 4", "Phase 4"), tx("المبرمج (تعديلات محكومة)", "Coder agent (controlled diffs)")],
              [tx("المرحلة 5", "Phase 5"), tx("مدير Git (فرع، commit، PR)", "Git manager (branch, commit, PR)")],
              [tx("المرحلة 6", "Phase 6"), tx("مجلس المراجعة", "Review board")],
              [tx("المرحلة 7", "Phase 7"), tx("حوار قائد الفريق وواجهة عربية", "Team Lead chat & Arabic UI")],
            ].map(([phase, label]) => (
              <li key={phase} className="flex items-center gap-2.5">
                <StatusPill tone="ok">{t("team.done")}</StatusPill>
                <span className="text-muted-foreground">
                  <span className="text-foreground">{phase}</span> — {label}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div
        className={
          "mt-1 font-mono text-sm break-words " +
          (tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}

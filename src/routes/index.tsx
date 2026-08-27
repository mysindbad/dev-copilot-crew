import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Terminal, GitCommitHorizontal, Users, Lock, ListTodo } from "lucide-react";
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
import type { ChangeSet } from "@/lib/coder.types";
import { StatusPill } from "@/components/StatusPill";


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

const AGENTS = [
  ["Project Manager", "Orchestration only"],
  ["Architect", "Read only"],
  ["UI/UX Reviewer", "Read only"],
  ["Frontend Developer", "Read · Write · Execute"],
  ["Backend Developer", "Read · Write · Execute"],
  ["Security Reviewer", "Read only"],
  ["QA / Tester", "Read · Execute"],
  ["Debugger", "Read · Execute"],
  ["Code Reviewer", "Read only"],
] as const;

function Dashboard() {
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
  const [audit, setAudit] = useState<RepositoryAudit | null>(null);
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Terminal className="size-5 text-primary" />
            <h1 className="text-sm font-semibold tracking-tight sm:text-base">My AI Dev Team</h1>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.62rem] text-muted-foreground">
              PHASE 5
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={repo ? "ok" : "idle"}>
              {repo ? "repo connected" : "repo offline"}
            </StatusPill>
            <StatusPill tone={audit ? "ok" : "idle"}>
              {audit ? `inspected ${audit.commitSha.slice(0, 7)}` : "not inspected"}
            </StatusPill>
            <StatusPill tone={providerReady ? "ok" : "idle"}>
              {providerReady ? "provider ready" : "provider idle"}
            </StatusPill>
          </div>

        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className="panel p-4 sm:p-6">
          <span className="label-caps">Current project</span>
          {repo ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Repository" value={repo.fullName} />
              <Field label="Branch" value={repo.branch} />
              <Field
                label="Access"
                value={repo.writeAccess ? "read + write" : "read only"}
                tone={repo.writeAccess ? "ok" : "warn"}
              />
              <Field label="Visibility" value={repo.private ? "private" : "public"} />
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="label-caps">Last commit</span>
                <div className="mt-1 flex items-start gap-2 font-mono text-xs break-words text-muted-foreground">
                  <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    {repo.lastCommit?.sha} · {repo.lastCommit?.message} —{" "}
                    {repo.lastCommit?.author}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No projects connected yet. Connect a repository below to begin.
            </p>
          )}
        </section>

        <ConnectRepository
          config={repoConfig}
          onConfigChange={setRepoConfig}
          result={repoResult}
          onResult={(r) => {
            setRepoResult(r);
            setAudit(null);
            setPlan(null);
            setChangeSet(null);
            setPlan(null);
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
          onPlan={(p) => {
            setPlan(p);
            setChangeSet(null);
          }}
        />

        <CoderPanel
          plan={plan}
          provider={providerConfig}
          changeSet={changeSet}
          onChangeSet={setChangeSet}
        />

        <GitPanel changeSet={changeSet} />

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel p-4 sm:p-6">
            <header className="flex items-center gap-2.5">
              <Users className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Agent team</h2>
            </header>
            <p className="mt-2 text-sm text-muted-foreground">
              The Architect plans from the real audit and the Coder implements approved steps
              against the real files. Only the Git Manager writes to GitHub, and only on a new
              branch after you approve the diff. No agent activity is simulated here.
            </p>

            <ul className="mt-4 divide-y divide-border">
              {AGENTS.map(([name, perms]) => (
                <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">{name}</span>
                  <span className="font-mono text-[0.68rem] text-muted-foreground">{perms}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-5">
            <section className="panel p-4 sm:p-6">
              <header className="flex items-center gap-2.5">
                <ListTodo className="size-4 text-primary" />
                <h2 className="text-base font-semibold">Current task</h2>
              </header>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan
                  ? `Plan ${plan.taskId} — ${plan.steps.length} steps proposed for "${plan.request}". ${changeSet ? ` Coder staged ${changeSet.totals.files} file(s): +${changeSet.totals.additions}/-${changeSet.totals.deletions}, staged.` : " Planning only; no code written yet."}`
                  : "No active task. Generate an Architect plan above, then implement it as a staged diff."}
              </p>
            </section>

            <section className="panel p-4 sm:p-6">
              <header className="flex items-center gap-2.5">
                <Lock className="size-4 text-primary" />
                <h2 className="text-base font-semibold">Credential security</h2>
              </header>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>GitHub token and provider keys are stored as server-side secrets.</li>
                <li>Secrets are read only inside server handlers, never sent to the browser.</li>
                <li>No credentials in localStorage, logs, agent prompts or model requests.</li>
                <li>Provider errors are redacted before being shown.</li>
              </ul>
            </section>
          </div>
        </div>

        <section className="panel p-4 sm:p-6">
          <span className="label-caps">Roadmap</span>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Phase 1", "Secure connection layer", true],
              ["Phase 2", "Repository inspection", true],
              ["Phase 3", "Architect agent (planning)", true],
              ["Phase 4", "Coder agent (controlled diffs)", true],
              ["Phase 5", "Git manager (branch, commit, PR)", true],
              ["Phase 6+", "Multi-agent orchestration & sandbox testing", false],
            ].map(([phase, label, done]) => (
              <li key={phase as string} className="flex items-center gap-2.5">
                <StatusPill tone={done ? "ok" : "idle"}>{done ? "done" : "planned"}</StatusPill>
                <span className="text-muted-foreground">
                  <span className="text-foreground">{phase as string}</span> — {label as string}
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

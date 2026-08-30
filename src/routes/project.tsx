import { createFileRoute, Link } from "@tanstack/react-router";
import { GitCommitHorizontal, MonitorPlay } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InspectionPanel } from "@/components/InspectionPanel";
import { RepositoryAuditView } from "@/components/RepositoryAuditView";
import { ProjectStateView } from "@/components/ProjectStateView";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/project")({
  head: () => ({
    meta: [
      { title: "المشروع — فريق التطوير الذكي" },
      {
        name: "description",
        content: "حقائق مستودعك الحقيقية: التقنيات، نقاط الدخول، خريطة الـ API وعدد الملفات.",
      },
      { property: "og:title", content: "المشروع — فريق التطوير الذكي" },
      {
        property: "og:description",
        content: "تقرير فحص حقيقي لمستودع GitHub الخاص بك، بدون أي بيانات وهمية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { repoConfig, repoResult, audit, setAudit, setSettingsOpen } = useWorkspace();
  const repo = repoResult?.ok ? repoResult.repository : undefined;

  return (
    <AppShell>
      <section className="panel p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">المشروع الحالي</h2>
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MonitorPlay className="size-4" />
            Open Workspace
          </Link>
        </div>
        {repo ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="المستودع" value={repo.fullName} />
            <Field label="الفرع" value={repo.branch} />
            <Field
              label="الصلاحية"
              value={repo.writeAccess ? "قراءة + كتابة" : "قراءة فقط"}
              tone={repo.writeAccess ? "ok" : "warn"}
            />
            <Field label="الظهور" value={repo.private ? "خاص" : "عام"} />
            {repo.lastCommit && (
              <div className="sm:col-span-2 lg:col-span-4">
                <span className="label-caps">آخر تعديل</span>
                <div className="mt-1 flex items-start gap-2 font-mono text-xs break-words text-muted-foreground">
                  <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span dir="ltr">
                    {repo.lastCommit.sha} · {repo.lastCommit.message} — {repo.lastCommit.author}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              ما كاين حتى مستودع متصل. حل الإعدادات ودخّل الرابط والتوكن.
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="mt-3 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
            >
              فتح الإعدادات
            </button>
          </div>
        )}
      </section>

      <ProjectStateView />

      <InspectionPanel
        repoUrl={repoConfig.repoUrl}
        branch={repoConfig.branch}
        connected={Boolean(repo)}
        audit={audit}
        onAudit={setAudit}
      />

      {audit && <RepositoryAuditView audit={audit} />}
    </AppShell>
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

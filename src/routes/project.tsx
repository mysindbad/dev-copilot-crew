import { createFileRoute } from "@tanstack/react-router";
import { GitCommitHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InspectionPanel } from "@/components/InspectionPanel";
import { RepositoryAuditView } from "@/components/RepositoryAuditView";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/project")({
  head: () => ({
    meta: [
      { title: "المشروع — فريق التطوير الذكي" },
      {
        name: "description",
        content: "حالة المستودع المتصل: الفرع، آخر تعديل، التقنيات، نقاط الدخول وخريطة الـ APIs.",
      },
      { property: "og:title", content: "المشروع — فريق التطوير الذكي" },
      {
        property: "og:description",
        content: "تقرير حقيقي عن مستودعك على GitHub: تقنيات، ملفات، ومسارات API.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const ws = useWorkspace();
  const repo = ws.repoResult?.ok ? ws.repoResult.repository : undefined;

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="panel p-4 sm:p-6">
          <span className="label-caps">المشروع الحالي</span>
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
                    <span>
                      {repo.lastCommit.sha} · {repo.lastCommit.message} — {repo.lastCommit.author}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              ما كاين حتى مستودع متصل. حل الإعدادات فوق ودخّل رابط المستودع.
            </p>
          )}
        </section>

        <InspectionPanel
          repoUrl={ws.repoConfig.repoUrl}
          branch={ws.repoConfig.branch}
          connected={Boolean(repo)}
          audit={ws.audit}
          onAudit={ws.setAudit}
        />

        {ws.audit && <RepositoryAuditView audit={ws.audit} />}
      </div>
    </AppShell>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
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

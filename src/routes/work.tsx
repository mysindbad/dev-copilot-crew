import { createFileRoute } from "@tanstack/react-router";
import {
  ClipboardList,
  FileDiff,
  ShieldCheck,
  GitPullRequest,
  Loader2,
  Rocket,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { useWorkspace } from "@/lib/workspace";
import { arabize } from "@/lib/ar";

export const Route = createFileRoute("/work")({
  head: () => ({
    meta: [
      { title: "العمل — فريق التطوير الذكي" },
      {
        name: "description",
        content: "خطة المهندس، تعديلات المبرمج، نتيجة المراجعة، والفرع و Pull Request على GitHub.",
      },
      { property: "og:title", content: "العمل — فريق التطوير الذكي" },
      {
        property: "og:description",
        content: "تتبّع خطوة بخطوة: التخطيط، الكود، المراجعة، ثم الإرسال إلى GitHub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkPage,
});

const PHASES: { key: string; label: string }[] = [
  { key: "inspect", label: "فحص المستودع" },
  { key: "plan", label: "الخطة" },
  { key: "code", label: "كتابة الكود" },
  { key: "review", label: "المراجعة" },
  { key: "git", label: "الإرسال إلى GitHub" },
];

function WorkPage() {
  const ws = useWorkspace();
  const { plan, changeSet, review, gitResult, pipeline } = ws;

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="panel p-4 sm:p-5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Rocket className="size-4 text-primary" />
              <h2 className="text-base font-semibold">مسار الخدمة</h2>
            </div>
            {pipeline.running && (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                الفريق كيخدم
              </span>
            )}
          </header>
          <ol className="mt-3 flex flex-wrap gap-2">
            {PHASES.map((p) => {
              const active = pipeline.phase === p.key;
              const done =
                (p.key === "inspect" && ws.audit) ||
                (p.key === "plan" && plan) ||
                (p.key === "code" && changeSet) ||
                (p.key === "review" && review) ||
                (p.key === "git" && gitResult?.ok);
              return (
                <li key={p.key}>
                  <StatusPill tone={active ? "warn" : done ? "ok" : "idle"}>{p.label}</StatusPill>
                </li>
              );
            })}
          </ol>
          {pipeline.phase === "failed" && (
            <p className="mt-3 text-sm text-destructive">{pipeline.note}</p>
          )}
          {!plan && !pipeline.running && (
            <p className="mt-3 text-sm text-muted-foreground">
              ما كاينش شي خدمة دابا. سير لصفحة «المحادثة»، ناقش الفكرة مع المدير، وقول لو «عطيها
              للفريق».
            </p>
          )}
        </section>

        {plan && (
          <section className="panel p-4 sm:p-6">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <ClipboardList className="size-4 text-primary" />
                <h2 className="text-base font-semibold">خطة المهندس المعماري</h2>
              </div>
              <span className="font-mono text-[0.68rem] text-muted-foreground">{plan.model}</span>
            </header>
            <p className="mt-2 text-sm leading-7">{plan.summary}</p>
            {plan.approach && (
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{plan.approach}</p>
            )}
            <ol className="mt-4 space-y-2">
              {plan.steps.map((s) => (
                <li key={s.order} className="rounded-md border border-border bg-surface/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {s.order}. {s.title}
                    </span>
                    <StatusPill tone={s.risk === "HIGH" ? "fail" : s.risk === "MEDIUM" ? "warn" : "ok"}>
                      {arabize(s.risk)}
                    </StatusPill>
                  </div>
                  {s.detail && (
                    <p className="mt-1 text-[0.82rem] leading-6 text-muted-foreground">{s.detail}</p>
                  )}
                  {s.files.length > 0 && (
                    <p className="mt-1 font-mono text-[0.68rem] break-words text-muted-foreground">
                      {s.files.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {changeSet && (
          <section className="panel p-4 sm:p-6">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <FileDiff className="size-4 text-primary" />
                <h2 className="text-base font-semibold">تعديلات المبرمج</h2>
              </div>
              <span className="font-mono text-[0.68rem] text-muted-foreground">
                {changeSet.totals.files} ملف · +{changeSet.totals.additions} / -
                {changeSet.totals.deletions}
              </span>
            </header>
            <div className="mt-4 space-y-3">
              {changeSet.files.map((f) => (
                <div key={f.path} className="rounded-md border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <span className="font-mono text-xs break-all">{f.path}</span>
                    <StatusPill tone={f.action === "DELETE" ? "fail" : "ok"}>
                      {arabize(f.action)}
                    </StatusPill>
                  </div>
                  <pre className="max-h-72 overflow-auto px-3 py-2 text-left font-mono text-[0.68rem] leading-5" dir="ltr">
                    {f.diff.map((l, i) => (
                      <div
                        key={i}
                        className={
                          l.kind === "add"
                            ? "text-success"
                            : l.kind === "del"
                              ? "text-destructive"
                              : l.kind === "hunk"
                                ? "text-primary"
                                : "text-muted-foreground"
                        }
                      >
                        {l.text}
                      </div>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        )}

        {review && (
          <section className="panel p-4 sm:p-6">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-primary" />
                <h2 className="text-base font-semibold">مجلس المراجعة</h2>
              </div>
              <StatusPill tone={review.gate === "APPROVED" ? "ok" : "warn"}>
                {arabize(review.gate)}
              </StatusPill>
            </header>
            <div className="mt-4 space-y-3">
              {review.reports.map((r) => (
                <div key={r.reviewer} className="rounded-md border border-border bg-surface/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {r.reviewer === "code"
                        ? "مراجع الكود"
                        : r.reviewer === "security"
                          ? "مراجع الأمان"
                          : "مسؤول الجودة"}
                    </span>
                    <div className="flex items-center gap-2">
                      {r.model && (
                        <span className="font-mono text-[0.66rem] text-muted-foreground">
                          {r.model}
                        </span>
                      )}
                      <StatusPill tone={r.verdict === "APPROVE" ? "ok" : "warn"}>
                        {arabize(r.verdict)}
                      </StatusPill>
                    </div>
                  </div>
                  {r.summary && <p className="mt-1.5 text-[0.82rem] leading-6">{r.summary}</p>}
                  {r.findings.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {r.findings.map((f, i) => (
                        <li key={i} className="rounded-md border border-border p-2 text-[0.8rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill
                              tone={
                                f.severity === "BLOCKER"
                                  ? "fail"
                                  : f.severity === "MAJOR"
                                    ? "warn"
                                    : "idle"
                              }
                            >
                              {arabize(f.severity)}
                            </StatusPill>
                            <span className="font-mono text-[0.68rem] break-all">{f.path}</span>
                          </div>
                          <p className="mt-1 font-medium">{f.title}</p>
                          <p className="text-muted-foreground">{f.detail}</p>
                          {f.suggestion && (
                            <p className="mt-1 text-success">الاقتراح: {f.suggestion}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {gitResult && (
          <section className="panel p-4 sm:p-6">
            <header className="flex items-center gap-2.5">
              <GitPullRequest className="size-4 text-primary" />
              <h2 className="text-base font-semibold">مدير Git</h2>
            </header>
            {gitResult.report ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  الفرع الجديد:{" "}
                  <a
                    className="font-mono text-primary underline"
                    href={gitResult.report.branchUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {gitResult.report.branch}
                  </a>
                </p>
                {gitResult.report.pullRequest && (
                  <p>
                    Pull Request:{" "}
                    <a
                      className="text-primary underline"
                      href={gitResult.report.pullRequest.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{gitResult.report.pullRequest.number}
                    </a>
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-destructive">{arabize(gitResult.error ?? "")}</p>
            )}
            <ul className="mt-3 space-y-1.5">
              {gitResult.checks.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-[0.8rem]">
                  <StatusPill tone={c.state === "pass" ? "ok" : c.state === "fail" ? "fail" : "warn"}>
                    {arabize(c.state)}
                  </StatusPill>
                  <span>{arabize(c.label)}</span>
                  <span className="text-muted-foreground">{arabize(c.detail)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

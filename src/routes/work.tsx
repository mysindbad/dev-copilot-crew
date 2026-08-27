import { createFileRoute } from "@tanstack/react-router";
import { FileCode2, ShieldCheck, GitPullRequest, ListChecks } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useWorkspace } from "@/lib/workspace";
import { arabize } from "@/lib/ar";

export const Route = createFileRoute("/work")({
  head: () => ({
    meta: [
      { title: "العمل — فريق التطوير الذكي" },
      {
        name: "description",
        content: "خطة المهندس، الملفات المعدّلة، نتيجة المراجعة، والفرع أو طلب الدمج على GitHub.",
      },
      { property: "og:title", content: "العمل — فريق التطوير الذكي" },
      {
        property: "og:description",
        content: "تابع خطة العمل والتعديلات والمراجعة وطلب الدمج في مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkPage,
});

const SEVERITY: Record<string, string> = {
  BLOCKER: "مانع",
  MAJOR: "خطير",
  MINOR: "بسيط",
  INFO: "معلومة",
};

function WorkPage() {
  const { plan, changeSet, review, gitResult } = useWorkspace();

  if (!plan && !changeSet && !review && !gitResult) {
    return (
      <AppShell>
        <section className="panel p-6">
          <h2 className="text-base font-semibold">ما كاين حتى خدمة دابا</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            سير لصفحة «المحادثة»، ناقش الفكرة مع مدير المشروع، ومن بعد قول ليه «عطيها للمهندس».
            كلشي اللي غادي يخدمو الفريق غادي يبان هنا.
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {plan && (
        <section className="panel p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 text-primary" />
            <h2 className="text-base font-semibold">خطة المهندس المعماري</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{plan.summary}</p>
          <p className="mt-1 text-sm text-muted-foreground">{plan.approach}</p>
          <ol className="mt-3 space-y-2">
            {plan.steps.map((s) => (
              <li key={s.order} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="text-primary">{s.order}.</span>
                  {s.title}
                  <span className="rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">
                    {arabize(s.agent)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
                {s.files.length > 0 && (
                  <div className="mt-1 font-mono text-xs break-words text-muted-foreground" dir="ltr">
                    {s.files.join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {plan.openQuestions.length > 0 && (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="font-medium">أسئلة مفتوحة</div>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {plan.openQuestions.map((q, i) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {changeSet && (
        <section className="panel p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-4 text-primary" />
            <h2 className="text-base font-semibold">التعديلات الجاهزة</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {changeSet.files.length} ملف · على أساس التعديل{" "}
            <span className="font-mono" dir="ltr">
              {changeSet.baseCommitSha.slice(0, 7)}
            </span>
          </p>
          <div className="mt-3 space-y-3">
            {changeSet.files.map((f) => (
              <details key={f.path} className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  <span className="font-mono text-xs" dir="ltr">
                    {f.path}
                  </span>{" "}
                  <span className="text-muted-foreground">— {arabize(f.action)}</span>
                </summary>
                <pre
                  dir="ltr"
                  className="max-h-80 overflow-auto border-t border-border bg-background/60 p-3 text-left font-mono text-xs leading-relaxed"
                >
                  {f.diff}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}

      {review && (
        <section className="panel p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-base font-semibold">مجلس المراجعة</h2>
          </div>
          <p
            className={
              "mt-2 text-sm font-medium " +
              (review.gate === "APPROVED" ? "text-success" : "text-warning")
            }
          >
            {review.gate === "APPROVED" ? "موافق — يمكن الإرسال" : "مطلوب تعديلات قبل الإرسال"}
          </p>
          <div className="mt-3 space-y-3">
            {review.reviews.map((r) => (
              <div key={r.role} className="rounded-md border border-border p-3">
                <div className="text-sm font-medium">{arabize(r.role)}</div>
                <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>
                <ul className="mt-2 space-y-1.5">
                  {r.findings.map((f, i) => (
                    <li key={i} className="text-sm">
                      <span className="rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">
                        {SEVERITY[f.severity] ?? f.severity}
                      </span>{" "}
                      {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {gitResult && (
        <section className="panel p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <GitPullRequest className="size-4 text-primary" />
            <h2 className="text-base font-semibold">GitHub</h2>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {gitResult.steps.map((s, i) => (
              <li key={i} className={s.ok ? "text-foreground" : "text-destructive"}>
                {s.ok ? "✓" : "✗"} {arabize(s.label)} — {arabize(s.detail)}
              </li>
            ))}
          </ul>
          {gitResult.pullRequestUrl && (
            <a
              href={gitResult.pullRequestUrl}
              target="_blank"
              rel="noreferrer"
              dir="ltr"
              className="mt-3 inline-block font-mono text-xs text-primary hover:underline"
            >
              {gitResult.pullRequestUrl}
            </a>
          )}
        </section>
      )}
    </AppShell>
  );
}

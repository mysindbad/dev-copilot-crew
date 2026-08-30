import { useEffect, useRef, useState } from "react";
import { Database, RefreshCw, Loader2, CheckCircle2, TriangleAlert, CircleSlash } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { arabize } from "@/lib/ar";

/**
 * Shows the project state recovered from `.ai-dev-hub/` in the repository and
 * lets the human trigger a fresh recovery. The persisted state is a checkpoint,
 * not an authority — inconsistencies with the live repository are shown plainly.
 */
export function ProjectStateView() {
  const { recoveredState, bootstrapState, repoConfig } = useWorkspace();
  const [busy, setBusy] = useState(false);

  if (!repoConfig.repoUrl.trim()) return null;

  const r = recoveredState;
  const state = r?.recovered.state ?? null;
  const task = r?.recovered.task ?? null;

  async function recover() {
    setBusy(true);
    try {
      await bootstrapState();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h2 className="text-base font-semibold">حالة المشروع المحفوظة</h2>
        </div>
        <button
          type="button"
          onClick={recover}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          استعادة الحالة
        </button>
      </header>

      {!r && (
        <p className="mt-3 text-sm text-muted-foreground">
          اضغط «استعادة الحالة» لقراءة حالة المشروع من مجلد <code className="font-mono" dir="ltr">.ai-dev-hub/</code> داخل المستودع.
        </p>
      )}

      {r && !state && (
        <p className="mt-3 text-sm text-muted-foreground">
          لا توجد حالة سابقة محفوظة في هذا المستودع. سيُنشأ مجلد <code className="font-mono" dir="ltr">.ai-dev-hub/</code> تلقائيًا عند أول نقطة مرجع بعد كل مرحلة مهمة.
        </p>
      )}

      {r && state && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {r.consistent ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-success">
                <CheckCircle2 className="size-3.5" /> متسق · v{state.stateVersion}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-warning">
                <TriangleAlert className="size-3.5" /> غير متسق · v{state.stateVersion}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground" dir="ltr">
              <CircleSlash className="size-3.5" /> {state.repository.lastCommitSha.slice(0, 7)}
            </span>
            <span className="text-xs text-muted-foreground">
              آخر تحديث: {new Date(state.updatedAt).toLocaleString("ar-MA")}
            </span>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="المرحلة الحالية" value={arabize(state.phase)} />
            <Field label="المراحل المنجزة" value={state.completedPhases.map(arabize).join("، ") || "—"} />
            <Field label="المزوّدون المُعدّون" value={state.configuredProviders.join("، ") || "—"} />
            <Field label="النموذج الافتراضي" value={state.defaultModel || "—"} mono />
            <Field label="آخر عملية ناجحة" value={state.lastSuccessfulOperation || "—"} />
            <Field label="آخر عملية فاشلة" value={state.lastFailedOperation || "—"} />
          </div>

          {task && (
            <div className="mt-3 rounded-md border border-border p-3">
              <div className="text-sm font-medium">المهمة الحالية</div>
              <p className="mt-1 text-sm text-muted-foreground">{task.task || "—"}</p>
              <div className="mt-1 text-xs text-muted-foreground">
                الحالة: {arabize(task.status)} · الإجراء التالي: {task.nextAction || "—"}
              </div>
            </div>
          )}

          {state.recommendedNextAction && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="label-caps">الإجراء الموصى به</span>
              <p className="mt-1">{state.recommendedNextAction}</p>
            </div>
          )}

          {!r.consistent && (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="font-medium">تناقضات مع المستودع الحقيقي</div>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {r.inconsistencies.map((inc, i) => (
                  <li key={i}>• {inc}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                الكود الفعلي وتاريخ Git هما المرجع. أعد فحص المستودع لتصحيح الحالة المحفوظة.
              </p>
            </div>
          )}

          <details className="mt-3 rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">progress.md</summary>
            <pre className="border-t border-border bg-background/60 p-3 text-xs leading-relaxed whitespace-pre-wrap" dir="ltr">
              {r.recovered.progressMd ?? "—"}
            </pre>
          </details>
          <details className="mt-2 rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">architecture.md</summary>
            <pre className="border-t border-border bg-background/60 p-3 text-xs leading-relaxed whitespace-pre-wrap" dir="ltr">
              {r.recovered.architectureMd ?? "—"}
            </pre>
          </details>
          <details className="mt-2 rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">decisions.md</summary>
            <pre className="border-t border-border bg-background/60 p-3 text-xs leading-relaxed whitespace-pre-wrap" dir="ltr">
              {r.recovered.decisionsMd ?? "—"}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div className={"mt-1 text-sm break-words " + (mono ? "font-mono" : "")}>{value}</div>
    </div>
  );
}

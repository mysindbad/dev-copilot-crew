import type { RepositoryAudit } from "@/lib/inspection.types";
import { arabize } from "@/lib/ar";
import { StatusPill } from "./StatusPill";

function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label-caps">{title}</span>
        {note && <span className="font-mono text-[0.68rem] text-muted-foreground">{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Detection({ label, value, evidence }: { label: string; value: string; evidence: string[] }) {
  const unknown = value === "UNKNOWN";
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div className={"mt-1 font-mono text-sm " + (unknown ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </div>
      {evidence.length > 0 && (
        <div className="mt-1 font-mono text-[0.68rem] break-words text-muted-foreground">
          evidence: {evidence.join(" · ")}
        </div>
      )}
    </div>
  );
}

const healthTone = { GOOD: "ok", PARTIAL: "warn", WEAK: "fail", UNKNOWN: "idle" } as const;

export function RepositoryAuditView({ audit }: { audit: RepositoryAudit }) {
  return (
    <div className="space-y-5">
      <section className="panel p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="label-caps">نظرة عامة على المستودع</span>
            <h2 className="mt-1 font-mono text-lg break-words">{audit.repository}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="ok">تم الفحص</StatusPill>
            <StatusPill tone={audit.private ? "warn" : "idle"}>
              {audit.private ? "خاص" : "عام"}
            </StatusPill>
            {audit.largeRepository && <StatusPill tone="warn">مستودع كبير</StatusPill>}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detection label="الفرع" value={audit.branch} evidence={[]} />
          <Detection label="النسخة المفحوصة" value={audit.commitSha.slice(0, 12)} evidence={[]} />
          <Detection
            label="عدد الملفات"
            value={`${audit.counts.inspectedFiles} read / ${audit.counts.totalFiles} total`}
            evidence={[]}
          />
          <Detection
            label="وقت الفحص"
            value={new Date(audit.inspectedAt).toLocaleString()}
            evidence={[]}
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <span className="label-caps">رسالة آخر تعديل</span>
            <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
              {audit.commitMessage || "غير معروف"}
            </p>
          </div>
        </div>
        {audit.largeRepository && (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Repository is large. Inspecting the most relevant files first.
          </p>
        )}
      </section>

      <Section title="التقنيات" note={audit.stack.languages.join(" · ")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detection label="الواجهة" {...audit.stack.frontend} />
          <Detection label="الخادم" {...audit.stack.backend} />
          <Detection label="قاعدة البيانات" {...audit.stack.database} />
          <Detection label="النشر" {...audit.stack.deployment} />
          <Detection label="مدير الحزم" {...audit.stack.packageManager} />
          <Detection label="أمر البناء" value={audit.buildCommand} evidence={[]} />
          <Detection label="أمر التطوير" value={audit.devCommand} evidence={[]} />
        </div>
      </Section>

      <Section title="البنية">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {audit.architecture.map((a) => (
            <li key={a}>· {a}</li>
          ))}
        </ul>
        {audit.dataFlow.length > 0 ? (
          <div className="mt-4 space-y-3">
            {audit.dataFlow.map((flow) => (
              <div key={flow.title}>
                <span className="label-caps">{flow.title}</span>
                <div className="mt-1.5 space-y-1">
                  {flow.steps.map((s, i) => (
                    <div key={s.label} className="font-mono text-xs break-words">
                      <span className="text-primary">{i > 0 ? "↓ " : ""}</span>
                      <span className="text-foreground">{s.label}</span>
                      <span className="text-muted-foreground"> — {s.files.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Data flow: UNKNOWN — no supporting code found in the inspected files.
          </p>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="نقاط الدخول" note={`${audit.entryPoints.length} نقطة`}>
          {audit.entryPoints.length ? (
            <ul className="divide-y divide-border">
              {audit.entryPoints.map((e) => (
                <li key={e.path} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="font-mono text-xs break-all">{e.path}</span>
                  <span className="font-mono text-[0.68rem] text-muted-foreground">{e.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">غير معروف</p>
          )}
        </Section>

        <Section title="ملفات مهمة" note={`${audit.importantFiles.length} ملف مقروء`}>
          <ol className="divide-y divide-border">
            {audit.importantFiles.map((f, i) => (
              <li key={f.path} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="font-mono text-xs break-all">
                  <span className="text-muted-foreground">{i + 1}. </span>
                  {f.path}
                </span>
                <span className="font-mono text-[0.68rem] text-muted-foreground">{f.category}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="مجلدات مهمة">
          <ul className="divide-y divide-border">
            {audit.directories.map((d) => (
              <li key={d.path} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="font-mono text-xs">{d.path}</span>
                <span className="font-mono text-[0.68rem] text-muted-foreground">
                  {d.files} files · {d.role}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="الاختبارات" note={audit.tests.hasTests ? "كاينة اختبارات" : "ما كاين حتى اختبار"}>
          <div className="space-y-2 text-sm">
            <div className="font-mono text-xs text-muted-foreground">
              الأدوات: {audit.tests.frameworks.join("، ") || "غير معروف"}
            </div>
            {audit.tests.commands.length > 0 && (
              <ul className="divide-y divide-border">
                {audit.tests.commands.map((c) => (
                  <li key={c.name} className="py-1.5 font-mono text-xs break-words">
                    <span className="text-primary">{c.name}</span>
                    <span className="text-muted-foreground"> — {c.command}</span>
                  </li>
                ))}
              </ul>
            )}
            {audit.tests.testFiles.length > 0 && (
              <div className="font-mono text-[0.68rem] break-all text-muted-foreground">
                {audit.tests.testFiles.join(" · ")}
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title="واجهات API" note={`${audit.apiMap.length} مسار`}>
        {audit.apiMap.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">الطريقة</th>
                  <th className="py-1.5 pr-3 font-medium">المسار</th>
                  <th className="py-1.5 pr-3 font-medium">الملف</th>
                  <th className="py-1.5 pr-3 font-medium">المصادقة</th>
                  <th className="py-1.5 font-medium">اعتمادات خارجية</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {audit.apiMap.map((e, i) => (
                  <tr key={`${e.method}-${e.path}-${i}`} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 text-primary">{e.method}</td>
                    <td className="py-1.5 pr-3 break-all">{e.path}</td>
                    <td className="py-1.5 pr-3 break-all text-muted-foreground">{e.file}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{e.authentication}</td>
                    <td className="py-1.5 break-all text-muted-foreground">
                      {e.externalDependencies.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            ما تلقاوش شي مسارات API فالملفات المفحوصة.
          </p>
        )}
      </Section>

      <Section title="متغيرات البيئة" note="الأسماء فقط — ما كنقراو حتى قيمة">
        {audit.envReferences.length ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {audit.envReferences.map((e) => (
              <li key={e.name} className="font-mono text-xs break-all">
                <span className="text-accent">{e.name}</span>
                <span className="text-muted-foreground"> → {e.referencedBy.join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            ما تلقاوش شي متغيرات بيئة فالملفات المفحوصة.
          </p>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="صحة المشروع">
          <ul className="space-y-2">
            {audit.health.map((h) => (
              <li key={h.category} className="flex flex-wrap items-start gap-2">
                <StatusPill tone={healthTone[h.status]}>{arabize(h.status)}</StatusPill>
                <div className="min-w-0">
                  <div className="text-sm">{h.category}</div>
                  <div className="font-mono text-[0.68rem] break-words text-muted-foreground">
                    {h.evidence}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="space-y-5">
          <Section title="المخاطر المعروفة">
            {audit.risks.length ? (
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {audit.risks.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                ما كاين حتى خطر مستنتج من الأدلة المتوفرة.
              </p>
            )}
          </Section>
          <Section title="أمور غير معروفة">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {audit.unknowns.map((u) => (
                <li key={u}>· {u}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

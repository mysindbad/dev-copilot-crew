import { Link } from "@tanstack/react-router";
import { Terminal, Settings, Languages } from "lucide-react";
import type { ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";
import { StatusPill } from "./StatusPill";
import { SettingsDrawer } from "./SettingsDrawer";

const NAV = [
  { to: "/", label: "المحادثة" },
  { to: "/project", label: "المشروع" },
  { to: "/work", label: "العمل" },
] as const;

/** Shared header, page navigation and settings drawer. */
export function AppShell({ children }: { children: ReactNode }) {
  const { setSettingsOpen, repoResult, audit, pipeline, review } = useWorkspace();
  const { toggle, lang } = useI18n();
  const repo = repoResult?.ok ? repoResult.repository : undefined;

  const phaseLabel: Record<string, string> = {
    idle: "فالانتظار",
    inspect: "كيفحص المشروع",
    plan: "كيخطط",
    code: "كيكتب الكود",
    review: "كيراجع",
    git: "كيرسل لـ GitHub",
    done: "سالا",
    failed: "وقف",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Terminal className="size-5 text-primary" />
            <h1 className="text-sm font-semibold sm:text-base">فريق التطوير الذكي</h1>
          </div>

          <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="flex-1 rounded-md px-3 py-1.5 text-center text-sm text-muted-foreground transition-colors hover:bg-secondary/60 sm:flex-none [&.active]:bg-secondary [&.active]:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <StatusPill tone={repo ? "ok" : "idle"}>
              {repo ? "المستودع متصل" : "بلا مستودع"}
            </StatusPill>
            <StatusPill tone={pipeline.running ? "warn" : audit ? "ok" : "idle"}>
              {pipeline.running
                ? phaseLabel[pipeline.phase]
                : review
                  ? review.gate === "APPROVED"
                    ? "المراجعة موافقة"
                    : "مطلوب تعديلات"
                  : audit
                    ? "تم الفحص"
                    : "ما تفحصش"}
            </StatusPill>
            <button
              onClick={toggle}
              className="rounded-md border border-border p-1.5 text-xs hover:bg-secondary/60"
              aria-label="تبديل اللغة"
              title={lang === "ar" ? "English" : "العربية"}
            >
              <Languages className="size-4 text-primary" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-md border border-border p-1.5 hover:bg-secondary/60"
              aria-label="الإعدادات"
              title="الإعدادات"
            >
              <Settings className="size-4 text-primary" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">{children}</main>
      <SettingsDrawer />
    </div>
  );
}

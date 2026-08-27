import { Link } from "@tanstack/react-router";
import { Terminal, Settings2, Languages, MessageSquare, FolderGit2, Hammer } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/lib/workspace";
import { SettingsDrawer } from "./SettingsDrawer";
import { StatusPill } from "./StatusPill";

const NAV = [
  { to: "/", label: "المحادثة", icon: MessageSquare },
  { to: "/project", label: "المشروع", icon: FolderGit2 },
  { to: "/work", label: "العمل", icon: Hammer },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { toggle } = useI18n();
  const ws = useWorkspace();
  const repo = ws.repoResult?.ok ? ws.repoResult.repository : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Terminal className="size-5 text-primary" />
            <h1 className="text-sm font-semibold tracking-tight sm:text-base">فريق التطوير الذكي</h1>
          </div>

          <nav className="order-3 flex w-full gap-1.5 sm:order-none sm:w-auto">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/50 sm:flex-none"
                activeProps={{
                  className:
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-sm font-medium text-foreground sm:flex-none",
                }}
                activeOptions={{ exact: to === "/" }}
              >
                <Icon className="size-3.5" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <StatusPill tone={repo ? "ok" : "idle"}>
              {repo ? "المستودع متصل" : "غير متصل"}
            </StatusPill>
            <button
              type="button"
              onClick={toggle}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="تبديل اللغة"
              title="العربية / English"
            >
              <Languages className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => ws.setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/60"
              aria-label="الإعدادات"
            >
              <Settings2 className="size-4 text-primary" />
              الإعدادات
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      <SettingsDrawer />
    </div>
  );
}

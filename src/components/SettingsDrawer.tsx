import { X, Settings2 } from "lucide-react";
import { useEffect } from "react";
import { ConnectRepository } from "./ConnectRepository";
import { SecretsPanel } from "./SecretsPanel";
import { ProviderPanel } from "./ProviderPanel";
import { useWorkspace } from "@/lib/workspace";

/**
 * Right-side settings drawer: repository link, GitHub token, provider keys and
 * the AI provider choice. Everything the human must supply lives here, so the
 * working screens stay clean.
 */
export function SettingsDrawer() {
  const ws = useWorkspace();
  const open = ws.settingsOpen;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ws.setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, ws]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="إغلاق"
        onClick={() => ws.setSettingsOpen(false)}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      <aside className="absolute inset-y-0 start-0 flex w-full max-w-xl flex-col border-e border-border bg-background shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Settings2 className="size-4 text-primary" />
            <h2 className="text-base font-semibold">الإعدادات</h2>
          </div>
          <button
            onClick={() => ws.setSettingsOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <ConnectRepository
            config={ws.repoConfig}
            onConfigChange={ws.setRepoConfig}
            result={ws.repoResult}
            onResult={ws.setRepoResult}
            tokenConfigured={ws.keyStatus.github}
          />

          <SecretsPanel serverStatus={ws.serverSecrets} onChange={ws.refreshSecrets} />

          <ProviderPanel
            config={ws.providerConfig}
            onConfigChange={ws.setProviderConfig}
            secrets={{ gemini: ws.keyStatus.gemini, openrouter: ws.keyStatus.openrouter }}
            statuses={ws.providerStatuses}
            onStatus={ws.setProviderStatus}
          />
        </div>

        <footer className="border-t border-border p-4">
          <button
            onClick={() => ws.setSettingsOpen(false)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            موافق
          </button>
        </footer>
      </aside>
    </div>
  );
}

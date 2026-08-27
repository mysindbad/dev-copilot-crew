import { getUserSecrets } from "@/lib/user-secrets";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Cpu, Loader2, ShieldCheck } from "lucide-react";
import { testProvider, type ProviderStatus } from "@/lib/connection.functions";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export interface ProviderConfig {
  primaryProvider: "gemini" | "openrouter";
  primaryModel: string;
  fallbackProvider: "gemini" | "openrouter" | "none";
  fallbackModel: string;
  freeOnly: boolean;
}

export function ProviderPanel({
  config,
  onConfigChange,
  secrets,
  statuses,
  onStatus,
}: {
  config: ProviderConfig;
  onConfigChange: (c: ProviderConfig) => void;
  secrets: { gemini: boolean; openrouter: boolean };
  statuses: Partial<Record<"gemini" | "openrouter", ProviderStatus>>;
  onStatus: (s: ProviderStatus) => void;
}) {
  const { t } = useI18n();
  const run = useServerFn(testProvider);
  const [pending, setPending] = useState<string | null>(null);

  async function check(provider: "gemini" | "openrouter") {
    setPending(provider);
    try {
      onStatus(await run({ data: { provider, secrets: getUserSecrets() } }));
    } catch {
      onStatus({
        provider,
        configured: true,
        ok: false,
        detail: "AI provider unavailable — the check could not be completed.",
        models: [],
      });
    } finally {
      setPending(null);
    }
  }

  const providers: { id: "gemini" | "openrouter"; name: string; note: string }[] = [
    { id: "gemini", name: "Gemini", note: "Google Generative Language API" },
    { id: "openrouter", name: "OpenRouter", note: "Free-model routing supported" },
  ];

  const primaryModels = statuses[config.primaryProvider]?.models ?? [];
  const fallbackModels =
    config.fallbackProvider === "none" ? [] : (statuses[config.fallbackProvider]?.models ?? []);

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex items-center gap-2.5">
        <Cpu className="size-4 text-primary" />
        <h2 className="text-base font-semibold">{t("panel.providers.title")}</h2>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {providers.map((p) => {
          const configured = secrets[p.id];
          const st = statuses[p.id];
          return (
            <div key={p.id} className="rounded-md border border-border bg-surface/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="font-mono text-[0.68rem] text-muted-foreground">{p.note}</div>
                </div>
                <StatusPill tone={st?.ok ? "ok" : st ? "fail" : configured ? "warn" : "idle"}>
                  {st?.ok ? "verified" : st ? "error" : configured ? "untested" : "no key"}
                </StatusPill>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <ShieldCheck
                  className={cn("size-3.5", configured ? "text-success" : "text-muted-foreground")}
                />
                <span className="font-mono text-muted-foreground">
                  {configured ? "key stored server-side ••••••" : "key not configured"}
                </span>
              </div>
              <button
                onClick={() => check(p.id)}
                disabled={pending === p.id}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                {pending === p.id && <Loader2 className="size-3.5 animate-spin" />}
                Test provider
              </button>
              {st && (
                <p
                  className={cn(
                    "mt-2.5 font-mono text-[0.7rem] break-words",
                    st.ok ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  {st.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <label className="label-caps" htmlFor="primaryProvider">
            Primary provider
          </label>
          <select
            id="primaryProvider"
            value={config.primaryProvider}
            onChange={(e) =>
              onConfigChange({
                ...config,
                primaryProvider: e.target.value as ProviderConfig["primaryProvider"],
                primaryModel: "",
              })
            }
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="gemini">Gemini</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div>
          <label className="label-caps" htmlFor="primaryModel">
            Primary model
          </label>
          <select
            id="primaryModel"
            value={config.primaryModel}
            onChange={(e) => onConfigChange({ ...config, primaryModel: e.target.value })}
            disabled={primaryModels.length === 0}
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-ring disabled:opacity-50"
          >
            <option value="">
              {primaryModels.length ? "Select a model" : "Test the provider to load models"}
            </option>
            {primaryModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-caps" htmlFor="fallbackProvider">
            Fallback provider
          </label>
          <select
            id="fallbackProvider"
            value={config.fallbackProvider}
            onChange={(e) =>
              onConfigChange({
                ...config,
                fallbackProvider: e.target.value as ProviderConfig["fallbackProvider"],
                fallbackModel: "",
              })
            }
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="none">No fallback</option>
            <option value="gemini">Gemini</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div>
          <label className="label-caps" htmlFor="fallbackModel">
            Fallback model
          </label>
          <select
            id="fallbackModel"
            value={config.fallbackModel}
            onChange={(e) => onConfigChange({ ...config, fallbackModel: e.target.value })}
            disabled={fallbackModels.length === 0}
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-ring disabled:opacity-50"
          >
            <option value="">
              {fallbackModels.length ? "Select a model" : "No models loaded"}
            </option>
            {fallbackModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-surface/60 p-3 text-sm">
        <input
          type="checkbox"
          checked={config.freeOnly}
          onChange={(e) => onConfigChange({ ...config, freeOnly: e.target.checked })}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          Free-only routing
          <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground">
            The platform will never route to a paid model. If every free route fails, the task
            stops with an explanation.
          </span>
        </span>
      </label>
    </section>
  );
}

/**
 * Provider & model selector popover — lets the user pick which AI provider
 * and model the agent pipeline uses, directly from the workspace top bar.
 *
 * Reuses the existing workspace context (providerConfig, providerStatuses)
 * and the existing testProvider server function to fetch live model lists.
 * Never fabricates model names — only shows models returned by the provider.
 */
import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/lib/workspace";
import { testProvider, type ProviderStatus } from "@/lib/connection.functions";
import { PROVIDER_IDS, type ProviderId } from "@/lib/architect.types";
import { getUserSecrets } from "@/lib/user-secrets";
import {
  Cpu,
  ChevronDown,
  Check,
  Loader2,
  CircleDot,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  lovable: "Built-in AI",
  groq: "Groq",
  mistral: "Mistral",
  huggingface: "Hugging Face",
};

export function ProviderModelControl() {
  const { providerConfig, setProviderConfig, providerStatuses, setProviderStatus, keyStatus } =
    useWorkspace();
  const providerFn = useServerFn(testProvider);
  const [open, setOpen] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<ProviderId | null>(null);

  const activeProvider = providerConfig.primaryProvider;
  const activeModel = providerConfig.primaryModel;
  const status = providerStatuses[activeProvider];

  // Fetch models for a provider on demand when the popover opens or provider changes
  const fetchModels = useCallback(
    async (provider: ProviderId) => {
      const existing = providerStatuses[provider];
      if (existing?.ok && existing.models.length > 0) return;
      setLoadingProvider(provider);
      try {
        const res = await providerFn({ data: { provider, secrets: getUserSecrets() } });
        setProviderStatus(res);
      } catch {
        /* ignore */
      } finally {
        setLoadingProvider(null);
      }
    },
    [providerFn, setProviderStatus, providerStatuses],
  );

  // When popover opens, ensure the active provider's models are loaded
  useEffect(() => {
    if (open) fetchModels(activeProvider);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectProvider = (provider: ProviderId) => {
    setProviderConfig({ ...providerConfig, primaryProvider: provider, primaryModel: "" });
    fetchModels(provider);
  };

  const selectModel = (model: string) => {
    setProviderConfig({ ...providerConfig, primaryModel: model });
    setOpen(false);
  };

  const isConfigured = (provider: ProviderId): boolean => {
    if (provider === "lovable") return keyStatus.lovable;
    if (provider === "gemini") return keyStatus.gemini;
    if (provider === "openrouter") return keyStatus.openrouter;
    if (provider === "groq") return keyStatus.groq;
    if (provider === "mistral") return keyStatus.mistral;
    if (provider === "huggingface") return keyStatus.huggingface;
    return false;
  };

  const models = status?.models ?? [];
  const isLoading = loadingProvider === activeProvider;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
          <Cpu className="size-3.5" />
          <span className="capitalize">{PROVIDER_LABELS[activeProvider]}</span>
          {activeModel ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="max-w-[140px] truncate font-mono text-[11px]">{activeModel}</span>
            </>
          ) : (
            <span className="text-muted-foreground/50">auto</span>
          )}
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Provider grid */}
        <div className="border-b border-border p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            AI Provider
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {PROVIDER_IDS.map((p) => {
              const configured = isConfigured(p);
              const isActive = p === activeProvider;
              return (
                <button
                  key={p}
                  onClick={() => selectProvider(p)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  <div className="flex items-center gap-1">
                    {configured ? (
                      <CircleDot className="size-3 text-green-500" />
                    ) : (
                      <AlertCircle className="size-3 text-muted-foreground/50" />
                    )}
                    <span className="font-medium">{PROVIDER_LABELS[p]}</span>
                  </div>
                  {!configured && (
                    <span className="text-[9px] text-muted-foreground/60">no key</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Model list */}
        <div className="max-h-64 overflow-y-auto p-2">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Model
            </span>
            {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>

          {!isLoading && models.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {isConfigured(activeProvider)
                ? "No models available. Check your API key."
                : "No API key configured for this provider. Add one in Credentials."}
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Auto option */}
              <button
                onClick={() => selectModel("")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary/60",
                  !activeModel && "bg-primary/10 text-primary",
                )}
              >
                <Zap className="size-3.5 shrink-0" />
                <span className="flex-1">Auto-select best model</span>
                {!activeModel && <Check className="size-3.5" />}
              </button>

              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => selectModel(m)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary/60",
                    activeModel === m && "bg-primary/10 text-primary",
                  )}
                >
                  <span className="flex-1 truncate font-mono text-[11px]">{m}</span>
                  {m.endsWith(":free") && (
                    <span className="rounded bg-green-500/15 px-1 text-[9px] text-green-500">free</span>
                  )}
                  {activeModel === m && <Check className="size-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status footer */}
        {status && (
          <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
            {status.ok ? (
              <span className="flex items-center gap-1 text-green-500">
                <Check className="size-3" /> Connected · {models.length} models
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertCircle className="size-3" /> {status.detail}
              </span>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

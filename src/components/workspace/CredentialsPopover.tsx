/**
 * Secure credentials popover — manages API keys via the server-side encrypted
 * vault. The browser never holds or receives plaintext secrets; it only sees
 * metadata (configured, masked key, last validation status).
 *
 * Supports a one-time migration from legacy localStorage keys to the vault.
 */
import { useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/lib/workspace";
import {
  saveCredential,
  removeCredential,
  getCredentialMetadata,
  migrateCredentials,
  type SecretMetadata,
} from "@/lib/vault.functions";
import {
  hasLegacySecrets,
  getLegacySecrets,
  clearLegacySecrets,
} from "@/lib/user-secrets";
import { KEY_SOURCES } from "@/lib/model-picker";
import {
  KeyRound,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowRight,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Key = (typeof SECRET_KEYS_LIST)[number];

const SECRET_KEYS_LIST = [
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "HF_API_KEY",
] as const;

const KEY_META: Record<string, { label: string; placeholder: string; link: string }> = {
  GITHUB_TOKEN: {
    label: "GitHub Token",
    placeholder: "ghp_… / github_pat_…",
    link: KEY_SOURCES.github,
  },
  OPENAI_API_KEY: {
    label: "OpenAI API Key",
    placeholder: "sk-…",
    link: "https://platform.openai.com/api-keys",
  },
  ANTHROPIC_API_KEY: {
    label: "Anthropic API Key",
    placeholder: "sk-ant-…",
    link: "https://console.anthropic.com/settings/keys",
  },
  GEMINI_API_KEY: {
    label: "Gemini API Key",
    placeholder: "AIza…",
    link: KEY_SOURCES.gemini,
  },
  OPENROUTER_API_KEY: {
    label: "OpenRouter API Key",
    placeholder: "sk-or-…",
    link: KEY_SOURCES.openrouter,
  },
  GROQ_API_KEY: {
    label: "Groq API Key",
    placeholder: "gsk_…",
    link: KEY_SOURCES.groq,
  },
  MISTRAL_API_KEY: {
    label: "Mistral API Key",
    placeholder: "…",
    link: KEY_SOURCES.mistral,
  },
  HF_API_KEY: {
    label: "Hugging Face Token",
    placeholder: "hf_…",
    link: KEY_SOURCES.huggingface,
  },
};

export function CredentialsPopover() {
  const { refreshSecrets } = useWorkspace();
  const saveFn = useServerFn(saveCredential);
  const removeFn = useServerFn(removeCredential);
  const getMetaFn = useServerFn(getCredentialMetadata);
  const migrateFn = useServerFn(migrateCredentials);

  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, SecretMetadata>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    try {
      const meta = await getMetaFn({});
      setMetadata(meta);
    } catch {
      /* ignore */
    }
  }, [getMetaFn]);

  useEffect(() => {
    if (open) {
      loadMetadata();
      setDrafts({});
      setReveal({});
      setEditing(new Set());
      setError(null);
      setShowMigration(hasLegacySecrets());
    }
  }, [open, loadMetadata]);

  const configuredCount = Object.values(metadata).filter((m) => m?.configured).length;

  async function saveKey(key: string) {
    const value = (drafts[key] ?? "").trim();
    if (!value) return;
    setSaving(key);
    setError(null);
    try {
      await saveFn({ data: { name: key as any, value } });
      setDrafts((d) => ({ ...d, [key]: "" }));
      setReveal((r) => ({ ...r, [key]: false }));
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      await loadMetadata();
      refreshSecrets();
    } catch {
      setError("Failed to save credential to vault.");
    } finally {
      setSaving(null);
    }
  }

  async function removeKey(key: string) {
    setRemoving(key);
    setError(null);
    try {
      await removeFn({ data: { name: key as any } });
      await loadMetadata();
      refreshSecrets();
    } catch {
      setError("Failed to remove credential.");
    } finally {
      setRemoving(null);
    }
  }

  async function runMigration() {
    setMigrating(true);
    setError(null);
    try {
      const legacy = getLegacySecrets();
      const res = await migrateFn({ data: { secrets: legacy } });
      if (res.migrated.length > 0) {
        clearLegacySecrets();
        setShowMigration(false);
        await loadMetadata();
        refreshSecrets();
      }
    } catch {
      setError("Migration failed. Please re-enter your credentials manually.");
    } finally {
      setMigrating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
          <KeyRound className="size-3.5" />
          <span className="hidden sm:inline">Credentials</span>
          <span
            className={cn(
              "rounded-full px-1.5 text-[10px] font-medium",
              configuredCount > 0
                ? "bg-green-500/15 text-green-500"
                : "bg-muted text-muted-foreground",
            )}
          >
            {configuredCount}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <ShieldCheck className="size-4 text-primary" />
          <span className="text-sm font-semibold">Secure Credentials</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {configuredCount}/{SECRET_KEYS_LIST.length} configured
          </span>
        </div>

        {/* Migration banner */}
        {showMigration && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <div className="flex-1 text-xs">
                <span className="font-medium text-amber-600">Legacy credentials detected</span>
                <p className="mt-0.5 text-muted-foreground">
                  Your browser has keys stored in localStorage. Migrate them to the encrypted
                  server-side vault, then the browser copy is deleted.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="mt-2 h-7 w-full text-xs"
              onClick={runMigration}
              disabled={migrating}
            >
              {migrating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="size-3.5" /> Migrate to vault
                </>
              )}
            </Button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Key list */}
        <div className="max-h-80 space-y-1 overflow-y-auto p-2">
          {SECRET_KEYS_LIST.map((key) => {
            const meta = KEY_META[key];
            const m = metadata[key];
            const configured = m?.configured ?? false;
            const isEditing = editing.has(key);
            const isRevealed = reveal[key];
            const isSaving = saving === key;
            const isRemoving = removing === key;

            return (
              <div key={key} className="rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{meta.label}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {configured ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-500">
                        <Check className="size-3" /> ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <AlertCircle className="size-3" /> missing
                      </span>
                    )}
                  </span>
                </div>

                {/* Configured: show masked key with replace/remove */}
                {configured && !isEditing ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {m?.maskedKey || "••••••"}
                    </code>
                    {m?.lastValidationStatus === "ok" && (
                      <span className="text-[9px] text-green-500" title={`Validated ${m.lastValidated ?? ""}`}>
                        ✓
                      </span>
                    )}
                    {m?.lastValidationStatus === "fail" && (
                      <span className="text-[9px] text-red-500" title="Last test failed">
                        ✗
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setEditing((prev) => new Set(prev).add(key));
                        setReveal((r) => ({ ...r, [key]: false }));
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      title="Replace"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      onClick={() => removeKey(key)}
                      disabled={isRemoving}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Remove"
                    >
                      {isRemoving ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </button>
                  </div>
                ) : (
                  /* Not configured or editing: show input */
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Input
                      value={drafts[key] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && saveKey(key)}
                      placeholder={meta.placeholder}
                      type={isRevealed ? "text" : "password"}
                      className="h-7 font-mono text-[11px]"
                      autoFocus={isEditing}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 p-0"
                      onClick={() => setReveal((r) => ({ ...r, [key]: !r[key] }))}
                      title={isRevealed ? "Hide" : "Show typed"}
                    >
                      {isRevealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 shrink-0 px-2"
                      onClick={() => saveKey(key)}
                      disabled={isSaving || !(drafts[key] ?? "").trim()}
                    >
                      {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    </Button>
                    {isEditing && (
                      <button
                        onClick={() => {
                          setEditing((prev) => {
                            const next = new Set(prev);
                            next.delete(key);
                            return next;
                          });
                          setDrafts((d) => ({ ...d, [key]: "" }));
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        cancel
                      </button>
                    )}
                  </div>
                )}

                <a
                  href={meta.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary"
                >
                  <ExternalLink className="size-2.5" />
                  Get a key
                </a>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <Lock className="mr-1 inline size-2.5" />
          Encrypted server-side. Plaintext never reaches the browser.
        </div>
      </PopoverContent>
    </Popover>
  );
}

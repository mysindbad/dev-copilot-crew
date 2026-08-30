/**
 * Secure credentials popover — manage API keys and tokens directly from the
 * workspace top bar without opening the full settings drawer.
 *
 * Keys are stored in browser localStorage (user-secrets) and sent only to this
 * app's own server functions. Values are never displayed in clear text — only
 * a masked preview is shown. Reveal toggles are per-key and ephemeral.
 */
import { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace";

/** Flag names in the workspace context's keyStatus object. */
type SecretFlag = "github" | "gemini" | "openrouter" | "groq" | "mistral" | "huggingface" | "lovable";
import {
  SECRET_KEYS,
  getUserSecrets,
  setUserSecrets,
  clearUserSecret,
  maskSecret,
  type UserSecrets,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Key = (typeof SECRET_KEYS)[number];

const KEY_META: Record<Key, { label: string; placeholder: string; link: string; provider: string }> = {
  GITHUB_TOKEN: {
    label: "GitHub Token",
    placeholder: "ghp_… / github_pat_…",
    link: KEY_SOURCES.github,
    provider: "github",
  },
  GEMINI_API_KEY: {
    label: "Gemini API Key",
    placeholder: "AIza…",
    link: KEY_SOURCES.gemini,
    provider: "gemini",
  },
  OPENROUTER_API_KEY: {
    label: "OpenRouter API Key",
    placeholder: "sk-or-…",
    link: KEY_SOURCES.openrouter,
    provider: "openrouter",
  },
  GROQ_API_KEY: {
    label: "Groq API Key",
    placeholder: "gsk_…",
    link: KEY_SOURCES.groq,
    provider: "groq",
  },
  MISTRAL_API_KEY: {
    label: "Mistral API Key",
    placeholder: "…",
    link: KEY_SOURCES.mistral,
    provider: "mistral",
  },
  HF_API_KEY: {
    label: "Hugging Face Token",
    placeholder: "hf_…",
    link: KEY_SOURCES.huggingface,
    provider: "huggingface",
  },
};

export function CredentialsPopover() {
  const { keyStatus, serverSecrets, refreshSecrets } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<UserSecrets>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setStored(getUserSecrets());
      setDrafts({});
      setReveal({});
      setEditing(new Set());
    }
  }, [open]);

  const serverHas: Record<Key, boolean> = {
    GITHUB_TOKEN: serverSecrets.github,
    GEMINI_API_KEY: serverSecrets.gemini,
    OPENROUTER_API_KEY: serverSecrets.openrouter,
    GROQ_API_KEY: serverSecrets.groq,
    MISTRAL_API_KEY: serverSecrets.mistral,
    HF_API_KEY: serverSecrets.huggingface,
  };

  const configuredCount = SECRET_KEYS.filter((k) => keyStatus[serverKeyToFlag(k)]).length;

  function saveKey(key: Key) {
    const value = (drafts[key] ?? "").trim();
    if (!value) return;
    setUserSecrets({ ...getUserSecrets(), [key]: value });
    setStored(getUserSecrets());
    setDrafts((d) => ({ ...d, [key]: "" }));
    setReveal((r) => ({ ...r, [key]: false }));
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    refreshSecrets();
  }

  function removeKey(key: Key) {
    clearUserSecret(key);
    setStored(getUserSecrets());
    refreshSecrets();
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
            {configuredCount}/{SECRET_KEYS.length} configured
          </span>
        </div>

        {/* Key list */}
        <div className="max-h-80 space-y-1 overflow-y-auto p-2">
          {SECRET_KEYS.map((key) => {
            const meta = KEY_META[key];
            const hasServer = serverHas[key];
            const hasUser = Boolean(stored[key]);
            const isEditing = editing.has(key);
            const isRevealed = reveal[key];
            const configured = keyStatus[serverKeyToFlag(key)];

            return (
              <div key={key} className="rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{meta.label}</span>
                  {hasServer && (
                    <span className="rounded bg-blue-500/15 px-1 text-[9px] text-blue-500">
                      server
                    </span>
                  )}
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

                {hasUser && !isEditing ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {isRevealed ? stored[key] : maskSecret(stored[key]!)}
                    </code>
                    <button
                      onClick={() => setReveal((r) => ({ ...r, [key]: !r[key] }))}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      title={isRevealed ? "Hide" : "Reveal"}
                    >
                      {isRevealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => removeKey(key)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : (
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
                      disabled={!(drafts[key] ?? "").trim()}
                    >
                      <Plus className="size-3.5" />
                    </Button>
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
          Keys are stored in your browser only and sent to this app's server.
          Server-side keys override browser keys.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function serverKeyToFlag(key: Key): SecretFlag {
  return key === "GITHUB_TOKEN"
    ? "github"
    : key === "GEMINI_API_KEY"
      ? "gemini"
      : key === "OPENROUTER_API_KEY"
        ? "openrouter"
        : key === "GROQ_API_KEY"
          ? "groq"
          : key === "MISTRAL_API_KEY"
            ? "mistral"
            : "huggingface";
}

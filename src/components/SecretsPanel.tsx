import { useEffect, useState } from "react";
import { KeyRound, Eye, EyeOff, Save, Trash2, ShieldCheck } from "lucide-react";
import {
  SECRET_KEYS,
  getUserSecrets,
  setUserSecrets,
  clearUserSecret,
  maskSecret,
  subscribeUserSecrets,
  type UserSecrets,
} from "@/lib/user-secrets";
import { StatusPill } from "./StatusPill";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Key = (typeof SECRET_KEYS)[number];

const META: Record<Key, { ar: string; en: string; hint: string; placeholder: string }> = {
  GITHUB_TOKEN: {
    ar: "توكن GitHub",
    en: "GitHub token",
    hint: "github.com → Settings → Developer settings → Personal access tokens (repo)",
    placeholder: "ghp_… / github_pat_…",
  },
  GEMINI_API_KEY: {
    ar: "مفتاح Gemini",
    en: "Gemini API key",
    hint: "aistudio.google.com → API keys",
    placeholder: "AIza…",
  },
  OPENROUTER_API_KEY: {
    ar: "مفتاح OpenRouter",
    en: "OpenRouter API key",
    hint: "openrouter.ai → Keys",
    placeholder: "sk-or-…",
  },
};

export function SecretsPanel({
  serverStatus,
  onChange,
}: {
  serverStatus: { github: boolean; gemini: boolean; openrouter: boolean };
  onChange?: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [stored, setStored] = useState<UserSecrets>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setStored(getUserSecrets());
    const unsubscribe = subscribeUserSecrets(() => setStored({ ...getUserSecrets() }));
    return () => {
      unsubscribe();
    };
  }, []);

  function save(key: Key) {
    const value = (draft[key] ?? "").trim();
    if (!value) return;
    setUserSecrets({ ...getUserSecrets(), [key]: value });
    setDraft((d) => ({ ...d, [key]: "" }));
    setReveal((r) => ({ ...r, [key]: false }));
    setSaved(key);
    onChange?.();
    setTimeout(() => setSaved(null), 2000);
  }

  function remove(key: Key) {
    clearUserSecret(key);
    onChange?.();
  }

  const serverHas: Record<Key, boolean> = {
    GITHUB_TOKEN: serverStatus.github,
    GEMINI_API_KEY: serverStatus.gemini,
    OPENROUTER_API_KEY: serverStatus.openrouter,
  };

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KeyRound className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{ar ? "الأسرار والمفاتيح" : "Secrets & keys"}</h2>
        </div>
        <StatusPill tone="ok">
          {ar ? "تُخزَّن في متصفحك" : "stored in your browser"}
        </StatusPill>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        {ar
          ? "دخّل المفاتيح ديالك هنا. كيتسجلو غير فهاد المتصفح، وكيتبعتو للسيرفر غير وقت الطلب. إلا خليتي الخانة خاوية، كيتستعمل المفتاح المخزّن فالسيرفر."
          : "Enter your own keys. They stay in this browser and are only sent with each request. Leave empty to use the server-side key."}
      </p>

      <div className="mt-5 space-y-3">
        {SECRET_KEYS.map((key) => {
          const meta = META[key];
          const current = stored[key];
          const show = reveal[key];
          return (
            <div key={key} className="rounded-md border border-border bg-surface/60 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{ar ? meta.ar : meta.en}</div>
                  <div className="font-mono text-[0.68rem] text-muted-foreground">{key}</div>
                </div>
                <StatusPill tone={current ? "ok" : serverHas[key] ? "warn" : "fail"}>
                  {current
                    ? ar
                      ? "مفتاحك"
                      : "your key"
                    : serverHas[key]
                      ? ar
                        ? "مفتاح السيرفر"
                        : "server key"
                      : ar
                        ? "غير موجود"
                        : "missing"}
                </StatusPill>
              </div>

              {current && (
                <div className="mt-2.5 flex items-center gap-2 text-xs">
                  <ShieldCheck className="size-3.5 text-success" />
                  <span className="font-mono text-muted-foreground">{maskSecret(current)}</span>
                  <button
                    onClick={() => remove(key)}
                    className="ms-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.7rem] transition-colors hover:bg-muted"
                  >
                    <Trash2 className="size-3" />
                    {ar ? "مسح" : "Remove"}
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <input
                    type={show ? "text" : "password"}
                    value={draft[key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && save(key)}
                    placeholder={meta.placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-md border border-border bg-input py-2 pe-9 ps-3 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((r) => ({ ...r, [key]: !show }))}
                    className="absolute end-2 top-1.5 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={ar ? "إظهار" : "Show"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <button
                  onClick={() => save(key)}
                  disabled={!(draft[key] ?? "").trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  {ar ? "حفظ" : "Save"}
                </button>
              </div>

              <p
                className={cn(
                  "mt-2 font-mono text-[0.68rem]",
                  saved === key ? "text-success" : "text-muted-foreground",
                )}
              >
                {saved === key ? (ar ? "تسجل ✓" : "saved ✓") : meta.hint}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

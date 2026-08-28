import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X,
  Github,
  KeyRound,
  Loader2,
  Check,
  TriangleAlert,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { testRepositoryConnection } from "@/lib/connection.functions";
import {
  SECRET_KEYS,
  getUserSecrets,
  setUserSecrets,
  clearUserSecret,
  maskSecret,
  type UserSecrets,
} from "@/lib/user-secrets";
import { KEY_SOURCES } from "@/lib/model-picker";
import { arabize } from "@/lib/ar";
import { StatusPill } from "./StatusPill";

type Key = (typeof SECRET_KEYS)[number];

const META: Record<Key, { title: string; hint: string; placeholder: string; link: string }> = {
  GITHUB_TOKEN: {
    title: "توكن GitHub",
    hint: "خاصو صلاحية repo باش نقدرو نصاوبو فرع و Pull Request.",
    placeholder: "ghp_… / github_pat_…",
    link: KEY_SOURCES.github,
  },
  GEMINI_API_KEY: {
    title: "مفتاح Google Gemini (مجاني)",
    hint: "Google كتعطي مفتاح مجاني من AI Studio.",
    placeholder: "AIza…",
    link: KEY_SOURCES.gemini,
  },
  OPENROUTER_API_KEY: {
    title: "مفتاح OpenRouter",
    hint: "فيه نماذج بلا فلوس كينتهيو بـ ‎:free.",
    placeholder: "sk-or-…",
    link: KEY_SOURCES.openrouter,
  },
  GROQ_API_KEY: {
    title: "مفتاح Groq (مجاني، الأسرع)",
    hint: "مجاني دائم وبلا بطاقة بنكية. سريع بزاف — مزيان للمدير.",
    placeholder: "gsk_…",
    link: KEY_SOURCES.groq,
  },
  MISTRAL_API_KEY: {
    title: "مفتاح Mistral AI (مجاني)",
    hint: "10$ شهريا مجانا، بلا بطاقة. نماذج قوية بزاف.",
    placeholder: "…",
    link: KEY_SOURCES.mistral,
  },
  HF_API_KEY: {
    title: "مفتاح Hugging Face (مجاني)",
    hint: "كيعطي وصول لآلاف النماذج، فيها نماذج :free.",
    placeholder: "hf_…",
    link: KEY_SOURCES.huggingface,
  },
};

/** Right-side settings drawer: repository, token and provider keys in one place. */
export function SettingsDrawer() {
  const {
    settingsOpen,
    setSettingsOpen,
    repoConfig,
    setRepoConfig,
    repoResult,
    setRepoResult,
    keyStatus,
    serverSecrets,
    refreshSecrets,
  } = useWorkspace();

  const testRepo = useServerFn(testRepositoryConnection);
  const [stored, setStored] = useState<UserSecrets>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settingsOpen) setStored(getUserSecrets());
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  function saveKey(key: Key) {
    const value = (draft[key] ?? "").trim();
    if (!value) return;
    setUserSecrets({ ...getUserSecrets(), [key]: value });
    setStored(getUserSecrets());
    setDraft((d) => ({ ...d, [key]: "" }));
    setReveal((r) => ({ ...r, [key]: false }));
    refreshSecrets();
  }

  function removeKey(key: Key) {
    clearUserSecret(key);
    setStored(getUserSecrets());
    refreshSecrets();
  }

  async function runTest() {
    setTesting(true);
    setRepoResult(null);
    try {
      setRepoResult(await testRepo({ data: { ...repoConfig, secrets: getUserSecrets() } }));
    } finally {
      setTesting(false);
    }
  }

  const serverHas: Record<Key, boolean> = {
    GITHUB_TOKEN: serverSecrets.github,
    GEMINI_API_KEY: serverSecrets.gemini,
    OPENROUTER_API_KEY: serverSecrets.openrouter,
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="إغلاق"
        onClick={() => setSettingsOpen(false)}
        className="flex-1 bg-background/70 backdrop-blur-sm"
      />
      <aside className="h-full w-full max-w-md overflow-y-auto border-s border-border bg-surface p-5 shadow-xl sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">الإعدادات</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </header>
        <p className="mt-2 text-sm text-muted-foreground">
          دخّل رابط المستودع والمفاتيح، وضغط «موافق» باش تسدّ. كلشي كيتسجل ف المتصفح ديالك.
        </p>

        {/* Repository */}
        <section className="mt-5 rounded-md border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2">
            <Github className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">المستودع</h3>
          </div>
          <label className="mt-3 block text-xs text-muted-foreground">رابط المستودع</label>
          <input
            value={repoConfig.repoUrl}
            onChange={(e) => setRepoConfig({ ...repoConfig, repoUrl: e.target.value })}
            placeholder="github.com/المالك/المشروع"
            dir="ltr"
            className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-ring"
          />
          <label className="mt-3 block text-xs text-muted-foreground">الفرع</label>
          <input
            value={repoConfig.branch}
            onChange={(e) => setRepoConfig({ ...repoConfig, branch: e.target.value })}
            placeholder="main"
            dir="ltr"
            className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-xs outline-none focus:border-ring"
          />
          <button
            onClick={runTest}
            disabled={testing || !repoConfig.repoUrl.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            اختبر الاتصال
          </button>

          {repoResult && (
            <ul className="mt-3 space-y-1.5">
              {repoResult.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  {c.state === "ok" ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ) : c.state === "skip" ? (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  ) : (
                    <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium">{arabize(c.label)}</span>{" "}
                    <span className="text-muted-foreground">— {arabize(c.detail)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Keys */}
        <section className="mt-4 rounded-md border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">المفاتيح</h3>
          </div>

          {/* Free key guides */}
          <div className="mt-3 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-primary">كيفاش نجيب مفتاح مجاني؟ (روابط رسمية)</p>
            <ol className="space-y-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Gemini (مجاني، الأسهل):</span>{" "}
                1) سير لـ <a href={KEY_SOURCES.gemini} target="_blank" rel="noreferrer" dir="ltr" className="text-primary underline">aistudio.google.com/apikey</a>
                {" "}2) سجّل بحساب Google 3) كليك «Create API key» 4) كوبييه وحطّو لتحت.
              </li>
              <li>
                <span className="font-medium text-foreground">OpenRouter (مجاني، فيه نماذج :free):</span>{" "}
                1) سير لـ <a href={KEY_SOURCES.openrouter} target="_blank" rel="noreferrer" dir="ltr" className="text-primary underline">openrouter.ai/settings/keys</a>
                {" "}2) سجّل الدخول 3) «Create Key» 4) كوبييه وحطّو لتحت.
              </li>
              <li>
                <span className="font-medium text-foreground">GitHub (باش نكتبو الكود):</span>{" "}
                1) سير لـ <a href={KEY_SOURCES.github} target="_blank" rel="noreferrer" dir="ltr" className="text-primary underline">github.com/settings/tokens</a>
                {" "}2) «Generate new token (classic)» 3) فعّل صلاحية repo 4) كوبييه وحطّو لتحت.
              </li>
            </ol>
            <p className="text-[0.68rem] text-muted-foreground">
              هاد الروابط رسمية من Google / OpenRouter / GitHub — مفاتيحك كتبقى فالمتصفح ديالك غير نتا.
            </p>
          </div>

          <div className="mt-3 space-y-3">
            {SECRET_KEYS.map((key) => {
              const meta = META[key];
              const current = stored[key];
              const show = reveal[key];
              return (
                <div key={key} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{meta.title}</div>
                    <StatusPill tone={current ? "ok" : serverHas[key] ? "warn" : "fail"}>
                      {current ? "مفتاحك" : serverHas[key] ? "مفتاح السيرفر" : "ناقص"}
                    </StatusPill>
                  </div>

                  {current && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground" dir="ltr">
                        {maskSecret(current)}
                      </span>
                      <button
                        onClick={() => removeKey(key)}
                        className="ms-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.7rem] hover:bg-muted"
                      >
                        <Trash2 className="size-3" />
                        مسح
                      </button>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={show ? "text" : "password"}
                        value={draft[key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && saveKey(key)}
                        placeholder={meta.placeholder}
                        dir="ltr"
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full rounded-md border border-border bg-input py-2 pe-9 ps-3 font-mono text-xs outline-none focus:border-ring"
                      />
                      <button
                        type="button"
                        onClick={() => setReveal((r) => ({ ...r, [key]: !show }))}
                        className="absolute end-2 top-1.5 rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="إظهار"
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <button
                      onClick={() => saveKey(key)}
                      disabled={!(draft[key] ?? "").trim()}
                      className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      حفظ
                    </button>
                  </div>

                  <p className="mt-2 text-[0.7rem] text-muted-foreground">{meta.hint}</p>
                  <a
                    href={meta.link}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                    className="mt-1 inline-flex items-center gap-1 font-mono text-[0.68rem] text-primary hover:underline"
                  >
                    {meta.link}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        <p className="mt-4 text-xs text-muted-foreground">
          وضع «مجاني 100%» مفعّل: التطبيق كيخدم غير بمفاتيحك المجانية وما كيستهلك حتى رصيد.
          مفاتيحك: GitHub {keyStatus.github ? "✓" : "✗"} · Gemini {keyStatus.gemini ? "✓" : "✗"} ·
          OpenRouter {keyStatus.openrouter ? "✓" : "✗"}.
          {!keyStatus.gemini && !keyStatus.openrouter
            ? " زيد مفتاح مجاني من الروابط فوق باش يخدم الفريق."
            : ""}
        </p>


        <button
          onClick={() => setSettingsOpen(false)}
          className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          موافق
        </button>
      </aside>
    </div>
  );
}

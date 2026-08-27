import { getUserSecrets } from "@/lib/user-secrets";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, Github, Loader2, ShieldCheck, Check, X, TriangleAlert } from "lucide-react";
import {
  testRepositoryConnection,
  type RepoConnectionResult,
} from "@/lib/connection.functions";
import { StatusPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { arabize } from "@/lib/ar";

export interface RepoConfig {
  repoUrl: string;
  branch: string;
}

export function ConnectRepository({
  config,
  onConfigChange,
  result,
  onResult,
  tokenConfigured,
}: {
  config: RepoConfig;
  onConfigChange: (c: RepoConfig) => void;
  result: RepoConnectionResult | null;
  onResult: (r: RepoConnectionResult | null) => void;
  tokenConfigured: boolean;
}) {
  const { t } = useI18n();
  const run = useServerFn(testRepositoryConnection);
  const [pending, setPending] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  async function test() {
    setPending(true);
    setFatal(null);
    onResult(null);
    try {
      const res = await run({ data: { ...config, secrets: getUserSecrets() } });
      onResult(res);
    } catch {
      setFatal("ما قدرناش نكملو اختبار الاتصال. عاود جرّب.");
    } finally {
      setPending(false);
    }
  }

  const disabled = pending || !config.repoUrl.trim() || !config.branch.trim();

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Github className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{t("panel.connect.title")}</h2>
        </div>
        <StatusPill tone={result?.ok ? "ok" : result ? "fail" : "idle"}>
          {result?.ok ? "متصل" : result ? "فشل" : "غير متصل"}
        </StatusPill>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label-caps" htmlFor="repoUrl">
            رابط المستودع
          </label>
          <input
            id="repoUrl"
            value={config.repoUrl}
            onChange={(e) => onConfigChange({ ...config, repoUrl: e.target.value })}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="branch">
            الفرع
          </label>
          <div className="relative mt-1.5">
            <GitBranch className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <input
              id="branch"
              value={config.branch}
              onChange={(e) => onConfigChange({ ...config, branch: e.target.value })}
              placeholder="main"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-input py-2 pr-3 pl-9 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div>
          <span className="label-caps">توكن GitHub</span>
          <div className="mt-1.5 flex h-[38px] items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 text-sm">
            <ShieldCheck
              className={cn("size-4", tokenConfigured ? "text-success" : "text-muted-foreground")}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {tokenConfigured ? "محفوظ ••••••" : "غير مُعرَّف"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={test}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {pending ? "كنتأكدو…" : "اختبر الاتصال"}
        </button>
        <span className="self-center font-mono text-xs text-muted-foreground">
          اتصال حقيقي بـ GitHub — ما كاين حتى شي بيانات وهمية.
        </span>
      </div>

      {fatal && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {fatal}
        </p>
      )}

      {result && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          {result.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5 text-sm">
              {c.state === "ok" ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
              ) : c.state === "skip" ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}

              <div className="min-w-0">
                <span className="font-medium">{arabize(c.label)}</span>
                <span className="ml-2 font-mono text-xs break-words text-muted-foreground">
                  {arabize(c.detail)}
                </span>
              </div>
            </div>
          ))}
          {result.error && (
            <p className="pt-1 text-sm text-destructive">
              {arabize(result.error)} — تحقّق من المستودع والفرع وصلاحيات التوكن، ثم عاود.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

import { Activity, Loader2, Check, X } from "lucide-react";
import { useActivity } from "@/lib/activity";
import { useI18n } from "@/lib/i18n";

export function ActivityFeed() {
  const { entries, clear } = useActivity();
  const { t, lang } = useI18n();

  return (
    <section className="panel p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Activity className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{t("activity.title")}</h2>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("activity.clear")}
          </button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("activity.empty")}</p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pe-1">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-2.5 rounded-md border border-border bg-surface/60 px-3 py-2"
            >
              <span className="mt-0.5 shrink-0">
                {e.state === "running" ? (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : e.state === "done" ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <X className="size-3.5 text-destructive" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold">{e.agent}</span>
                  <span className="text-muted-foreground">{e.action}</span>
                </div>
                {(e.model || e.detail) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[0.66rem] text-muted-foreground">
                    {e.model && (
                      <span className="rounded border border-border px-1.5 py-0.5">
                        {t("activity.model")}: {e.model}
                      </span>
                    )}
                    {e.detail && <span className="break-words">{e.detail}</span>}
                  </div>
                )}
              </div>
              <time
                dir="ltr"
                className="shrink-0 font-mono text-[0.62rem] text-muted-foreground"
              >
                {new Date(e.at).toLocaleTimeString(lang === "ar" ? "ar-MA" : "en-GB", {
                  hour12: false,
                })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

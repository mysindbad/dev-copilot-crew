import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessagesSquare, Loader2, Send, Sparkles, ArrowRight } from "lucide-react";
import { teamLeadChat } from "@/lib/chat.functions";
import type { ChatMessage, ChatTurn } from "@/lib/chat.types";
import type { ProviderConfig } from "./ProviderPanel";
import { StatusPill } from "./StatusPill";
import { useI18n } from "@/lib/i18n";
import { useActivity } from "@/lib/activity";

interface Bubble extends ChatMessage {
  turn?: ChatTurn;
}

export function TeamChat({
  provider,
  context,
  onUseTask,
}: {
  provider: ProviderConfig;
  context: {
    repository: string;
    branch: string;
    commitSha: string;
    stack: string[];
    entryPoints: string[];
    apiRoutes: number;
    fileCount: number;
    planSummary: string;
    changeSetSummary: string;
    reviewGate: string;
  };
  onUseTask: (task: string) => void;
}) {
  const { t, lang } = useI18n();
  const { log, finish } = useActivity();
  const run = useServerFn(teamLeadChat);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(provider.primaryModel);

  async function send() {
    const text = input.trim();
    if (!text || busy || !ready) return;
    const history: Bubble[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setBusy(true);
    setError(null);

    const activityId = log({
      agent: t("agent.lead"),
      action: t("act.chat"),
      model: provider.primaryModel,
      state: "running",
    });

    try {
      const res = await run({
        data: {
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          language: lang,
          context,
          primaryProvider: provider.primaryProvider,
          primaryModel: provider.primaryModel,
          fallbackProvider: provider.fallbackProvider,
          fallbackModel: provider.fallbackModel,
        },
      });
      if (res.ok && res.turn) {
        setMessages([...history, { role: "assistant", content: res.turn.reply, turn: res.turn }]);
        finish(activityId, {
          state: "done",
          action: t("act.chatDone"),
          model: res.turn.model,
          detail: `${res.turn.ms} ms`,
        });
      } else {
        setError(res.error ?? "unknown error");
        finish(activityId, { state: "failed", detail: res.error ?? "" });
      }
    } catch {
      setError("network error");
      finish(activityId, { state: "failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <MessagesSquare className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{t("chat.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("chat.clear")}
            </button>
          )}
          <StatusPill tone={ready ? "ok" : "warn"}>
            {ready ? provider.primaryModel : t("status.providerIdle")}
          </StatusPill>
        </div>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">{t("chat.desc")}</p>

      <div className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto pe-1">
        {messages.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {t("chat.empty")}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[92%] rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed " +
                (m.role === "user"
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-surface/70")
              }
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[0.66rem] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {m.role === "user" ? t("chat.you") : t("agent.lead")}
                </span>
                {m.turn && (
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                    {m.turn.model} · {m.turn.ms} ms
                    {m.turn.usedFallback ? " · fallback" : ""}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>

              {m.turn && m.turn.questions.length > 0 && (
                <div className="mt-3 rounded-md border border-border bg-background/40 p-2.5">
                  <span className="label-caps">{t("chat.questions")}</span>
                  <ul className="mt-1.5 space-y-1">
                    {m.turn.questions.map((q, qi) => (
                      <li key={qi} className="flex gap-2 text-xs text-muted-foreground">
                        <ArrowRight className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.turn?.suggestedTask && (
                <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <span className="label-caps">{t("chat.suggestedTask")}</span>
                  <p className="mt-1 font-mono text-xs break-words">{m.turn.suggestedTask}</p>
                  <button
                    type="button"
                    onClick={() => onUseTask(m.turn!.suggestedTask)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Sparkles className="size-3.5" />
                    {t("chat.useTask")}
                  </button>
                </div>
              )}

              {m.turn?.nextStep && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="label-caps">{t("chat.nextStep")}</span> — {m.turn.nextStep}
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            {t("chat.thinking")}
            <span className="font-mono">{provider.primaryModel}</span>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs break-words text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          disabled={!ready}
          placeholder={ready ? t("chat.placeholder") : t("chat.needProvider")}
          className="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-ring disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!ready || busy || input.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t("chat.send")}
        </button>
      </div>
    </section>
  );
}

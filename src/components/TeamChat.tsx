import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessagesSquare, Sparkles } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

/**
 * Conversation with the Project Manager agent.
 *
 * The human describes the idea; the manager asks questions, then hands the
 * agreed task to the rest of the team automatically when told to.
 */
export function TeamChat() {
  const { messages, chatBusy, sendMessage, clearChat, pipeline, runPipeline } = useWorkspace();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, chatBusy]);

  const lastSuggested = [...messages].reverse().find((m) => m.suggestedTask)?.suggestedTask;

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    await sendMessage(value);
  }

  return (
    <section className="panel flex min-h-[60vh] flex-col p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <MessagesSquare className="size-4 text-primary" />
          <h2 className="text-base font-semibold">مدير المشروع</h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            مسح المحادثة
          </button>
        )}
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        قول لي الفكرة ديالك بلغتك. غادي نسولك شي أسئلة، ومنين نتفاهمو قول لي «عطيها للمهندس» وأنا
        نمشي بيها للفريق كامل: المهندس، المبرمج، المراجعة، ومن بعد GitHub.
      </p>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pe-1">
        {messages.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            ابدا الحديث: مثلا «بغيت نزيد صفحة تسجيل الدخول للمشروع ديالي».
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ms-auto max-w-[85%] rounded-lg bg-primary/15 px-3.5 py-2.5"
                : "me-auto max-w-[92%] rounded-lg border border-border bg-surface/60 px-3.5 py-2.5"
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {m.role === "user" ? "أنت" : (m.agent ?? "الفريق")}
              </span>
              {m.model && (
                <span className="rounded border border-border px-1.5 py-0.5 font-mono" dir="ltr">
                  {m.model}
                </span>
              )}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>

            {m.questions && m.questions.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {m.questions.map((q, i) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            )}

            {m.suggestedTask && (
              <div className="mt-2.5 rounded-md border border-border bg-background/50 p-2.5">
                <div className="text-[0.7rem] text-muted-foreground">المهمة المقترحة</div>
                <div className="mt-1 text-sm">{m.suggestedTask}</div>
                <button
                  disabled={pipeline.running}
                  onClick={() => runPipeline(m.suggestedTask!)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Sparkles className="size-3.5" />
                  سلّمها للفريق
                </button>
              </div>
            )}
          </div>
        ))}

        {(chatBusy || pipeline.running) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            {chatBusy ? "المدير كيفكر…" : "الفريق خدّام…"}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-4 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="اكتب هنا…"
          className="flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <button
          onClick={submit}
          disabled={chatBusy || !text.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="size-4" />
          أرسل
        </button>
      </div>

      {lastSuggested && !pipeline.running && (
        <p className="mt-2 text-xs text-muted-foreground">
          نصيحة: كتب «عطيها للمهندس» وأنا نبدا الخدمة أوتوماتيكيًا.
        </p>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageSquare, Sparkles, Rocket } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

/**
 * Project Manager conversation.
 *
 * The human discusses the idea; once they agree, telling the manager to hand it
 * over ("عطيها للمهندس", "ابدأ"…) starts the automatic agent pipeline.
 */
export function TeamChat() {
  const ws = useWorkspace();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ws.messages.length, ws.chatBusy]);

  async function send(value?: string) {
    const content = (value ?? text).trim();
    if (!content) return;
    setText("");
    await ws.sendMessage(content);
  }

  const busy = ws.chatBusy || ws.pipeline.running;

  return (
    <section className="panel flex h-[70vh] min-h-[520px] flex-col p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="size-4 text-primary" />
          <h2 className="text-base font-semibold">مدير المشروع</h2>
        </div>
        <div className="flex items-center gap-2">
          {ws.pipeline.running && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.7rem] text-primary">
              <Loader2 className="size-3 animate-spin" />
              الفريق كيخدم…
            </span>
          )}
          {ws.messages.length > 0 && (
            <button
              onClick={ws.clearChat}
              className="rounded-md border border-border px-2 py-1 text-[0.7rem] text-muted-foreground hover:text-foreground"
            >
              مسح المحادثة
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto py-4 pe-1">
        {ws.messages.length === 0 && (
          <div className="rounded-md border border-border bg-surface/60 p-4 text-sm leading-7 text-muted-foreground">
            سلام! أنا مدير المشروع.
            <br />
            قول لي شنو بغيتي تصاوب فالمشروع ديالك، غادي نسولك شي أسئلة باش نفهم مزيان.
            <br />
            ملي نتفاهمو، غير قول لي «عطيها للمهندس» وأنا نسلّم الخدمة للفريق: المهندس، المبرمج،
            المراجعة، ومدير Git — كلشي أوتوماتيك.
          </div>
        )}

        {ws.messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ms-auto max-w-[85%] rounded-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground"
                : "max-w-[92%] rounded-md border border-border bg-surface/60 px-3.5 py-2.5 text-sm"
            }
          >
            {m.role === "assistant" && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[0.68rem] text-muted-foreground">
                <span className="font-semibold text-foreground">{m.agent ?? "مدير المشروع"}</span>
                {m.model && (
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono">
                    {m.model}
                  </span>
                )}
              </div>
            )}
            <p className="whitespace-pre-wrap leading-7">{m.content}</p>

            {m.questions && m.questions.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-border pt-2 text-[0.8rem] text-muted-foreground">
                {m.questions.map((q, i) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            )}

            {m.suggestedTask && (
              <div className="mt-3 rounded-md border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                  <Sparkles className="size-3 text-primary" />
                  المهمة المقترحة
                </div>
                <p className="mt-1 text-[0.82rem] leading-6">{m.suggestedTask}</p>
                <button
                  onClick={() => ws.runPipeline(m.suggestedTask!)}
                  disabled={busy}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Rocket className="size-3.5" />
                  عطيها للفريق
                </button>
              </div>
            )}
          </div>
        ))}

        {ws.chatBusy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            المدير كيفكر…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="اكتب هنا… مثال: بغيت نزيد صفحة تسجيل الدخول"
          className="min-h-[46px] flex-1 resize-none rounded-md border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send className="size-4" />
          أرسل
        </button>
      </div>
    </section>
  );
}

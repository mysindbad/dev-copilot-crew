/**
 * AI Agent panel — mode selector (Ask/Plan/Build/Fix/Review) + chat interface
 * that reuses the existing workspace conversation and pipeline. Agent events
 * come from the real activity feed, never simulated.
 */
import { useState, useRef, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace";
import { useActivity } from "@/lib/activity";
import { AGENT_MODES, type AgentMode } from "@/lib/agent-modes";
import { arabize } from "@/lib/ar";
import {
  MessageSquare, ListChecks, Hammer, Wrench, ShieldCheck,
  Send, Loader2, User, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const MODE_ICONS: Record<string, typeof MessageSquare> = {
  MessageSquare, ListChecks, Hammer, Wrench, ShieldCheck,
};

const QUICK_PROMPTS: Record<AgentMode, string[]> = {
  ask: ["Analyze this project", "Explain the architecture", "What does this file do?"],
  plan: ["Add authentication", "Plan a new feature", "Refactor the API layer"],
  build: ["Add a dark mode toggle", "Create a new component", "Fix the navigation"],
  fix: ["Fix the build", "Fix TypeScript errors", "Fix failing tests"],
  review: ["Review current changes", "Check for security issues", "Review code quality"],
};

export function AgentPanel() {
  const { messages, chatBusy, sendMessage, pipeline, runPipeline } = useWorkspace();
  const { entries } = useActivity();
  const [mode, setMode] = useState<AgentMode>("build");
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, entries]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || chatBusy) return;
    setInput("");
    if (mode === "build" || mode === "fix") {
      await runPipeline(text);
    } else {
      await sendMessage(text);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Mode selector */}
      <div className="flex items-center gap-1 border-b border-border p-2">
        {AGENT_MODES.map((m) => {
          const Icon = MODE_ICONS[m.icon] ?? MessageSquare;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                mode === m.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
              title={m.description}
            >
              <Icon className="size-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Active mode description */}
      <div className="border-b border-border bg-secondary/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        {AGENT_MODES.find((m) => m.id === mode)?.description}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Bot className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Ask the agent to analyze, plan, or build.</p>
            <div className="flex flex-col gap-1.5">
              {QUICK_PROMPTS[mode].map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary",
                  )}
                >
                  {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user" ? "bg-primary/10" : "bg-secondary/60",
                  )}
                >
                  {msg.agent && msg.role === "assistant" && (
                    <div className="mb-0.5 text-[10px] font-medium text-primary">{msg.agent}</div>
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  {msg.model && (
                    <div className="mt-1 text-[10px] text-muted-foreground/60 font-mono">{msg.model}</div>
                  )}
                </div>
              </div>
            ))}

            {/* Agent activity entries */}
            {entries.length > 0 && (
              <div className="space-y-1 border-t border-border pt-2">
                <div className="text-[10px] font-medium uppercase text-muted-foreground/60">Agent Activity</div>
                {entries.slice(0, 15).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    {e.state === "running" ? (
                      <Loader2 className="size-3 animate-spin text-amber-500" />
                    ) : e.state === "done" ? (
                      <div className="size-3 text-green-500">✓</div>
                    ) : (
                      <div className="size-3 text-red-500">✗</div>
                    )}
                    <span className="font-medium text-muted-foreground">{e.agent}</span>
                    <span className="text-muted-foreground/80">{arabize(e.action)}</span>
                    {e.detail && <span className="text-muted-foreground/60">— {arabize(e.detail)}</span>}
                  </div>
                ))}
              </div>
            )}

            {pipeline.running && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                <Loader2 className="size-4 animate-spin" />
                {pipeline.phase} — {pipeline.note || "working..."}
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSubmit())}
            placeholder={`Ask in ${mode} mode...`}
            disabled={chatBusy || pipeline.running}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!input.trim() || chatBusy || pipeline.running}
            className="h-9"
          >
            {chatBusy || pipeline.running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

type Tone = "ok" | "fail" | "idle" | "warn";

const toneClass: Record<Tone, string> = {
  ok: "bg-success/12 text-success border-success/30",
  fail: "bg-destructive/12 text-destructive border-destructive/30",
  warn: "bg-warning/12 text-warning border-warning/30",
  idle: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.68rem] tracking-wider uppercase",
        toneClass[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

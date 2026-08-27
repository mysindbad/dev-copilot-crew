import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ActivityState = "running" | "done" | "failed";

export interface ActivityEntry {
  id: string;
  /** Human-readable agent name (already localized by the caller). */
  agent: string;
  /** What the agent is doing right now, localized. */
  action: string;
  /** Model actually used, when known — e.g. "gemini-3-flash-preview". */
  model?: string;
  detail?: string;
  state: ActivityState;
  at: string;
}

interface Ctx {
  entries: ActivityEntry[];
  /** Log a step; returns an id you can pass to `finish`. */
  log: (e: Omit<ActivityEntry, "id" | "at">) => string;
  finish: (id: string, patch: Partial<Omit<ActivityEntry, "id" | "at">>) => void;
  clear: () => void;
}

const ActivityContext = createContext<Ctx | null>(null);

const MAX = 60;

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  const log = useCallback((e: Omit<ActivityEntry, "id" | "at">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEntries((prev) =>
      [{ ...e, id, at: new Date().toISOString() }, ...prev].slice(0, MAX),
    );
    return id;
  }, []);

  const finish = useCallback(
    (id: string, patch: Partial<Omit<ActivityEntry, "id" | "at">>) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [],
  );

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo<Ctx>(() => ({ entries, log, finish, clear }), [entries, log, finish, clear]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): Ctx {
  const ctx = useContext(ActivityContext);
  if (ctx) return ctx;
  return { entries: [], log: () => "", finish: () => {}, clear: () => {} };
}

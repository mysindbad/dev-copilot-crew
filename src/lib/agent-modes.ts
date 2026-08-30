/**
 * Agent mode definitions for the workspace.
 *
 * Modes control how the agent responds to user requests — from read-only
 * analysis to full autonomous development. The active mode is visible in the
 * UI and influences how the pipeline is invoked.
 */
export type AgentMode = "ask" | "plan" | "build" | "fix" | "review";

export interface AgentModeDef {
  id: AgentMode;
  label: string;
  description: string;
  modifies: boolean;
  icon: string;
}

export const AGENT_MODES: AgentModeDef[] = [
  {
    id: "ask",
    label: "Ask",
    description: "Analyze and answer without modifying files.",
    modifies: false,
    icon: "MessageSquare",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Create an implementation plan without editing.",
    modifies: false,
    icon: "ListChecks",
  },
  {
    id: "build",
    label: "Build",
    description: "Allow file modifications and development commands.",
    modifies: true,
    icon: "Hammer",
  },
  {
    id: "fix",
    label: "Fix",
    description: "Focus on diagnostics, build failures, and repairs.",
    modifies: true,
    icon: "Wrench",
  },
  {
    id: "review",
    label: "Review",
    description: "Review current changes without modifying them.",
    modifies: false,
    icon: "ShieldCheck",
  },
];

export const AGENT_MODE_MAP: Record<AgentMode, AgentModeDef> = Object.fromEntries(
  AGENT_MODES.map((m) => [m.id, m]),
) as Record<AgentMode, AgentModeDef>;

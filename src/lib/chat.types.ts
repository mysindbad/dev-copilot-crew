/**
 * Team Lead conversational agent contracts.
 *
 * The Team Lead is a READ-ONLY conversational agent. It discusses the project
 * with the human in plain language, asks clarifying questions and turns the
 * discussion into a concrete task for the Architect. It never writes files,
 * never commits and never receives credentials.
 */

import type { ProviderId } from "./architect.types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAttempt {
  provider: ProviderId;
  model: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export type ChatIntent = "conversation" | "inspect" | "plan" | "implement";

export interface ChatTurn {
  /** The action implied by the whole conversation, not keyword matching. */
  intent: ChatIntent;
  reply: string;
  questions: string[];
  suggestedTask: string;
  nextStep: string;
  provider: ProviderId;
  model: string;
  usedFallback: boolean;
  ms: number;
  at: string;
}

export interface ChatResult {
  ok: boolean;
  turn?: ChatTurn;
  error?: string;
  errorKind?: "no_provider" | "provider_error" | "rate_limit" | "bad_output" | "unknown";
  attempts: ChatAttempt[];
}

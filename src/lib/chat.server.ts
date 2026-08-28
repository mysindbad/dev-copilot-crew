import { callLlm, hasProviderKey, redact } from "./llm.server";
import type { ProviderId } from "./architect.types";
import type { ChatAttempt, ChatMessage, ChatResult, ChatTurn } from "./chat.types";

export interface ChatInput {
  messages: ChatMessage[];
  language: "ar" | "en";
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
  primaryProvider: ProviderId;
  primaryModel: string;
  /** Other real models on the SAME provider, tried in order if the primary is busy. */
  backupModels?: string[];
  fallbackProvider: ProviderId | "none";
  fallbackModel: string;
}

function systemPrompt(language: "ar" | "en"): string {
  const langRule =
    language === "ar"
      ? [
          "جاوب دائماً بالعربية/الدارجة المغربية المبسطة، بأسلوب إنسان خبير كيهضر مع صاحبو.",
          "استعمل جمل قصيرة وواضحة، وعناوين ونقاط ملي يكون الجواب طويل.",
          "بلا مصطلحات تقنية معقدة؛ إلا كانت ضرورية، فسّرها بكلمة بسيطة.",
        ].join(" ")
      : "Answer in clear, friendly, expert English. Short sentences, bullets when long.";
  return [
    "You are the Team Lead of a multi-agent AI software development team, and also the user's personal senior engineer and advisor.",
    "Talk like a smart, warm, experienced human colleague: direct, concrete, opinionated. Give a real recommendation, not a menu of options.",
    "",
    "SCOPE:",
    "- Answer ANY question the human asks — general knowledge, programming, career, ideas, comparisons, explanations — not only questions about their repository. Never refuse just because it is off-topic.",
    "- Use your own knowledge freely for general questions. Say clearly when something may have changed recently or when you are unsure.",
    "- For facts ABOUT THIS repository, use ONLY the PROJECT FACTS block. Never invent files, frameworks, or numbers. If a repo fact is missing, say it is unknown.",
    "",
    "BEHAVIOUR:",
    "- You are READ-ONLY: you never write files, never commit, never run commands. The Architect/Coder/Reviewer agents do that after the human approves.",
    "- Be substantive: explain the why, give examples, and end with a clear recommendation or next action.",
    "- Ask a clarifying question ONLY when you truly cannot proceed — at most 2, short. Otherwise ask none and just answer.",
    "- Never ask the human about the project type, language, framework, stack, or file list; those come from the audit. If the audit is missing, tell them to run the repository inspection.",
    "- Never repeat a question you already asked. If the human repeats himself or says the answer is in the repo, stop asking and formulate the task.",
    "- A broad request like 'audit everything and fix the errors' is a VALID task.",
    "- Match the human's tone; be encouraging, never robotic, never a template.",
    langRule,
    "",
    "Reply ONLY with a JSON object of this exact shape (no markdown fence):",
    '{"reply": string, "questions": string[], "suggestedTask": string, "nextStep": string}',
    "reply = your full conversational answer (can be several paragraphs; use \\n for line breaks).",
    "questions = clarifying questions, usually empty.",
    "suggestedTask = one English sentence describing the concrete engineering task, ONLY when the human wants work done on the repository; otherwise empty string.",
    "nextStep = the single next action the human should take in the app (empty if the answer was just a discussion).",
  ].join("\n");
}


function contextBlock(c: ChatInput["context"]): string {
  return [
    "PROJECT FACTS (ground truth):",
    `repository: ${c.repository || "UNKNOWN"}`,
    `branch: ${c.branch || "UNKNOWN"}`,
    `audited commit: ${c.commitSha || "UNKNOWN (repository not inspected yet)"}`,
    `files in audit: ${c.fileCount || "UNKNOWN"}`,
    `detected stack: ${c.stack.length ? c.stack.join(", ") : "UNKNOWN"}`,
    `entry points: ${c.entryPoints.length ? c.entryPoints.join(", ") : "UNKNOWN"}`,
    `api routes detected: ${c.apiRoutes}`,
    `current architect plan: ${c.planSummary || "none"}`,
    `current staged change set: ${c.changeSetSummary || "none"}`,
    `review gate: ${c.reviewGate || "not reviewed"}`,
  ].join("\n");
}

function transcript(messages: ChatMessage[]): string {
  return messages
    .slice(-14)
    .map((m) => `${m.role === "user" ? "HUMAN" : "TEAM LEAD"}: ${m.content}`)
    .join("\n\n");
}

function parseTurn(raw: string): Omit<ChatTurn, "provider" | "model" | "usedFallback" | "ms" | "at"> | null {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const reply = typeof obj["reply"] === "string" ? obj["reply"].trim() : "";
    if (!reply) return null;
    const questions = Array.isArray(obj["questions"])
      ? (obj["questions"] as unknown[]).filter((q): q is string => typeof q === "string").slice(0, 4)
      : [];
    return {
      reply,
      questions,
      suggestedTask: typeof obj["suggestedTask"] === "string" ? obj["suggestedTask"].trim() : "",
      nextStep: typeof obj["nextStep"] === "string" ? obj["nextStep"].trim() : "",
    };
  } catch {
    return null;
  }
}

export async function runTeamLeadTurn(input: ChatInput): Promise<ChatResult> {
  const attempts: ChatAttempt[] = [];
  const candidates: { provider: ProviderId; model: string; fallback: boolean }[] = [];
  if (input.primaryModel) {
    candidates.push({ provider: input.primaryProvider, model: input.primaryModel, fallback: false });
    for (const m of input.backupModels ?? []) {
      if (m && m !== input.primaryModel) {
        candidates.push({ provider: input.primaryProvider, model: m, fallback: true });
      }
    }
  }
  if (input.fallbackProvider !== "none" && input.fallbackModel) {
    candidates.push({ provider: input.fallbackProvider, model: input.fallbackModel, fallback: true });
  }
  if (candidates.length === 0) {
    return { ok: false, error: "No provider/model selected.", errorKind: "no_provider", attempts };
  }

  const system = systemPrompt(input.language);
  const user = [contextBlock(input.context), "", "CONVERSATION:", transcript(input.messages)].join("\n");

  let lastError = "The Team Lead could not answer.";
  let lastKind: ChatResult["errorKind"] = "unknown";

  for (const c of candidates) {
    if (!hasProviderKey(c.provider)) {
      attempts.push({
        provider: c.provider,
        model: c.model,
        ok: false,
        detail: `${c.provider.toUpperCase()} API key is not configured.`,
        ms: 0,
      });
      lastError = `${c.provider.toUpperCase()} API key is not configured.`;
      lastKind = "no_provider";
      continue;
    }
    const started = Date.now();
    // Chat must stay responsive: do not retry the same busy model. The loop
    // below moves to one of the already validated backup models instead.
    const res = await callLlm(c.provider, c.model, system, user, {
      maxAttempts: 1,
      // Reasoning models often need more than 35s for the first token.
      timeoutMs: 90_000,
    });
    const ms = Date.now() - started;
    if (!res.ok || !res.text) {
      attempts.push({
        provider: c.provider,
        model: c.model,
        ok: false,
        detail: redact(res.error ?? "Provider error."),
        ms,
      });
      lastError = redact(res.error ?? "Provider error.");
      lastKind = res.status === 429 ? "rate_limit" : "provider_error";
      continue;
    }
    const parsed = parseTurn(res.text);
    if (!parsed) {
      attempts.push({
        provider: c.provider,
        model: c.model,
        ok: false,
        detail: "The model returned an unreadable answer.",
        ms,
      });
      lastError = "The model returned an unreadable answer.";
      lastKind = "bad_output";
      continue;
    }
    attempts.push({ provider: c.provider, model: c.model, ok: true, detail: "answered", ms });
    return {
      ok: true,
      attempts,
      turn: {
        ...parsed,
        provider: c.provider,
        model: c.model,
        usedFallback: c.fallback,
        ms,
        at: new Date().toISOString(),
      },
    };
  }

  const tried = attempts.map((attempt) => attempt.model).join("، ");
  return {
    ok: false,
    error: `${lastError}${tried ? ` النماذج اللي تجرّبات: ${tried}.` : ""}`,
    errorKind: lastKind,
    attempts,
  };
}

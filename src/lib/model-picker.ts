import type { ProviderId } from "./architect.types";

/**
 * Automatic model selection.
 *
 * The Project Manager picks the model itself: it lists the models that are
 * REALLY available on the connected provider (live API listing), keeps the
 * free ones first, and scores them against the kind of work requested.
 * Nothing here invents a model name — only names returned by the provider are
 * ever considered.
 */

export type TaskKind = "chat" | "plan" | "code" | "review";

export interface ModelPick {
  model: string;
  free: boolean;
  reason: string;
}

/** OpenRouter and Hugging Face mark free routes with a ":free" suffix. */
function isFree(provider: ProviderId, model: string): boolean {
  if (provider === "openrouter" || provider === "huggingface") return model.endsWith(":free");
  // Gemini, Groq, and Mistral free tiers depend on the account and quota. A
  // model name alone does not prove that the request is free.
  return false;
}

function score(provider: ProviderId, model: string, kind: TaskKind): number {
  const m = model.toLowerCase();
  let s = 0;
  // Gemini may still list legacy models that reject requests from new users.
  // Never select the retired 2.5 Flash route even when it appears in /models.
  if (provider === "gemini" && /^gemini-2\.5-flash(?:-|$)/.test(m)) return -1000;
  if (isFree(provider, model)) s += 100;
  if (/deprecated|vision-only|embedding|imagen|tts|audio|image/.test(m)) return -1000;
  if (/preview|exp\b|experimental/.test(m)) s -= 5;

  // Prefer the newest callable Gemini generation instead of relying on the
  // provider's alphabetical model-list order.
  if (provider === "gemini" || provider === "lovable") {
    if (/gemini-3\.7/.test(m)) s += 90;
    else if (/gemini-3\.6/.test(m)) s += 80;
    else if (/gemini-3\.5/.test(m)) s += 70;
    else if (/gemini-3\.1/.test(m)) s += 60;
    else if (/gemini-3(?:-|\.)/.test(m)) s += 40;
  }

  const heavy = kind === "code" || kind === "plan";
  if (heavy) {
    if (/pro|coder|deepseek|qwen.*(coder|72b|235b)|llama.*70b|sonnet|3\.5-flash|3-flash/.test(m))
      s += 30;
    if (/lite|nano|mini|8b|4b|1b/.test(m)) s -= 20;
  } else {
    if (/flash|lite|mini|fast/.test(m)) s += 15;
  }
  if (/gemini-\d/.test(m)) s += 8;
  if (/2\.0|2\.5|3\./.test(m)) s += 6;
  return s;
}

/** All usable REAL models, best first. */
export function rankModels(
  provider: ProviderId,
  models: string[],
  kind: TaskKind,
): ModelPick[] {
  const kindAr =
    kind === "code"
      ? "كتابة الكود"
      : kind === "plan"
        ? "التخطيط"
        : kind === "review"
          ? "المراجعة"
          : "الحوار";
  return models
    .map((model) => ({ model, s: score(provider, model, kind), free: isFree(provider, model) }))
    .filter((r) => r.s > -1000)
    .sort((a, b) => b.s - a.s)
    .map((r) => ({
      model: r.model,
      free: r.free,
      reason: `اخترت «${r.model}» لأنه ${provider === "lovable" ? "مدمج فالتطبيق وما كيحتاجش مفتاح" : r.free ? "موسوم كمجاني عند المزوّد" : "متاح ومناسب"} لـ${kindAr}.`,
    }));
}

/** Choose the best REAL model for a task, free models first. */
export function pickModel(
  provider: ProviderId,
  models: string[],
  kind: TaskKind,
): ModelPick | null {
  return rankModels(provider, models, kind)[0] ?? null;
}

/** Kind of work implied by the human's request, used to size the model. */
export function taskKind(text: string): TaskKind {
  if (/(كود|برمج|عدّل|عدل|أضف|اضف|صاوب|implement|code|fix|bug)/i.test(text)) return "code";
  return "plan";
}

/** Verified places where a free key can be created. */
export const KEY_SOURCES = {
  gemini: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/settings/keys",
  github: "https://github.com/settings/tokens",
  groq: "https://console.groq.com/keys",
  mistral: "https://console.mistral.ai/api-keys",
  huggingface: "https://huggingface.co/settings/tokens",
} as const;

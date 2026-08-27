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

/** OpenRouter marks free routes with a ":free" suffix. */
function isFree(provider: "gemini" | "openrouter", model: string): boolean {
  if (provider === "openrouter") return model.endsWith(":free");
  // Google's Gemini API has a free tier; the flash / flash-lite family is the
  // part of it that is free to call with a personal API key.
  return /flash/i.test(model);
}

function score(provider: "gemini" | "openrouter", model: string, kind: TaskKind): number {
  const m = model.toLowerCase();
  let s = 0;
  if (isFree(provider, model)) s += 100;
  if (/deprecated|vision-only|embedding|imagen|tts|audio|image/.test(m)) return -1000;
  if (/preview|exp\b|experimental/.test(m)) s -= 5;

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

/** Choose the best REAL model for a task, free models first. */
export function pickModel(
  provider: "gemini" | "openrouter",
  models: string[],
  kind: TaskKind,
): ModelPick | null {
  const ranked = models
    .map((model) => ({ model, s: score(provider, model, kind), free: isFree(provider, model) }))
    .filter((r) => r.s > -1000)
    .sort((a, b) => b.s - a.s);
  const best = ranked[0];
  if (!best) return null;
  const kindAr =
    kind === "code" ? "كتابة الكود" : kind === "plan" ? "التخطيط" : kind === "review" ? "المراجعة" : "الحوار";
  return {
    model: best.model,
    free: best.free,
    reason: `اخترت «${best.model}» لأنه ${best.free ? "مجاني" : "المتاح الوحيد المناسب"} ومناسب لـ${kindAr}.`,
  };
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
} as const;

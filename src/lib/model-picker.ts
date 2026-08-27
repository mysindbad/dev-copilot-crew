/**
 * Automatic model selection.
 *
 * The Project Manager never invents model names: it only ranks the model ids
 * that the provider actually returned for the user's own key, and prefers free
 * models. Selection is per role, because planning/coding need a stronger model
 * than a short chat answer.
 */

export type AgentRole = "chat" | "plan" | "code" | "review";

export interface PickedModel {
  model: string;
  reason: string;
}

function isFree(id: string): boolean {
  return id.endsWith(":free") || /gemini/i.test(id);
}

function geminiScore(id: string, role: AgentRole): number {
  let s = 0;
  const m = id.toLowerCase();
  if (/preview|exp|latest-tuning|tts|embedding|aqa|image|vision-only/.test(m)) s -= 20;
  if (/embedding|imagen|veo|tts|aqa/.test(m)) s -= 200; // not text chat models
  const version = /(\d+(?:\.\d+)?)/.exec(m)?.[1];
  if (version) s += Math.min(Number(version), 5) * 6;
  if (/pro/.test(m)) s += role === "chat" ? 4 : 14;
  if (/flash/.test(m)) s += role === "chat" ? 14 : 8;
  if (/lite/.test(m)) s += role === "chat" ? 6 : -6;
  return s;
}

function openRouterScore(id: string, role: AgentRole): number {
  let s = isFree(id) ? 40 : -60; // free models only, unless nothing else exists
  const m = id.toLowerCase();
  if (/coder|code/.test(m)) s += role === "code" ? 18 : 4;
  if (/instruct|chat/.test(m)) s += 6;
  if (/70b|72b|405b|large/.test(m)) s += role === "chat" ? 4 : 12;
  if (/8b|7b|3b|mini|small/.test(m)) s += role === "chat" ? 8 : -4;
  if (/vision|image|audio|embed/.test(m)) s -= 40;
  return s;
}

export function pickModel(
  provider: "gemini" | "openrouter",
  models: string[],
  role: AgentRole,
): PickedModel | null {
  const usable = models.filter((m) => !/embedding|imagen|veo|tts|whisper/i.test(m));
  const pool = usable.length ? usable : models;
  if (pool.length === 0) return null;
  const scored = pool
    .map((model) => ({
      model,
      score: provider === "gemini" ? geminiScore(model, role) : openRouterScore(model, role),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0]!;
  const free = isFree(best.model);
  return {
    model: best.model,
    reason: free
      ? `اخترت «${best.model}» — مجاني ومناسب لهذه المهمة.`
      : `اخترت «${best.model}» — ما لقيتش نموذج مجاني مناسب عند هذا المزوّد.`,
  };
}

/** Where the human can get a free key, when a provider has none. */
export const KEY_SOURCES: Record<"gemini" | "openrouter" | "github", { url: string; note: string }> = {
  gemini: {
    url: "https://aistudio.google.com/apikey",
    note: "مفتاح Gemini مجاني من Google AI Studio",
  },
  openrouter: {
    url: "https://openrouter.ai/keys",
    note: "مفتاح OpenRouter (فيه نماذج مجانية تنتهي بـ :free)",
  },
  github: {
    url: "https://github.com/settings/tokens",
    note: "توكن GitHub بصلاحية repo باش نقدرو نصاوبو فرع و Pull Request",
  },
};

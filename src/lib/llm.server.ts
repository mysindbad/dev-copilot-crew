import { getSecret } from "./secrets.server";
import type { ProviderId } from "./architect.types";

/**
 * Minimal, credential-safe LLM caller.
 * API keys are read from process.env inside this server-only module and are
 * never returned, logged, or embedded in prompts.
 */

export interface LlmCallResult {
  ok: boolean;
  text?: string;
  status?: number;
  error?: string;
}

/** Remove anything that could resemble a credential from a provider message. */
export function redact(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9\-_]{10,}/g, "[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]")
    .slice(0, 400);
}

export function hasProviderKey(provider: ProviderId): boolean {
  return provider === "gemini"
    ? Boolean(getSecret("GEMINI_API_KEY"))
    : Boolean(getSecret("OPENROUTER_API_KEY"));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call a provider model. Transient overload/rate-limit answers (503, 429)
 * are retried once after a short wait before the caller falls back to
 * another model.
 */
export async function callLlm(
  provider: ProviderId,
  model: string,
  system: string,
  user: string,
): Promise<LlmCallResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callLlmOnce(provider, model, system, user);
    const transient = res.status === 503 || res.status === 429 || (res.status ?? 0) >= 500;
    if (res.ok || !transient || attempt === 1) return res;
    await sleep(4000);
  }
  return { ok: false, error: "unreachable" };
}

async function callLlmOnce(
  provider: ProviderId,
  model: string,
  system: string,
  user: string,
): Promise<LlmCallResult> {
  try {
    if (provider === "gemini") {
      const key = getSecret("GEMINI_API_KEY");
      if (!key) return { ok: false, error: "GEMINI_API_KEY is not configured." };
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 404 && /no longer available/i.test(body)) {
          return {
            ok: false,
            status: res.status,
            error: `النموذج ${model} توقف عند Google. اختَر نموذجًا حديثًا مثل gemini-3.6-flash.`,
          };
        }
        return { ok: false, status: res.status, error: redact(`Gemini ${res.status}: ${body}`) };
      }
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!text) return { ok: false, status: res.status, error: "Gemini returned no content." };
      return { ok: true, text, status: res.status };
    }

    const key = getSecret("OPENROUTER_API_KEY");
    if (!key) return { ok: false, error: "OPENROUTER_API_KEY is not configured." };
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, error: redact(`OpenRouter ${res.status}: ${body}`) };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text)
      return {
        ok: false,
        status: res.status,
        error: redact(json.error?.message ?? "OpenRouter returned no content."),
      };
    return { ok: true, text, status: res.status };
  } catch (error) {
    return { ok: false, error: redact(error instanceof Error ? error.message : "Network error.") };
  }
}

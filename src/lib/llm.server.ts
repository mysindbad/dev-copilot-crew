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

export interface LlmCallOptions {
  /** Conversational requests should fail over quickly instead of blocking the UI. */
  maxAttempts?: 1 | 2;
  timeoutMs?: number;
  /** Higher values make the answer sound more human/conversational. */
  temperature?: number;
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
  if (provider === "lovable") return Boolean(process.env["LOVABLE_API_KEY"]);
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
  options: LlmCallOptions = {},
): Promise<LlmCallResult> {
  const maxAttempts = options.maxAttempts ?? 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await callLlmOnce(
      provider,
      model,
      system,
      user,
      options.timeoutMs ?? 35_000,
      options.temperature ?? 0.2,
    );
    const transient =
      res.status === 503 || res.status === 429 || res.status === 524 || (res.status ?? 0) >= 500;
    if (res.ok || !transient || attempt === maxAttempts - 1) return res;
    await sleep(4000);
  }
  return { ok: false, error: "unreachable" };
}

async function callLlmOnce(
  provider: ProviderId,
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
  temperature: number,
): Promise<LlmCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (provider === "lovable") {
      const key = process.env["LOVABLE_API_KEY"];
      if (!key) return { ok: false, error: "Lovable AI is not configured." };
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature,

          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        const friendly =
          res.status === 402
            ? "نفدات أرصدة الذكاء الاصطناعي ديال المساحة. زيد أرصدة من إعدادات Lovable."
            : res.status === 429
              ? "تجاوزنا حد الاستعمال مؤقتًا. استنى شوية وعاود."
              : redact(`Lovable AI ${res.status}: ${body}`);
        return { ok: false, status: res.status, error: friendly };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) return { ok: false, status: res.status, error: "Lovable AI returned no content." };
      return { ok: true, text, status: res.status };
    }

    if (provider === "gemini") {
      const key = getSecret("GEMINI_API_KEY");
      if (!key) return { ok: false, error: "GEMINI_API_KEY is not configured." };
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          signal: controller.signal,
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
      signal: controller.signal,
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
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 524, error: `انتهت مهلة النموذج ${model} بعد ${Math.round(timeoutMs / 1000)} ثانية.` };
    }
    return { ok: false, error: redact(error instanceof Error ? error.message : "Network error.") };
  } finally {
    clearTimeout(timeout);
  }
}

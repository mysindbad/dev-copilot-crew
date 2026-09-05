import { z } from "zod";

/**
 * Client-side holder for user-supplied credentials.
 *
 * Keys are entered by the user in the in-app Secrets panel, kept in this
 * memory for the current browser session and attached to server-function calls
 * so the server can use them for that request. They are never persisted, rendered
 * in clear text, or sent anywhere except this app's own server functions.
 */

export const SecretsPayload = z
  .object({
    GITHUB_TOKEN: z.string().max(500).optional(),
    GEMINI_API_KEY: z.string().max(500).optional(),
    OPENROUTER_API_KEY: z.string().max(500).optional(),
    GROQ_API_KEY: z.string().max(500).optional(),
    MISTRAL_API_KEY: z.string().max(500).optional(),
    HF_API_KEY: z.string().max(500).optional(),
  })
  .optional();

export type UserSecrets = {
  GITHUB_TOKEN?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  HF_API_KEY?: string;
};

export const SECRET_KEYS = [
  "GITHUB_TOKEN",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "HF_API_KEY",
] as const;

let cache: UserSecrets | null = null;
const listeners = new Set<() => void>();

export function getUserSecrets(): UserSecrets {
  return cache ?? {};
}

export function setUserSecrets(next: UserSecrets) {
  const clean: UserSecrets = {};
  for (const k of SECRET_KEYS) {
    const v = next[k]?.trim();
    if (v) clean[k] = v;
  }
  cache = clean;
  listeners.forEach((l) => l());
}

export function clearUserSecret(key: (typeof SECRET_KEYS)[number]) {
  const next = { ...getUserSecrets() };
  delete next[key];
  setUserSecrets(next);
}

export function subscribeUserSecrets(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Masked preview, e.g. "ghp_••••••4f2a". Never shows the full value. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

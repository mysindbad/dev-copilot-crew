import { z } from "zod";

/**
 * Client-side holder for user-supplied credentials.
 *
 * Keys are entered by the user in the in-app Secrets panel, kept in this
 * browser only (localStorage), and attached to server-function calls so the
 * server can use them for that request. They are never rendered in clear text
 * and never sent anywhere except this app's own server functions.
 */

export const SecretsPayload = z
  .object({
    GITHUB_TOKEN: z.string().max(500).optional(),
    GEMINI_API_KEY: z.string().max(500).optional(),
    OPENROUTER_API_KEY: z.string().max(500).optional(),
  })
  .optional();

export type UserSecrets = {
  GITHUB_TOKEN?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
};

export const SECRET_KEYS = ["GITHUB_TOKEN", "GEMINI_API_KEY", "OPENROUTER_API_KEY"] as const;

const STORAGE_KEY = "aidt.secrets.v1";

let cache: UserSecrets | null = null;
const listeners = new Set<() => void>();

export function getUserSecrets(): UserSecrets {
  if (cache) return cache;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as UserSecrets) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function setUserSecrets(next: UserSecrets) {
  const clean: UserSecrets = {};
  for (const k of SECRET_KEYS) {
    const v = next[k]?.trim();
    if (v) clean[k] = v;
  }
  cache = clean;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* storage unavailable — keys stay in memory for this session */
  }
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

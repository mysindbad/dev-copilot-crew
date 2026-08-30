import { z } from "zod";

/**
 * Client-side credential types and migration helpers.
 *
 * ⚠️  Credentials are NO LONGER stored in browser localStorage. The secure
 * server-side encrypted vault (vault.server.ts) is the single source of
 * truth. This module now provides:
 *
 *   - Types and the SecretsPayload schema (still accepted by server functions
 *     for backward compatibility, but normally empty).
 *   - Migration helpers to move any legacy localStorage keys to the vault.
 *
 * getUserSecrets() now returns {} — the browser never holds plaintext keys.
 */

export const SecretsPayload = z
  .object({
    GITHUB_TOKEN: z.string().max(500).optional(),
    OPENAI_API_KEY: z.string().max(500).optional(),
    ANTHROPIC_API_KEY: z.string().max(500).optional(),
    GEMINI_API_KEY: z.string().max(500).optional(),
    OPENROUTER_API_KEY: z.string().max(500).optional(),
    GROQ_API_KEY: z.string().max(500).optional(),
    MISTRAL_API_KEY: z.string().max(500).optional(),
    HF_API_KEY: z.string().max(500).optional(),
  })
  .optional();

export type UserSecrets = {
  GITHUB_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  HF_API_KEY?: string;
};

export const SECRET_KEYS = [
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "HF_API_KEY",
] as const;

const LEGACY_STORAGE_KEY = "aidt.secrets.v1";

/**
 * Returns an empty object — the browser no longer holds plaintext secrets.
 * Kept for backward compatibility with server function call sites that pass
 * `secrets: getUserSecrets()`. The server resolves secrets from the vault.
 */
export function getUserSecrets(): UserSecrets {
  return {};
}

// ── Migration helpers (read/clear legacy localStorage only) ──────────────

/**
 * Read any credentials still in localStorage from the old Phase 2 system.
 * Used ONLY for the one-time migration to the encrypted vault.
 */
export function getLegacySecrets(): UserSecrets {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserSecrets) : {};
  } catch {
    return {};
  }
}

/** True if the browser still has legacy localStorage credentials to migrate. */
export function hasLegacySecrets(): boolean {
  const legacy = getLegacySecrets();
  return SECRET_KEYS.some((k) => Boolean(legacy[k]?.trim()));
}

/** Remove all legacy credentials from localStorage after successful migration. */
export function clearLegacySecrets(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Masked preview, e.g. "ghp_••••••4f2a". Never shows the full value. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

// ── Deprecated no-ops (kept so older imports don't crash) ─────────────────
// Credentials are now managed through the server-side vault. Use the vault
// server functions (vault.functions.ts) instead of these.

/** @deprecated Use saveCredential from vault.functions.ts */
export function setUserSecrets(_next: UserSecrets): void {
  console.warn("[user-secrets] setUserSecrets is deprecated. Use the server-side vault.");
}

/** @deprecated Use removeCredential from vault.functions.ts */
export function clearUserSecret(_key: (typeof SECRET_KEYS)[number]): void {
  console.warn("[user-secrets] clearUserSecret is deprecated. Use the server-side vault.");
}

/** @deprecated Subscription is a no-op — vault state is refreshed server-side. */
export function subscribeUserSecrets(_listener: () => void): () => void {
  return () => {};
}

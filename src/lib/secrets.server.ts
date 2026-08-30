import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Credential resolution — the single source of truth for all server-side
 * secret access.
 *
 * Resolution order (first hit wins):
 *   1. Per-request override (AsyncLocalStorage) — legacy client-sent keys
 *      during migration; normally empty.
 *   2. Encrypted vault (vault.server.ts) — the primary user-supplied store.
 *   3. process.env — server-side environment variables.
 *
 * Plaintext values are never logged, never returned to the browser, and never
 * persisted outside the encrypted vault.
 */

export type SecretName =
  | "GITHUB_TOKEN"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "GEMINI_API_KEY"
  | "OPENROUTER_API_KEY"
  | "GROQ_API_KEY"
  | "MISTRAL_API_KEY"
  | "HF_API_KEY";

export type SecretOverrides = { [K in SecretName]?: string | undefined };

const store = new AsyncLocalStorage<SecretOverrides>();

export function withSecrets<T>(overrides: SecretOverrides | undefined, fn: () => Promise<T>) {
  const clean: SecretOverrides = {};
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (typeof v === "string" && v.trim()) clean[k as SecretName] = v.trim();
  }
  return store.run(clean, fn);
}

export function getSecret(name: SecretName): string | null {
  // 1. Per-request override (AsyncLocalStorage)
  const override = store.getStore()?.[name];
  if (override) return override;

  // 2. Encrypted vault
  const vaultSecret = getVaultSecret(name);
  if (vaultSecret) return vaultSecret;

  // 3. process.env
  const env = process.env[name];
  return env && env.trim() ? env : null;
}

/** Which secrets are usable for the current request, and where they came from. */
export function secretSource(name: SecretName): "user" | "vault" | "server" | "none" {
  if (store.getStore()?.[name]) return "user";
  if (getVaultSecret(name)) return "vault";
  return process.env[name] ? "server" : "none";
}

// ── Vault bridge ─────────────────────────────────────────────────────────
// Imported lazily to avoid a circular dependency at module-eval time and to
// keep the vault file optional (the app boots even if the vault volume is
// not mounted — getSecret simply skips the vault source).

let vaultGetDecrypted: ((name: SecretName) => string | null) | null = null;
let vaultHas: ((name: SecretName) => boolean) | null = null;
let vaultInit: (() => Promise<void>) | null = null;

async function ensureVaultLoaded() {
  if (!vaultGetDecrypted) {
    const mod = await import("./vault.server");
    vaultGetDecrypted = mod.getDecryptedSecret as (name: SecretName) => string | null;
    vaultHas = mod.hasVaultSecret as (name: SecretName) => boolean;
    vaultInit = mod.initVault;
  }
  if (vaultInit) {
    await vaultInit();
    vaultInit = null; // only once
  }
}

function getVaultSecret(name: SecretName): string | null {
  return vaultGetDecrypted?.(name) ?? null;
}

/** Eagerly load the vault into memory so getSecret is synchronous. */
export async function initSecrets(): Promise<void> {
  await ensureVaultLoaded();
}

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped credential overrides.
 *
 * Credentials normally come from server-side environment secrets. A user may
 * also supply their own keys through the in-app "Secrets" panel; those travel
 * with the request only, live inside this async-local store for the duration
 * of the handler, and are never logged, cached or returned to the browser.
 */

export type SecretName = "GITHUB_TOKEN" | "GEMINI_API_KEY" | "OPENROUTER_API_KEY";

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
  const override = store.getStore()?.[name];
  if (override) return override;
  const env = process.env[name];
  return env && env.trim() ? env : null;
}

/** Which secrets are usable for the current request, and where they came from. */
export function secretSource(name: SecretName): "user" | "server" | "none" {
  if (store.getStore()?.[name]) return "user";
  return process.env[name] ? "server" : "none";
}

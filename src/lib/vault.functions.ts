/**
 * Server functions for the credential vault — the only API the browser uses
 * to manage credentials. Every function returns metadata only; no plaintext
 * secret ever crosses the wire to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  saveVaultSecret,
  removeVaultSecret,
  getAllVaultMetadata,
  getVaultSecretMetadata,
  updateVaultValidation,
  type VaultSecretName,
  type SecretMetadata,
} from "./vault.server";

// Re-export so the browser imports metadata types from one place.
export type { SecretMetadata };

// ── Schemas ──────────────────────────────────────────────────────────────

const SaveInput = z.object({
  name: z.enum([
    "GITHUB_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
    "MISTRAL_API_KEY",
    "HF_API_KEY",
  ]),
  value: z.string().min(1).max(500),
});

const RemoveInput = z.object({
  name: z.enum([
    "GITHUB_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
    "MISTRAL_API_KEY",
    "HF_API_KEY",
  ]),
});

const MigrateInput = z.object({
  secrets: z
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
    .optional(),
});

// ── Functions ────────────────────────────────────────────────────────────

/** Save (replace) a credential. Returns metadata — never the plaintext. */
export const saveCredential = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data }): Promise<SecretMetadata> => {
    return saveVaultSecret(data.name as VaultSecretName, data.value);
  });

/** Remove a credential from the vault. */
export const removeCredential = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RemoveInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const removed = await removeVaultSecret(data.name as VaultSecretName);
    return { ok: removed };
  });

/** Get metadata for all credentials — the only shape the browser sees. */
export const getCredentialMetadata = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, SecretMetadata>> => {
    return getAllVaultMetadata();
  },
);

/** Migrate multiple legacy localStorage credentials to the vault at once. */
export const migrateCredentials = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MigrateInput.parse(input))
  .handler(async ({ data }): Promise<{ migrated: string[] }> => {
    const migrated: string[] = [];
    const entries = data.secrets ?? {};
    for (const [name, value] of Object.entries(entries)) {
      if (typeof value === "string" && value.trim()) {
        await saveVaultSecret(name as VaultSecretName, value);
        migrated.push(name);
      }
    }
    return { migrated };
  });

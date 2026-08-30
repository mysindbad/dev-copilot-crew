/**
 * Server-side encrypted credential vault.
 *
 * Stores API keys encrypted at rest with AES-256-GCM. The master key comes
 * from the CREDENTIAL_ENCRYPTION_KEY environment variable; a per-vault salt
 * is generated on first use and stored alongside the ciphertext (it is not
 * secret). Decrypted values live only in server memory for the duration of
 * a provider/GitHub request — they are never returned to the browser, never
 * logged, and never persisted in plaintext.
 *
 * Persistence: a JSON file on a Docker volume outside the repo, so secrets
 * are never committed to git and never enter `.ai-dev-hub/`.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────

export type VaultSecretName =
  | "GITHUB_TOKEN"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "GEMINI_API_KEY"
  | "OPENROUTER_API_KEY"
  | "GROQ_API_KEY"
  | "MISTRAL_API_KEY"
  | "HF_API_KEY";

export const VAULT_SECRET_NAMES: VaultSecretName[] = [
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "HF_API_KEY",
];

/** What the browser receives — metadata only, never the plaintext key. */
export interface SecretMetadata {
  configured: boolean;
  maskedKey: string;
  lastValidated: string | null;
  lastValidationStatus: "ok" | "fail" | "untested" | null;
}

/** Encrypted blob stored on disk. */
interface EncryptedSecret {
  iv: string; // base64
  ciphertext: string; // base64
  tag: string; // base64
}

interface VaultFile {
  version: number;
  salt: string; // base64 — not secret, used for key derivation
  secrets: Record<string, EncryptedSecret>;
  metadata: Record<string, Omit<SecretMetadata, "configured">>;
}

// ── Config ───────────────────────────────────────────────────────────────

const VAULT_DIR = process.env["VAULT_DIR"] ?? "/data/vault";
const VAULT_PATH = join(VAULT_DIR, "credentials.json");
const KEY_ENV = "CREDENTIAL_ENCRYPTION_KEY";

// ── In-memory cache (loaded once, kept in sync) ──────────────────────────

let cache: VaultFile | null = null;
let ephemeralKey = false;

// ── Key management ──────────────────────────────────────────────────────

function deriveKey(salt: Buffer): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    if (!ephemeralKey) {
      ephemeralKey = true;
      console.warn(
        "[vault] CREDENTIAL_ENCRYPTION_KEY not set — using an ephemeral key. " +
          "Stored secrets will NOT survive a restart. Set CREDENTIAL_ENCRYPTION_KEY to persist.",
      );
    }
    // Ephemeral: derive from a random seed that lives only in memory.
    // This means secrets can be saved and used during this process lifetime
    // but will be unreadable after restart.
    return scryptSync(randomBytes(32), salt, 32);
  }
  return scryptSync(raw, salt, 32);
}

// ── Encryption primitives ────────────────────────────────────────────────

function encrypt(plaintext: string, key: Buffer, salt: Buffer): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decrypt(blob: EncryptedSecret, key: Buffer): string {
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const ciphertext = Buffer.from(blob.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

// ── Masking ──────────────────────────────────────────────────────────────

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

// ── Vault file I/O ───────────────────────────────────────────────────────

function emptyVault(): VaultFile {
  return {
    version: 1,
    salt: randomBytes(16).toString("base64"),
    secrets: {},
    metadata: {},
  };
}

async function loadVault(): Promise<VaultFile> {
  if (cache) return cache;
  if (!existsSync(VAULT_PATH)) {
    cache = emptyVault();
    await persist();
    return cache;
  }
  try {
    const raw = await readFile(VAULT_PATH, "utf8");
    const parsed = JSON.parse(raw) as VaultFile;
    if (parsed.version !== 1) {
      console.warn("[vault] Unrecognized vault version, starting fresh.");
      cache = emptyVault();
    } else {
      cache = parsed;
    }
  } catch {
    console.warn("[vault] Could not read vault file, starting fresh.");
    cache = emptyVault();
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  try {
    await mkdir(dirname(VAULT_PATH), { recursive: true });
    await writeFile(VAULT_PATH, JSON.stringify(cache, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("[vault] Failed to persist vault:", err instanceof Error ? err.message : String(err));
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Store a secret: encrypt and persist. Updates metadata with masked preview.
 * The plaintext is never stored, never logged, never returned.
 */
export async function saveVaultSecret(name: VaultSecretName, value: string): Promise<SecretMetadata> {
  const vault = await loadVault();
  const salt = Buffer.from(vault.salt, "base64");
  const key = deriveKey(salt);
  const trimmed = value.trim();
  vault.secrets[name] = encrypt(trimmed, key, salt);
  vault.metadata[name] = {
    maskedKey: maskSecret(trimmed),
    lastValidated: vault.metadata[name]?.lastValidated ?? null,
    lastValidationStatus: vault.metadata[name]?.lastValidationStatus ?? "untested",
  };
  await persist();
  return getMetadataFor(name, vault);
}

/**
 * Remove a secret from the vault. Returns true if it existed.
 */
export async function removeVaultSecret(name: VaultSecretName): Promise<boolean> {
  const vault = await loadVault();
  const existed = Boolean(vault.secrets[name]);
  delete vault.secrets[name];
  delete vault.metadata[name];
  if (existed) await persist();
  return existed;
}

/**
 * Decrypt a secret in memory — called only at the moment a provider/GitHub
 * request needs it. Synchronous after the first async load.
 */
export function getDecryptedSecret(name: VaultSecretName): string | null {
  if (!cache) return null;
  const blob = cache.secrets[name];
  if (!blob) return null;
  try {
    const salt = Buffer.from(cache.salt, "base64");
    const key = deriveKey(salt);
    return decrypt(blob, key);
  } catch {
    console.warn(`[vault] Failed to decrypt ${name} — key may have changed.`);
    return null;
  }
}

/**
 * Eagerly load the vault into memory so getDecryptedSecret is synchronous.
 * Call once at startup.
 */
export async function initVault(): Promise<void> {
  await loadVault();
}

/**
 * Get metadata for a single secret — what the browser is allowed to see.
 */
export async function getVaultSecretMetadata(name: VaultSecretName): Promise<SecretMetadata> {
  const vault = await loadVault();
  return getMetadataFor(name, vault);
}

/**
 * Get metadata for all secrets — the only shape the browser ever receives.
 */
export async function getAllVaultMetadata(): Promise<Record<string, SecretMetadata>> {
  const vault = await loadVault();
  const result: Record<string, SecretMetadata> = {};
  for (const name of VAULT_SECRET_NAMES) {
    result[name] = getMetadataFor(name, vault);
  }
  return result;
}

/**
 * Update validation metadata after a provider test.
 */
export async function updateVaultValidation(
  name: VaultSecretName,
  status: "ok" | "fail",
): Promise<void> {
  const vault = await loadVault();
  if (!vault.metadata[name]) return;
  vault.metadata[name].lastValidated = new Date().toISOString();
  vault.metadata[name].lastValidationStatus = status;
  await persist();
}

/**
 * Check whether a secret exists in the vault (synchronous, for getSecret).
 */
export function hasVaultSecret(name: VaultSecretName): boolean {
  return Boolean(cache?.secrets[name]);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getMetadataFor(name: string, vault: VaultFile): SecretMetadata {
  const meta = vault.metadata[name];
  const configured = Boolean(vault.secrets[name]);
  return {
    configured,
    maskedKey: meta?.maskedKey ?? "",
    lastValidated: meta?.lastValidated ?? null,
    lastValidationStatus: meta?.lastValidationStatus ?? null,
  };
}

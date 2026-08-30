import { initSecrets, getSecret } from "../src/lib/secrets.server";
import { initVault } from "../src/lib/vault.server";
import { callLlm, redact } from "../src/lib/llm.server";
import { pickModel } from "../src/lib/model-picker";

async function main() {
  await initSecrets();
  await initVault();

  const key = getSecret("OPENROUTER_API_KEY");
  console.log("OPENROUTER_API_KEY present:", !!key);

  const modelsRes = await fetch("https://openrouter.ai/api/v1/models");
  const modelsBody = await modelsRes.json();
  const freeModels = (modelsBody.data || [])
    .filter((m: any) => Number(m.pricing?.prompt || "1") === 0 && Number(m.pricing?.completion || "1") === 0)
    .map((m: any) => m.id)
    .filter((id: string) => !/lyria|clip|note|image|music|whisper|tts|embed|rerank|vision|moderation|audio/i.test(id))
    .sort();

  const pick = pickModel("openrouter", freeModels, "code");
  console.log("Selected model:", pick?.model);

  const result = await callLlm("openrouter", pick!.model,
    "You are a test assistant. Reply with exactly: CONNECTION_OK",
    "Reply with the single word: CONNECTION_OK",
    { maxAttempts: 1, timeoutMs: 30000, temperature: 0 }
  );
  console.log("Result:", JSON.stringify({ ok: result.ok, status: result.status, text: result.text?.slice(0, 50), error: result.error?.slice(0, 200) }));
}

main().catch(e => console.error("Fatal:", e));

import { DecisionError } from "./domain.ts";

export const VULTR_BASE_URL = "https://api.vultrinference.com/v1";
export const VULTR_AGENT_MODEL = "deepseek-v4.1-flash-1017";
export const VULTR_ASR_MODEL = "qwen3-asr-1.7b";
export const VULTR_SPEECH_MODEL = "qwen3-tts-12hz-1.7b";

export function vultrApiKey(): string {
  // guard:allow-env-credential — Deployment-owned, server-only Vultr key. No fallback to another provider or a user's Settings connection.
  const key = process.env.VULTR_INFERENCE_API_KEY;
  if (!key) throw new DecisionError("provider_unavailable", "Vultr voice and the buying agent need the deployment's Vultr connection.");
  return key;
}

export function vultrEngineConfig() {
  // guard:allow-env-credential — Server-only Vultr configuration; an empty key fails closed when a turn starts.
  const apiKey = process.env.VULTR_INFERENCE_API_KEY ?? "";
  return { name: "ai-sdk:openai", config: {
    apiKey, baseUrl: VULTR_BASE_URL,
    allowEnvFallback: false, model: VULTR_AGENT_MODEL,
    supportedModels: [VULTR_AGENT_MODEL], acceptsCustomModels: false,
  } };
}

export async function vultrRequest(endpoint: "/chat/completions" | "/audio/transcriptions" | "/audio/speech", payload: Record<string, unknown>, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  const key = vultrApiKey();
  const timeout = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(VULTR_BASE_URL + endpoint, {
      method: "POST", redirect: "error", signal: combined,
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json, audio/wav" },
      body: JSON.stringify(payload),
    });
    if (!response.ok || !response.body) throw new Error("Provider response failed");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error("Provider output limit"); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch {
    // Never return raw provider errors, request headers or credential material.
    throw new DecisionError("provider_unavailable", "Vultr could not complete this request. Please try again or continue with the workspace controls.");
  }
}

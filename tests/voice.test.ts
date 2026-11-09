import test from "node:test";
import assert from "node:assert/strict";
import { pcmWav } from "../app/lib/voice.ts";
import { decodeBriefAudio, decisionExplanation, MAX_BRIEF_BYTES, validateBriefProposal } from "../server/voice.ts";
import { VULTR_BASE_URL, vultrApiKey, vultrEngineConfig, vultrRequest } from "../server/vultr.ts";
import { sampleDecision, recommend, withRequirements } from "../server/domain.ts";
import { permissionsFor, workableOptions } from "../server/buying.ts";

test("browser normalization creates bounded mono 16 kHz PCM for the real transcription contract", () => {
  const samples = new Float32Array(48_000);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 20) * .7;
  const wav = Buffer.from(pcmWav(samples, 48_000));
  assert.equal(decodeBriefAudio(wav.toString("base64")).length, 32_044);
  assert.equal(wav.readUInt32LE(24), 16_000);
  const oversized = Buffer.from(pcmWav(new Float32Array(48_000 * 30), 48_000));
  assert.equal(oversized.length, MAX_BRIEF_BYTES);
  assert.doesNotThrow(() => decodeBriefAudio(oversized.toString("base64")));
});

test("voice intake rejects malformed base64, truncation, compressed formats and oversized bodies", () => {
  const wav = Buffer.from(pcmWav(new Float32Array(16_000), 16_000));
  for (const encoded of ["", "not audio", wav.subarray(0, 100).toString("base64"), Buffer.alloc(MAX_BRIEF_BYTES + 2).toString("base64")]) assert.throws(() => decodeBriefAudio(encoded));
  const format = Buffer.from(wav); format.writeUInt16LE(3, 20);
  assert.throws(() => decodeBriefAudio(format.toString("base64")));
  const stereo = Buffer.from(wav); stereo.writeUInt16LE(2, 22);
  assert.throws(() => decodeBriefAudio(stereo.toString("base64")));
  const odd = Buffer.from(wav); odd.writeUInt32LE(31999, 40);
  assert.throws(() => decodeBriefAudio(odd.toString("base64")));
});

test("a buying brief proposes only cited, valid requirements and drops invented or invalid fields", () => {
  const transcript = "We need 100 kits with a complete budget of 590 US dollars by 2026-11-14.";
  const result = validateBriefProposal(transcript, { fields: { quantity: { value: 100, quote: "100 kits" }, budgetMinor: { value: 59000, quote: "590 US dollars" }, currency: { value: "USD", quote: "US dollars" }, deliveryBy: { value: "2026-11-14", quote: "2026-11-14" } } });
  assert.deepEqual(result.patch, { budgetMinor: 59000, quantity: 100, currency: "USD", deliveryBy: "2026-11-14" });
  const invalid = validateBriefProposal(transcript, { fields: { quantity: { value: 0, quote: "100 kits" }, currency: { value: "CAD", quote: "US dollars" }, deliveryBy: { value: "2026-02-30", quote: "2026-11-14" }, budgetMinor: { value: 1, quote: "fictional budget" } } });
  assert.deepEqual(invalid.patch, {});
  assert.ok(invalid.notes.length >= 4);
  assert.deepEqual(validateBriefProposal("Please compare these kits", { fields: {} }).patch, {});
});

test("Vultr credentials and model are pinned without Settings or other-provider fallback", () => {
  // guard:allow-env-credential — Synthetic test-only keys, restored after the check; no model request.
  const before = { vultr: process.env.VULTR_INFERENCE_API_KEY, openai: process.env.OPENAI_API_KEY };
  try {
    process.env.OPENAI_API_KEY = "test-other-provider"; // guard:allow-env-credential — Synthetic test key.
    delete process.env.VULTR_INFERENCE_API_KEY; // guard:allow-env-credential — Remove the test process's key to check failure without a provider fallback.
    assert.throws(() => vultrApiKey());
    assert.equal(vultrEngineConfig().config.apiKey, "");
    process.env.VULTR_INFERENCE_API_KEY = "test-vultr-only"; // guard:allow-env-credential — Synthetic test key.
    assert.equal(vultrApiKey(), "test-vultr-only");
    assert.equal(vultrEngineConfig().config.baseUrl, VULTR_BASE_URL);
    assert.equal(vultrEngineConfig().config.allowEnvFallback, false);
    assert.equal(vultrEngineConfig().config.acceptsCustomModels, false);
  } finally {
    if (before.vultr === undefined) delete process.env.VULTR_INFERENCE_API_KEY; else process.env.VULTR_INFERENCE_API_KEY = before.vultr; // guard:allow-env-credential — Restore the test process's environment after the check.
    if (before.openai === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before.openai; // guard:allow-env-credential — Restore the test process's environment after the check.
  }
});

test("the voice request refuses redirects, caps returned audio and hides raw provider errors", async () => {
  // guard:allow-env-credential — Test-only request credential; this test uses an explicit synthetic fetch response.
  const key = process.env.VULTR_INFERENCE_API_KEY, realFetch = globalThis.fetch;
  try {
    process.env.VULTR_INFERENCE_API_KEY = "test-vultr-request"; // guard:allow-env-credential — Synthetic request key for a mocked provider test.
    globalThis.fetch = async (url, options) => {
      assert.equal(url, VULTR_BASE_URL + "/audio/speech");
      assert.equal(options?.redirect, "error");
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-vultr-request");
      return new Response(new Uint8Array(20));
    };
    await assert.rejects(vultrRequest("/audio/speech", {}, 10), error => error instanceof Error && !error.message.includes("test-vultr-request"));
    globalThis.fetch = async () => { throw new Error("Raw private provider response"); };
    await assert.rejects(vultrRequest("/audio/speech", {}, 10), error => error instanceof Error && !error.message.includes("Raw private"));
  } finally {
    globalThis.fetch = realFetch;
    if (key === undefined) delete process.env.VULTR_INFERENCE_API_KEY; else process.env.VULTR_INFERENCE_API_KEY = key; // guard:allow-env-credential — Restore the test process's environment after the check.
  }
});

test("spoken explanations use saved comparisons and useful budget shortfalls", () => {
  const state = sampleDecision();
  const view = { id: "speech-fixture", version: 1, state, recommendation: recommend(state), events: [], permissions: permissionsFor(state), options: workableOptions(state), updatedAt: "2026-11-09" };
  assert.match(decisionExplanation(view), /Cedar Print/);
  const constrained = withRequirements(state, { budgetMinor: 57000 });
  assert.match(decisionExplanation({ ...view, state: constrained, recommendation: recommend(constrained), options: workableOptions(constrained) }), /reduction of \$5\.00/);
});

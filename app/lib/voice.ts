const SAMPLE_RATE = 16_000;
export const BRIEF_RECORDING_MS = 20_000;

export function pcmWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const ratio = sampleRate / SAMPLE_RATE;
  const count = Math.min(Math.floor(samples.length / ratio), SAMPLE_RATE * BRIEF_RECORDING_MS / 1000);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const label = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  label(0, "RIFF"); view.setUint32(4, 36 + count * 2, true); label(8, "WAVE"); label(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const begin = Math.floor(i * ratio), end = Math.min(samples.length, Math.max(begin + 1, Math.floor((i + 1) * ratio)));
    let sample = 0;
    for (let j = begin; j < end; j++) sample += samples[j]!;
    sample = Math.max(-1, Math.min(1, sample / (end - begin)));
    view.setInt16(44 + i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
  }
  return buffer;
}

export async function recordingBase64(blob: Blob): Promise<string> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) mono[i] = mono[i]! + samples[i]! / decoded.numberOfChannels;
    }
    const wav = new Uint8Array(pcmWav(mono, decoded.sampleRate));
    let binary = "";
    for (let i = 0; i < wav.length; i += 8192) binary += String.fromCharCode(...wav.subarray(i, i + 8192));
    return btoa(binary);
  } finally { await context.close(); }
}

import { describe, expect, it } from "vitest";
import { toVoiceNote } from "../../src/services/assistant/ffmpeg.js";
import { decodeAudio } from "../../src/services/assistant/whisper.js";

// Un WAV de un segundo (tono de 440 Hz, 8 kHz, 16 bits): lo que Whisper recibe es 16 kHz mono.
function wav(seconds = 1, rate = 8000) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buffer;
}

describe("audio para Whisper", () => {
  it("ffmpeg lo pasa a 16 kHz mono", { timeout: 20_000 }, async () => {
    const samples = await decodeAudio(wav());
    expect(samples).toBeInstanceOf(Float32Array);
    expect(Math.abs(samples.length - 16000)).toBeLessThan(200);
    expect(Math.max(...samples.slice(1000, 2000))).toBeGreaterThan(0.1);
  });

  it("muestras de voz → nota de voz OGG/Opus, y de vuelta", { timeout: 20_000 }, async () => {
    const samples = new Float32Array(16000).map((_, i) => Math.sin((2 * Math.PI * 300 * i) / 16000) * 0.3);
    const note = await toVoiceNote(samples, 16000);
    expect(note.subarray(0, 4).toString()).toBe("OggS");
    expect(Math.abs((await decodeAudio(note)).length - 16000)).toBeLessThan(400);
  });

  it("un archivo que no es audio falla (no se inventa texto)", { timeout: 20_000 }, async () => {
    await expect(decodeAudio(Buffer.from("esto no es un audio"))).rejects.toThrow();
  });
});

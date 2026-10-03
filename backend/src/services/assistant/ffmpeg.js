// ffmpeg incluido en el paquete (@ffmpeg-installer, sin descargas al instalar): entra un
// Buffer por stdin y sale otro por stdout.
import { spawn } from "node:child_process";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

export function runFfmpeg(args, input, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg.path, ["-hide_banner", "-loglevel", "error", ...args], { windowsHide: true });
    const chunks = [];
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg terminó con ${code}`));
      resolve(Buffer.concat(chunks));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// Muestras float mono → nota de voz OGG/Opus (el formato de los audios de WhatsApp).
export const toVoiceNote = (samples, sampleRate) =>
  runFfmpeg(
    ["-f", "f32le", "-ar", String(sampleRate), "-ac", "1", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "24k", "-f", "ogg", "pipe:1"],
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
  );

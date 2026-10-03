// Audios a texto en este mismo servidor, gratis: ffmpeg pasa el audio (OGG/Opus de
// WhatsApp, WebM del navegador, MP4 del iPhone) a 16 kHz mono y Whisper lo transcribe con
// transformers.js. El modelo se baja la primera vez a ~/.cache/app-pedidos (fuera del repo).
import { homedir } from "node:os";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { config } from "../../config.js";
import { runFfmpeg } from "./ffmpeg.js";

// Una nota de voz más larga se corta: nadie pide un lanche en más de 2 minutos.
const MAX_SECONDS = 120;

env.cacheDir = path.join(homedir(), ".cache", "app-pedidos", "transformers");

let loading;
const transcriber = () => {
  loading ??= pipeline("automatic-speech-recognition", config.WHISPER_MODEL, { dtype: "q8" }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
};

// El audio como muestras float de 16 kHz, mono (lo que espera Whisper).
export async function decodeAudio(audio) {
  const bytes = await runFfmpeg(["-i", "pipe:0", "-t", String(MAX_SECONDS), "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"], audio);
  // Copia alineada: un Float32Array necesita empezar en un múltiplo de 4 bytes.
  return new Float32Array(new Uint8Array(bytes).buffer, 0, Math.floor(bytes.length / 4));
}

/**
 * @param {Buffer} audio
 * @param {"pt-BR"|"es"} locale  Idioma de la conversación. Whisper no lo detecta solo en esta
 *   versión (sin idioma transcribe como inglés): se usa el de la conversación.
 */
export async function transcribeLocal(audio, locale) {
  const samples = await decodeAudio(audio);
  if (samples.length < 16000 / 4) return null;
  const run = await transcriber();
  const output = await run(samples, {
    language: locale === "es" ? "spanish" : "portuguese",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return output.text?.trim() || null;
}

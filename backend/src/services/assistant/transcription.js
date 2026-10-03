// Audios de los clientes a texto. Con TRANSCRIPTION_PROVIDER=local, Whisper corre en este
// mismo servidor (gratis; el modelo se baja la primera vez). Con "none", no se transcribe
// y el asistente le pide al cliente que escriba. Los tests ponen uno falso con setTranscriber().
import { config } from "../../config.js";

let override;

export const transcriptionAvailable = () => Boolean(override) || config.TRANSCRIPTION_PROVIDER !== "none";

/**
 * @param {Buffer} audio  El archivo tal como llega (en WhatsApp, OGG/Opus).
 * @param {"pt-BR"|"es"} locale  El idioma más probable (Whisper igual detecta el que es).
 * @returns {Promise<string|null>}
 */
export async function transcribe(audio, locale) {
  if (override) return override(audio, locale);
  if (config.TRANSCRIPTION_PROVIDER !== "local") return null;
  const { transcribeLocal } = await import("./whisper.js");
  return transcribeLocal(audio, locale);
}

export function setTranscriber(fn) {
  override = fn;
}

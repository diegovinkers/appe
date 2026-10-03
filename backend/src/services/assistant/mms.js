// Voz del asistente en este mismo servidor, gratis: las voces MMS de Meta (una por idioma,
// ~110 MB cada una, se bajan la primera vez) con transformers.js, y ffmpeg para pasarlas a
// nota de voz. Suenan algo robóticas, pero se entienden.
import { homedir } from "node:os";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { toVoiceNote } from "./ffmpeg.js";

const VOICES = { "pt-BR": "Xenova/mms-tts-por", es: "Xenova/mms-tts-spa" };

env.cacheDir = path.join(homedir(), ".cache", "app-pedidos", "transformers");

const loaded = new Map();
function voice(locale) {
  const model = VOICES[locale] ?? VOICES["pt-BR"];
  if (!loaded.has(model)) {
    loaded.set(
      model,
      pipeline("text-to-speech", model).catch((error) => {
        loaded.delete(model);
        throw error;
      })
    );
  }
  return loaded.get(model);
}

// Texto ya preparado para leer (sin números ni símbolos, ver speech.js) → OGG/Opus.
export async function speakLocal(text, locale) {
  const tts = await voice(locale);
  const { audio, sampling_rate: sampleRate } = await tts(text);
  return toVoiceNote(audio, sampleRate);
}

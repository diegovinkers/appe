// El asistente contesta también con una nota de voz. Con VOICE_PROVIDER=local la voz se
// genera en este servidor (ver mms.js); con "none", no hay voz. Los tests ponen una falsa
// con setSpeaker().
import { config } from "../../config.js";
import { speechText } from "./speech.js";

let override;

export const voiceAvailable = () => Boolean(override) || config.VOICE_PROVIDER === "local";

/**
 * La respuesta escrita, en voz.
 * @returns {Promise<Buffer|null>} Nota de voz OGG/Opus.
 */
export async function speak(text, locale) {
  const spoken = speechText(text, locale);
  if (!spoken) return null;
  if (override) return override(spoken, locale);
  if (config.VOICE_PROVIDER !== "local") return null;
  const { speakLocal } = await import("./mms.js");
  return speakLocal(spoken, locale);
}

export function setSpeaker(fn) {
  override = fn;
}

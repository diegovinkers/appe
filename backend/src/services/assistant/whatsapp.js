// El asistente en WhatsApp: lo que llega por el webhook de Meta, las respuestas y los
// avisos del estado del pedido. Solo se le escribe al cliente dentro de las 24 h desde su
// último mensaje (regla de WhatsApp; fuera de eso harían falta plantillas aprobadas).
import Assistant from "../../models/assistant.model.js";
import Commerce from "../../models/commerce.model.js";
import Conversation from "../../models/conversation.model.js";
import ConversationMessage from "../../models/conversationMessage.model.js";
import { logger } from "../../lib/logger.js";
import { normalizePhone } from "../../lib/phone.js";
import { addMessage, replyTo } from "./engine.js";
import { shouldSpeak } from "./speech.js";
import { transcribe, transcriptionAvailable } from "./transcription.js";
import { speak, voiceAvailable } from "./voice.js";
import { getWhatsappClient } from "./whatsappCloud.js";

export const WINDOW_MS = 24 * 60 * 60 * 1000;
// Si el cliente vuelve después de tanto tiempo, es otra conversación (otro pedido).
const NEW_CONVERSATION_AFTER_MS = 12 * 60 * 60 * 1000;
// Mensajes seguidos ("oi" / "quero um xis" / "sem cebola") se contestan juntos.
let replyDelayMs = 3000;

const TEXTS = {
  "pt-BR": {
    unsupported: "Por enquanto eu só entendo mensagens de texto. Pode escrever o que você precisa? 🙂",
    audioOff: "Ainda não consigo ouvir áudios. Pode escrever o que você precisa? 🙂",
    audioFailed: "Não consegui entender o áudio. Pode escrever, por favor?",
    status: {
      confirmed: (n, eta) => `✅ Seu pedido *#${n}* foi confirmado!${eta ? ` Previsão: ${eta}.` : ""}`,
      ready: (n) => `🍔 Seu pedido *#${n}* está pronto para retirar!`,
      out_for_delivery: (n) => `🛵 Seu pedido *#${n}* saiu para entrega!`,
      cancelled: (n, reason) => `❌ Seu pedido *#${n}* foi cancelado.${reason ? ` Motivo: ${reason}` : ""}`,
    },
  },
  es: {
    unsupported: "Por ahora solo entiendo mensajes de texto. ¿Me escribís lo que necesitás? 🙂",
    audioOff: "Todavía no puedo escuchar audios. ¿Me escribís lo que necesitás? 🙂",
    audioFailed: "No pude entender el audio. ¿Me lo escribís, por favor?",
    status: {
      confirmed: (n, eta) => `✅ ¡Tu pedido *#${n}* fue confirmado!${eta ? ` Llega en ${eta}.` : ""}`,
      ready: (n) => `🍔 ¡Tu pedido *#${n}* está listo para retirar!`,
      out_for_delivery: (n) => `🛵 ¡Tu pedido *#${n}* salió para entrega!`,
      cancelled: (n, reason) => `❌ Tu pedido *#${n}* fue cancelado.${reason ? ` Motivo: ${reason}` : ""}`,
    },
  },
};
const textsFor = (locale) => TEXTS[locale] ?? TEXTS["pt-BR"];

export const windowOpen = (conversation, now = Date.now()) =>
  Boolean(conversation.lastCustomerMessageAt) && now - conversation.lastCustomerMessageAt.getTime() < WINDOW_MS;

async function phoneNumberIdOf(commerceId) {
  const settings = await Assistant.findOne({ commerce: commerceId }).select("phoneNumberId").lean();
  return settings?.phoneNumberId ?? null;
}

/**
 * Manda un mensaje del local (asistente o persona) por WhatsApp y guarda si salió.
 * @returns {Promise<boolean>}
 */
async function deliver(conversation, message) {
  const phoneNumberId = await phoneNumberIdOf(conversation.commerce);
  let ok = false;
  if (phoneNumberId && conversation.waId && windowOpen(conversation)) {
    try {
      await getWhatsappClient().sendText({ phoneNumberId, to: conversation.waId, text: message.text });
      ok = true;
    } catch (error) {
      logger.warn({ err: { name: error.name, status: error.status, code: error.code }, conversation: String(conversation._id) }, "whatsapp: no se pudo enviar");
    }
  }
  await ConversationMessage.updateOne({ _id: message._id }, { $set: { delivery: ok ? "sent" : "failed" } });
  message.delivery = ok ? "sent" : "failed";
  return ok;
}

// Guarda un mensaje del local y lo manda.
async function sendFromStore(conversation, role, text) {
  const message = await addMessage(conversation, { role, text, delivery: "pending" });
  await deliver(conversation, message);
  return message;
}

// --- Respuestas del asistente, con una espera corta para juntar mensajes seguidos ---

const pending = new Map();

async function answer(conversationId) {
  const replies = await replyTo(conversationId);
  if (!replies.length) return;
  const conversation = await Conversation.findById(conversationId);
  for (const reply of replies) await deliver(conversation, reply);
  if (await wantsVoice(conversation)) {
    for (const reply of replies) if (reply.delivery === "sent" && shouldSpeak(reply.text)) await sendVoice(conversation, reply.text);
  }
}

// Con voz solo si el local lo activó y el cliente habló por audio.
async function wantsVoice(conversation) {
  if (!voiceAvailable()) return false;
  const settings = await Assistant.findOne({ commerce: conversation.commerce }).select("voiceReplies").lean();
  if (!settings?.voiceReplies) return false;
  const last = await ConversationMessage.findOne({ conversation: conversation._id, role: "customer" }).sort({ createdAt: -1 }).select("kind").lean();
  return last?.kind === "audio";
}

// Además del texto, la misma respuesta en una nota de voz. Si falla, queda el texto.
async function sendVoice(conversation, text) {
  try {
    const phoneNumberId = await phoneNumberIdOf(conversation.commerce);
    const audio = await speak(text, conversation.locale);
    if (audio && phoneNumberId && windowOpen(conversation)) {
      await getWhatsappClient().sendAudio({ phoneNumberId, to: conversation.waId, audio });
    }
  } catch (error) {
    logger.warn({ err: { name: error.name, status: error.status } }, "whatsapp: no se mandó la nota de voz");
  }
}

export function scheduleReply(conversationId) {
  const key = String(conversationId);
  clearTimeout(pending.get(key)?.timer);
  const run = () => {
    pending.delete(key);
    return answer(conversationId).catch((error) => logger.error({ err: error, conversation: key }, "whatsapp: falló la respuesta"));
  };
  pending.set(key, { timer: setTimeout(run, replyDelayMs), run });
}

// Para los tests: contestar ya lo que está esperando, y cambiar la espera.
export function flushReplies() {
  const runs = [...pending.values()].map(({ timer, run }) => {
    clearTimeout(timer);
    return run();
  });
  return Promise.all(runs);
}
export function setReplyDelay(ms) {
  replyDelayMs = ms;
}

// --- Lo que llega por el webhook ---

// Los mensajes de un POST del webhook, con el número del local al que llegaron.
export function inboundMessages(body) {
  const events = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const names = new Map((value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name ?? ""]));
      for (const message of value.messages ?? []) {
        events.push({ phoneNumberId, waId: message.from, name: names.get(message.from) ?? "", message });
      }
    }
  }
  return events;
}

async function conversationFor(commerceId, { waId, name }) {
  const now = Date.now();
  let conversation = await Conversation.findOne({ commerce: commerceId, channel: "whatsapp", waId, status: { $ne: "closed" } }).sort({
    lastMessageAt: -1,
  });
  if (conversation && conversation.lastCustomerMessageAt && now - conversation.lastCustomerMessageAt.getTime() > NEW_CONVERSATION_AFTER_MS) {
    conversation.status = "closed";
    await conversation.save();
    conversation = null;
  }
  if (!conversation) {
    conversation = new Conversation({
      commerce: commerceId,
      channel: "whatsapp",
      waId,
      customer: { phone: normalizePhone(`+${waId}`) ?? `+${waId}`, name: String(name ?? "").slice(0, 60) },
      // Un número de Uruguay empieza en español; después el asistente sigue el idioma del cliente.
      locale: waId.startsWith("598") ? "es" : "pt-BR",
    });
  }
  return conversation;
}

async function handle({ phoneNumberId, waId, name, message }) {
  if (!phoneNumberId || !waId || !message?.id) return;
  const settings = await Assistant.findOne({ phoneNumberId, enabled: true }).lean();
  if (!settings) return;
  const store = await Commerce.exists({ _id: settings.commerce, status: "active" });
  if (!store) return;
  // Meta reenvía si no respondimos a tiempo: el mismo mensaje se procesa una sola vez.
  if (await ConversationMessage.exists({ externalId: message.id })) return;

  const conversation = await conversationFor(settings.commerce, { waId, name });
  const client = getWhatsappClient();
  client.markRead({ phoneNumberId, messageId: message.id }).catch(() => {});

  let saved;
  try {
    if (message.type === "text") {
      saved = await addMessage(conversation, { role: "customer", text: String(message.text?.body ?? "").slice(0, 4000), externalId: message.id });
    } else if (message.type === "audio") {
      saved = await addMessage(conversation, { role: "customer", kind: "audio", text: "", externalId: message.id });
      const text = await transcribeAudio(client, message.audio?.id, conversation.locale);
      if (text === null) {
        const texts = textsFor(conversation.locale);
        if (conversation.status === "bot") await sendFromStore(conversation, "assistant", transcriptionAvailable() ? texts.audioFailed : texts.audioOff);
        return;
      }
      await ConversationMessage.updateOne({ _id: saved._id }, { $set: { text } });
      conversation.preview = text.slice(0, 120);
      await conversation.save();
    } else {
      // Fotos, stickers, ubicación...: se guarda que llegó y se pide texto.
      await addMessage(conversation, { role: "customer", text: `[${message.type}]`, externalId: message.id });
      if (conversation.status === "bot") await sendFromStore(conversation, "assistant", textsFor(conversation.locale).unsupported);
      return;
    }
  } catch (error) {
    if (error.code === 11000) return;
    throw error;
  }
  if (conversation.status === "bot") scheduleReply(conversation._id);
}

async function transcribeAudio(client, mediaId, locale) {
  if (!mediaId || !transcriptionAvailable()) return null;
  try {
    const { buffer } = await client.downloadMedia(mediaId);
    const text = (await transcribe(buffer, locale))?.trim();
    return text || null;
  } catch (error) {
    logger.warn({ err: { name: error.name, status: error.status } }, "whatsapp: no se pudo transcribir un audio");
    return null;
  }
}

// Lo que se está procesando (el webhook contesta 200 enseguida y sigue después).
const inFlight = new Set();

export function processWebhook(body) {
  const work = (async () => {
    for (const event of inboundMessages(body)) {
      await handle(event).catch((error) => logger.error({ err: error }, "whatsapp: falló un mensaje entrante"));
    }
  })();
  inFlight.add(work);
  work.finally(() => inFlight.delete(work));
  return work;
}

// Para los tests: esperar a que termine lo que llegó por el webhook.
export const settleWebhooks = () => Promise.all([...inFlight]);

// --- Desde el panel ---

// Una persona del local le escribe al cliente.
export const sendStaffText = (conversation, text) => sendFromStore(conversation, "staff", text);

// Volvió al asistente: si lo último es del cliente, contesta.
export async function resumeAssistant(conversation) {
  if (conversation.channel === "whatsapp" && conversation.status === "bot" && conversation.lastRole === "customer") {
    scheduleReply(conversation._id);
  }
}

// Cuando el local cambia el estado de un pedido que tomó el asistente, se le avisa al cliente.
const NOTIFY = ["confirmed", "ready", "out_for_delivery", "cancelled"];

export async function notifyOrderStatus(order) {
  if (!order.conversation || !NOTIFY.includes(order.status)) return;
  // "Listo" solo interesa si lo retira: si es entrega, avisa cuando sale.
  if (order.status === "ready" && order.fulfillment === "delivery") return;
  const conversation = await Conversation.findOne({ _id: order.conversation, channel: "whatsapp" });
  if (!conversation || !windowOpen(conversation)) return;
  const texts = textsFor(order.locale ?? conversation.locale).status;
  const eta = order.estimatedMinutes?.min != null ? `${order.estimatedMinutes.min}–${order.estimatedMinutes.max} min` : null;
  const text = order.status === "confirmed" ? texts.confirmed(order.number, eta) : order.status === "cancelled" ? texts.cancelled(order.number, order.cancelReason) : texts[order.status](order.number);
  await sendFromStore(conversation, "assistant", text);
}

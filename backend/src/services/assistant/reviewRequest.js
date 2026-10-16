// Pedir la reseña de un pedido entregado por el WhatsApp del local (el número del asistente),
// sin salir del panel. Solo se puede si el pedido vino de una conversación de WhatsApp y el
// cliente escribió en las últimas 24 horas: fuera de esa ventana WhatsApp no deja mandar texto
// libre. Si no, el panel ofrece el link de siempre (abre WhatsApp en el aparato).
import Assistant, { DEFAULT_REVIEW_DELAY } from "../../models/assistant.model.js";
import Commerce from "../../models/commerce.model.js";
import Conversation from "../../models/conversation.model.js";
import Order from "../../models/order.model.js";
import Review from "../../models/review.model.js";
import { trackingUrl } from "../../lib/links.js";
import { logger } from "../../lib/logger.js";
import { reviewWindow } from "../review.service.js";
import { hasAssistantPlus } from "./entitlements.js";
import { sendFromStore, windowOpen } from "./whatsapp.js";

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

const TEXTS = {
  "pt-BR": (name, number, store, url) =>
    `Olá${name ? `, ${name}` : ""}! Obrigado pelo pedido #${number} na ${store}. Conta pra gente como foi? Leva menos de um minuto: ${url}`,
  es: (name, number, store, url) =>
    `¡Hola${name ? `, ${name}` : ""}! Gracias por tu pedido #${number} en ${store}. ¿Nos contás cómo estuvo? Lleva menos de un minuto: ${url}`,
};

export const reviewRequestText = (order, store) =>
  (TEXTS[order.locale] ?? TEXTS["pt-BR"])(firstName(order.customer.name), order.number, store.name, trackingUrl(order));

const deliveredAt = (order) => order.statusHistory.findLast((entry) => entry.status === "delivered")?.at ?? order.updatedAt;

/**
 * Si se puede pedir la reseña desde el panel y, si no, por qué.
 * reason: NOT_DELIVERED | REVIEWED | NO_CONVERSATION | WINDOW_CLOSED | NOT_CONNECTED | null.
 */
export async function reviewRequestStatus(order, now = new Date()) {
  const base = { inApp: false, requestedAt: order.reviewRequestedAt ?? null, conversation: null };
  if (!reviewWindow(order, now).open || !order.trackingToken) return { ...base, reason: "NOT_DELIVERED" };
  if (await Review.exists({ order: order._id })) return { ...base, reason: "REVIEWED" };
  const conversation = order.conversation
    ? await Conversation.findOne({ _id: order.conversation, commerce: order.commerce, channel: "whatsapp" })
    : null;
  if (!conversation) return { ...base, reason: "NO_CONVERSATION" };
  const withConversation = { ...base, conversation };
  const settings = await Assistant.findOne({ commerce: order.commerce }).select("phoneNumberId").lean();
  if (!settings?.phoneNumberId || !(await hasAssistantPlus(order.commerce))) return { ...withConversation, reason: "NOT_CONNECTED" };
  if (!windowOpen(conversation, now.getTime())) return { ...withConversation, reason: "WINDOW_CLOSED" };
  return { ...withConversation, inApp: true, reason: null };
}

// Manda el pedido de reseña. `role`: "staff" (lo pidió alguien del local) o "assistant" (automático).
// Devuelve el mensaje guardado; `delivery` dice si salió.
export async function sendReviewRequest(order, conversation, store, role = "staff") {
  const message = await sendFromStore(conversation, role, reviewRequestText(order, store));
  if (message.delivery === "sent") {
    await Order.updateOne({ _id: order._id, commerce: order.commerce }, { $set: { reviewRequestedAt: message.createdAt } });
    order.reviewRequestedAt = message.createdAt;
  }
  return message;
}

// Job: en los locales que lo activaron, pide la reseña sola un rato después de la entrega,
// una vez por pedido y solo dentro de la ventana de 24 horas de WhatsApp.
export async function requestPendingReviews(now = new Date()) {
  const settings = await Assistant.find({ autoReviewRequest: true }).select("commerce reviewDelayMinutes").lean();
  let sent = 0;
  for (const setting of settings) {
    const store = await Commerce.findOne({ _id: setting.commerce, status: "active" });
    if (!store || !(await hasAssistantPlus(store._id))) continue;
    const delayMs = (setting.reviewDelayMinutes ?? DEFAULT_REVIEW_DELAY) * 60_000;
    // Entregados en las últimas 24 horas que vinieron de WhatsApp y todavía no se pidieron.
    const orders = await Order.find({
      commerce: store._id,
      status: "delivered",
      conversation: { $ne: null },
      reviewRequestedAt: null,
      updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    }).limit(100);
    for (const order of orders) {
      if (now - deliveredAt(order) < delayMs) continue;
      const status = await reviewRequestStatus(order, now);
      if (!status.inApp || status.conversation.automationBlocked) continue;
      // Se marca antes de mandar: dos servidores no lo piden dos veces.
      const claimed = await Order.updateOne({ _id: order._id, reviewRequestedAt: null }, { $set: { reviewRequestedAt: now } });
      if (!claimed.modifiedCount) continue;
      const message = await sendReviewRequest(order, status.conversation, store, "assistant");
      if (message.delivery === "sent") sent++;
      // No salió: se libera para el próximo intento (mientras siga dentro de la ventana).
      else await Order.updateOne({ _id: order._id }, { $set: { reviewRequestedAt: null } });
    }
  }
  if (sent) logger.info({ sent }, "reseñas pedidas por WhatsApp");
  return sent;
}

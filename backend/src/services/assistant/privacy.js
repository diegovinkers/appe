// LGPD: lo que el asistente guarda de un cliente se borra con su cuenta, y todo después
// de 90 días. Los pedidos quedan (son del local); solo pierden la conversación.
import Conversation from "../../models/conversation.model.js";
import ConversationMessage from "../../models/conversationMessage.model.js";
import { phoneVariants } from "../../lib/phone.js";

export const RETENTION_DAYS = 90;

async function removeConversations(filter) {
  const ids = (await Conversation.find(filter).select("_id").lean()).map((conversation) => conversation._id);
  if (!ids.length) return 0;
  await ConversationMessage.deleteMany({ conversation: { $in: ids } });
  await Conversation.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

// Las conversaciones de un teléfono (con y sin el 9), en todos los locales.
export const forgetConversationsOf = (phone) => removeConversations({ "customer.phone": { $in: phoneVariants(phone) } });

// Job diario: mensajes y conversaciones sin movimiento hace más de RETENTION_DAYS días.
export async function cleanupOldConversations(now = new Date()) {
  const limit = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const conversations = await removeConversations({ lastMessageAt: { $lt: limit } });
  const { deletedCount: messages } = await ConversationMessage.deleteMany({ createdAt: { $lt: limit } });
  return { conversationsDeleted: conversations, messagesDeleted: messages };
}

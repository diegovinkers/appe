import Assistant from "../models/assistant.model.js";
import Conversation from "../models/conversation.model.js";
import ConversationMessage from "../models/conversationMessage.model.js";
import Order from "../models/order.model.js";
import { config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import { getAiProvider } from "../services/assistant/ai.js";
import { currentMonth, monthSpendMicros } from "../services/assistant/costs.js";
import { DEFAULT_BUDGET_USD_CENTS, addMessage, replyTo } from "../services/assistant/engine.js";
import { transcribe, transcriptionAvailable } from "../services/assistant/transcription.js";
import { speak, voiceAvailable } from "../services/assistant/voice.js";
import { resumeAssistant, sendStaffText, windowOpen } from "../services/assistant/whatsapp.js";
import { whatsappConfigured } from "../services/assistant/whatsappCloud.js";

const conversationNotFound = () => notFound("Conversa não encontrada");

const usageView = (usage) => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0,
  cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
  cacheReadTokens: usage?.cacheReadTokens ?? 0,
  costMicros: usage?.costMicros ?? 0,
});

export const conversationView = (conversation) => ({
  _id: conversation._id,
  channel: conversation.channel,
  customer: { phone: conversation.customer.phone, name: conversation.customer.name },
  locale: conversation.locale,
  status: conversation.status,
  handoff: conversation.handoff ? { reason: conversation.handoff.reason, at: conversation.handoff.at } : null,
  testMode: conversation.testMode,
  orders: conversation.orders,
  lastCustomerMessageAt: conversation.lastCustomerMessageAt,
  lastMessageAt: conversation.lastMessageAt,
  preview: conversation.preview,
  lastRole: conversation.lastRole ?? null,
  usage: usageView(conversation.usage),
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
});

export const messageView = (message) => ({
  _id: message._id,
  role: message.role,
  kind: message.kind,
  text: message.text,
  delivery: message.delivery ?? null,
  toolCalls: (message.toolCalls ?? []).map(({ name, input, output }) => ({ name, input, output })),
  model: message.model ?? null,
  usage: message.usage ? usageView(message.usage) : null,
  createdAt: message.createdAt,
});

async function settingsView(commerce) {
  const settings = await Assistant.findOne({ commerce: commerce._id }).lean();
  const { month, start } = currentMonth();
  const [costMicros, conversations, orders] = await Promise.all([
    monthSpendMicros(commerce._id),
    ConversationMessage.distinct("conversation", { commerce: commerce._id, role: "assistant", createdAt: { $gte: start } }),
    Order.countDocuments({ commerce: commerce._id, conversation: { $ne: null }, createdAt: { $gte: start } }),
  ]);
  return {
    enabled: settings?.enabled ?? false,
    phoneNumberId: settings?.phoneNumberId ?? null,
    monthlyBudgetUsdCents: settings?.monthlyBudgetUsdCents ?? DEFAULT_BUDGET_USD_CENTS,
    voiceReplies: settings?.voiceReplies ?? false,
    model: getAiProvider()?.model ?? config.AI_MODEL,
    // Qué está configurado en el servidor (las claves están en el .env, no en el panel).
    available: {
      ai: Boolean(getAiProvider()),
      whatsapp: whatsappConfigured(),
      transcription: transcriptionAvailable(),
      voice: voiceAvailable(),
    },
    month: { month, costMicros, conversations: conversations.length, orders },
  };
}

// GET /api/owner/assistant — configuración y gasto del mes.
export const getAssistant = async (req, res) => res.json({ assistant: await settingsView(req.commerce) });

// PATCH /api/owner/assistant
export const updateAssistant = async (req, res) => {
  const changes = req.valid.body;
  try {
    await Assistant.updateOne({ commerce: req.commerce._id }, { $set: changes }, { upsert: true, runValidators: true });
  } catch (error) {
    if (error.code === 11000) throw conflict("PHONE_NUMBER_TAKEN", "Esse número de WhatsApp já está conectado a outra loja");
    throw error;
  }
  await audit(req, { action: "assistant.updated", entity: { type: "commerce", id: req.commerce._id }, changes });
  res.json({ assistant: await settingsView(req.commerce) });
};

// POST /api/owner/assistant/simulator — el local le escribe al asistente como si fuera un
// cliente. Contesta en la misma respuesta.
const aiRequired = () => {
  if (!getAiProvider()) throw new AppError(503, "ASSISTANT_UNAVAILABLE", "O assistente não está configurado neste servidor");
};

async function simulate(req, res, { text, kind = "text" }) {
  const { conversationId, customer, locale, realOrders } = req.valid.body;
  let conversation;
  if (conversationId) {
    conversation = await Conversation.findOne({ _id: conversationId, commerce: req.commerce._id, channel: "simulator" });
    if (!conversation) throw conversationNotFound();
  } else {
    conversation = new Conversation({ commerce: req.commerce._id, channel: "simulator", customer, locale });
  }
  conversation.testMode = !realOrders;
  const message = await addMessage(conversation, { role: "customer", text, kind });
  const replies = await replyTo(conversation._id);

  const fresh = await Conversation.findById(conversation._id);
  res.status(201).json({ conversation: conversationView(fresh), messages: [message, ...replies].map(messageView) });
}

export const sendSimulatorMessage = async (req, res) => {
  aiRequired();
  await simulate(req, res, { text: req.valid.body.text });
};

// POST /api/owner/assistant/simulator/audio — lo mismo con una nota de voz (se transcribe).
export const sendSimulatorAudio = async (req, res) => {
  aiRequired();
  if (!transcriptionAvailable()) {
    throw new AppError(503, "TRANSCRIPTION_UNAVAILABLE", "A transcrição de áudios não está ligada neste servidor");
  }
  const { audio, locale, conversationId } = req.valid.body;
  // El idioma de la conversación, si ya existe: Whisper lo necesita para no confundirse.
  const existing = conversationId && (await Conversation.findOne({ _id: conversationId, commerce: req.commerce._id }).select("locale").lean());
  let text = null;
  try {
    text = (await transcribe(Buffer.from(audio, "base64"), existing?.locale ?? locale))?.trim() || null;
  } catch (error) {
    req.log.warn({ err: { name: error.name, message: error.message } }, "asistente: no se pudo transcribir el audio");
  }
  if (!text) throw new AppError(422, "AUDIO_NOT_UNDERSTOOD", "Não deu para entender o áudio. Tente de novo ou escreva.");
  await simulate(req, res, { text, kind: "audio" });
};

// POST /api/owner/assistant/speech — cómo suena una respuesta en voz (el panel la reproduce).
export const previewSpeech = async (req, res) => {
  if (!voiceAvailable()) throw new AppError(503, "VOICE_UNAVAILABLE", "As respostas com voz não estão ligadas neste servidor");
  const { text, locale } = req.valid.body;
  const audio = await speak(text, locale);
  if (!audio) throw new AppError(422, "NOTHING_TO_SAY", "Não há texto para falar");
  res.type("audio/ogg").send(audio);
};

// GET /api/owner/assistant/conversations — las más recientes primero.
export const listConversations = async (req, res) => {
  const { channel, status } = req.valid.query;
  const filter = { commerce: req.commerce._id, ...(channel && { channel }), ...(status && { status }) };
  const conversations = await Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(100);
  res.json({ conversations: conversations.map(conversationView) });
};

// GET /api/owner/assistant/conversations/:id — con sus últimos mensajes.
export const getConversation = async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!conversation) throw conversationNotFound();
  const messages = (await ConversationMessage.find({ conversation: conversation._id }).sort({ createdAt: -1 }).limit(200)).reverse();
  res.json({ conversation: conversationView(conversation), messages: messages.map(messageView) });
};

async function setStatus(req, status, handoff) {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: req.valid.params.id, commerce: req.commerce._id },
    { $set: { status, handoff } },
    { returnDocument: "after" }
  );
  if (!conversation) throw conversationNotFound();
  return conversation;
}

// POST /api/owner/assistant/conversations/:id/takeover — una persona atiende; el asistente se calla.
export const takeOverConversation = async (req, res) => {
  const conversation = await setStatus(req, "human", { reason: "Assumida pela loja", at: new Date() });
  res.json({ conversation: conversationView(conversation) });
};

// POST /api/owner/assistant/conversations/:id/release — vuelve a contestar el asistente.
export const releaseConversation = async (req, res) => {
  const conversation = await setStatus(req, "bot", null);
  await resumeAssistant(conversation);
  res.json({ conversation: conversationView(conversation) });
};

// POST /api/owner/assistant/conversations/:id/messages — alguien del local le escribe al
// cliente (por WhatsApp, si la conversación es de ahí). La conversación pasa a la persona
// (el asistente deja de contestar).
export const sendStaffMessage = async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!conversation) throw conversationNotFound();
  if (conversation.channel === "whatsapp" && !windowOpen(conversation)) {
    throw conflict(
      "WHATSAPP_WINDOW_CLOSED",
      "Passaram mais de 24 horas desde a última mensagem do cliente: o WhatsApp só deixa responder dentro desse prazo"
    );
  }
  if (conversation.status !== "human") {
    conversation.status = "human";
    conversation.handoff = { reason: "Respondida pela loja", at: new Date() };
  }
  const { text } = req.valid.body;
  const message =
    conversation.channel === "whatsapp" ? await sendStaffText(conversation, text) : await addMessage(conversation, { role: "staff", text });
  res.status(201).json({ conversation: conversationView(conversation), message: messageView(message) });
};

// Motor del asistente: arma lo que sabe, llama a la IA con las herramientas hasta tener
// una respuesta y la guarda con su costo. No sabe de canales: quien lo llama (el
// simulador del panel o WhatsApp) se encarga de mandar la respuesta.
import Assistant from "../../models/assistant.model.js";
import Commerce from "../../models/commerce.model.js";
import Conversation from "../../models/conversation.model.js";
import ConversationMessage from "../../models/conversationMessage.model.js";
import Order from "../../models/order.model.js";
import { logger } from "../../lib/logger.js";
import { storeUrl } from "../../lib/links.js";
import { getAiProvider } from "./ai.js";
import { buildMenu, momentInfo, storeInfo } from "./context.js";
import { costMicros, monthSpendMicros } from "./costs.js";
import { instructions } from "./prompt.js";
import { TOOLS, runTool } from "./tools.js";
import { hasAssistantPlus } from "./entitlements.js";

// Llamadas a la IA por respuesta: cada herramienta usada es una vuelta más.
const MAX_STEPS = 6;
// Mensajes anteriores que ve la IA.
const HISTORY = 30;
// Respuestas por conversación en una hora: un loop o un abuso no gasta de más.
const MAX_REPLIES_PER_HOUR = 30;
export const DEFAULT_BUDGET_USD_CENTS = 1000;

const TEXTS = {
  "pt-BR": {
    fallback: (url) =>
      `Desculpe, agora não consigo continuar por aqui. Você pode pedir pelo cardápio: ${url}\nOu aguarde: alguém da loja vai te responder.`,
    handoff: "Certo! Vou chamar alguém da loja para continuar o atendimento por aqui.",
    confirmQuote: "Confirma o pedido? Responda *sim* para enviar ou me diga o que quer mudar.",
    created: ({ numero, total, previsao, acompanhamento }) =>
      [`✅ Recebemos seu pedido *#${numero}*! Total: ${total}.`, previsao && `Previsão: ${previsao}.`, acompanhamento && `Acompanhe aqui: ${acompanhamento}`]
        .filter(Boolean)
        .join("\n"),
  },
  es: {
    fallback: (url) => `Perdón, ahora no puedo seguir por acá. Podés pedir desde el menú: ${url}\nO esperá: alguien del local te va a responder.`,
    handoff: "¡Listo! Llamo a alguien del local para que siga atendiéndote por acá.",
    confirmQuote: "¿Confirmás el pedido? Respondé *sí* para enviarlo o decime qué querés cambiar.",
    created: ({ numero, total, previsao, acompanhamento }) =>
      [`✅ ¡Recibimos tu pedido *#${numero}*! Total: ${total}.`, previsao && `Tiempo estimado: ${previsao}.`, acompanhamento && `Seguilo acá: ${acompanhamento}`]
        .filter(Boolean)
        .join("\n"),
  },
};
const textsFor = (locale) => TEXTS[locale] ?? TEXTS["pt-BR"];

export const preview = (text) => text.replace(/\s+/g, " ").trim().slice(0, 120);

// Guarda un mensaje y lo refleja en la conversación (último mensaje, vista previa).
export async function addMessage(conversation, { role, text, kind = "text", ...rest }) {
  const message = await ConversationMessage.create({
    commerce: conversation.commerce,
    conversation: conversation._id,
    role,
    kind,
    text,
    ...rest,
  });
  conversation.lastMessageAt = message.createdAt;
  conversation.preview = preview(text);
  conversation.lastRole = role;
  if (role === "customer") conversation.lastCustomerMessageAt = message.createdAt;
  await conversation.save();
  return message;
}

// Una respuesta a la vez por conversación (dos mensajes seguidos no cruzan respuestas).
const running = new Map();
function withLock(key, task) {
  const previous = running.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  running.set(key, next);
  next
    .finally(() => {
      if (running.get(key) === next) running.delete(key);
    })
    .catch(() => {});
  return next;
}

// Lo anterior de la conversación, en texto. Las herramientas de respuestas anteriores no
// se repiten: lo importante (el pedido cotado, el cliente) va en lo del momento.
async function history(conversation) {
  const recent = (await ConversationMessage.find({ conversation: conversation._id }).sort({ createdAt: -1 }).limit(HISTORY).lean()).reverse();
  const messages = [];
  for (const message of recent) {
    if (!message.text) continue;
    const role = message.role === "customer" ? "user" : "assistant";
    const text =
      message.role === "staff"
        ? `[Mensagem de uma pessoa da loja]: ${message.text}`
        : message.kind === "audio"
          ? `[Áudio] ${message.text}`
          : message.text;
    const previous = messages.at(-1);
    if (previous?.role === role) previous.content += `\n\n${text}`;
    else messages.push({ role, content: text });
  }
  while (messages[0]?.role === "assistant") messages.shift();
  return messages;
}

const emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 });

function priceUsage(model, usage) {
  const cost = costMicros(model, usage);
  if (cost === null) logger.warn({ model }, "asistente: modelo sin precio cargado, el costo cuenta 0");
  return { ...usage, costMicros: cost ?? 0 };
}

// Guarda la respuesta del asistente y suma su costo a la conversación.
async function saveReply(conversation, { text, model, usage, toolCalls }) {
  const priced = usage && priceUsage(model, usage);
  if (priced) {
    for (const key of Object.keys(priced)) conversation.usage[key] += priced[key];
  }
  return addMessage(conversation, {
    role: "assistant",
    text,
    ...(model && { model }),
    ...(priced && { usage: priced }),
    ...(toolCalls?.length && { toolCalls }),
  });
}

// No puede seguir: pasa la conversación a una persona y le deja al cliente el link del menú.
async function giveUp(conversation, store, reason, spent = {}) {
  conversation.status = "human";
  conversation.handoff = { reason, at: new Date(), by: "assistant" };
  return saveReply(conversation, { text: textsFor(conversation.locale).fallback(storeUrl(store)), ...spent });
}

// Números de pedido en la respuesta ("#12", "# 12") y frases de "estoy creando tu pedido".
const ORDER_NUMBER = /#\s?(\d+)/g;
const CREATING_ORDER = /\b(criando|creando)\b[^.\n]{0,20}\bpedido/i;

// La IA a veces dice que creó un pedido sin haber llamado a criar_pedido. Un pedido que el
// cliente cree hecho y el local nunca ve es peor que pasarle la conversación a una persona.
async function inventsOrder(text, conversation, toolCalls) {
  const created = toolCalls.some((call) => call.name === "criar_pedido" && call.output?.ok);
  const numbers = [...text.matchAll(ORDER_NUMBER)].map((match) => Number(match[1]));
  if (!numbers.length) return !created && CREATING_ORDER.test(text);
  const orders = await Order.find({ _id: { $in: conversation.orders }, commerce: conversation.commerce }).select("number").lean();
  const known = new Set(orders.map((order) => order.number));
  return numbers.some((number) => !known.has(number));
}

// El último resultado bueno de una herramienta en esta respuesta.
const lastOk = (toolCalls, name) => toolCalls.findLast((call) => call.name === name && call.output?.ok)?.output ?? null;

// Lo que cierra un pedido lo escribe el sistema, no la IA: el resumen oficial de la cotización
// (con el total que el cliente tiene que ver para poder confirmar) y la confirmación con el
// número, la previsión y el link. Así un resumen reescrito por la IA no traba el pedido.
function systemText(conversation, toolCalls) {
  if (conversation.status !== "bot") return null;
  const texts = textsFor(conversation.locale);
  const created = lastOk(toolCalls, "criar_pedido");
  if (created) return texts.created(created);
  // Solo si la última cotización salió bien: si después probó otra que falló, explica la IA.
  const quoted = toolCalls.findLast((call) => call.name === "cotar_pedido")?.output;
  if (quoted?.ok && conversation.draft?.version === quoted.versao) return `${quoted.resumo}\n\n${texts.confirmQuote}`;
  return null;
}

async function reply(conversationId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || conversation.status !== "bot") return [];
  if (conversation.channel === "whatsapp" && !(await hasAssistantPlus(conversation.commerce))) return [];
  const store = await Commerce.findOne({ _id: conversation.commerce, status: "active" });
  if (!store) return [];
  // Contesta solo si lo último que hay es del cliente.
  const last = await ConversationMessage.findOne({ conversation: conversation._id }).sort({ createdAt: -1 }).select("role").lean();
  if (last?.role !== "customer") return [];

  const provider = getAiProvider();
  if (!provider) return [await giveUp(conversation, store, "O assistente está sem IA configurada")];

  const settings = await Assistant.findOne({ commerce: store._id }).lean();
  const budgetMicros = (settings?.monthlyBudgetUsdCents ?? DEFAULT_BUDGET_USD_CENTS) * 10_000;
  if ((await monthSpendMicros(store._id)) >= budgetMicros) {
    return [await giveUp(conversation, store, "Chegou ao limite de gasto do mês")];
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentReplies = await ConversationMessage.countDocuments({ conversation: conversation._id, role: "assistant", createdAt: { $gte: hourAgo } });
  if (recentReplies >= MAX_REPLIES_PER_HOUR) return [await giveUp(conversation, store, "Muitas mensagens em pouco tempo")];

  const menu = await buildMenu(store, conversation.locale);
  const system = [
    { text: `${instructions(store.name)}\n\n${storeInfo(store, conversation.locale)}\n\n${menu.text}`, cache: true },
    { text: await momentInfo({ store, conversation }) },
  ];
  const messages = await history(conversation);
  const context = { store, conversation, menu };
  const usage = emptyUsage();
  const toolCalls = [];
  let model = provider.model;
  let text = "";
  let earlierText = "";

  try {
    for (let step = 0; step < MAX_STEPS && !text; step++) {
      const response = await provider.complete({ system, messages, tools: TOOLS, maxTokens: 1024 });
      model = response.model ?? model;
      for (const key of Object.keys(usage)) usage[key] += response.usage?.[key] ?? 0;
      const said = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      const uses = response.content.filter((block) => block.type === "tool_use");
      if (!uses.length) {
        text = said;
        break;
      }
      if (said) earlierText = said;
      messages.push({ role: "assistant", content: response.content });
      const results = [];
      for (const use of uses) {
        const output = await runTool(use.name, use.input, context);
        toolCalls.push({ name: use.name, input: use.input, output });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    // Sin el contenido: puede traer datos del cliente.
    logger.warn({ err: { name: error.name, status: error.status }, conversation: String(conversation._id) }, "asistente: falló la IA");
    // Si ya cotizó o creó el pedido, el cliente recibe eso igual: nunca "no puedo seguir" con un pedido hecho.
    const fixed = systemText(conversation, toolCalls);
    if (fixed) return [await saveReply(conversation, { text: fixed, model, usage, toolCalls })];
    return [await giveUp(conversation, store, "Falha ao falar com a IA", { model, usage, toolCalls })];
  }

  const fixed = systemText(conversation, toolCalls);
  if (fixed) return [await saveReply(conversation, { text: fixed, model, usage, toolCalls })];
  text ||= earlierText || (conversation.status === "human" ? textsFor(conversation.locale).handoff : "");
  if (!text) return [await giveUp(conversation, store, "O assistente não conseguiu responder", { model, usage, toolCalls })];
  if (await inventsOrder(text, conversation, toolCalls)) {
    logger.warn({ conversation: String(conversation._id) }, "asistente: dijo que creó un pedido que no existe");
    return [await giveUp(conversation, store, "O assistente disse que criou um pedido que não existe", { model, usage, toolCalls })];
  }
  return [await saveReply(conversation, { text, model, usage, toolCalls })];
}

// Contesta lo último que escribió el cliente. Devuelve los mensajes nuevos del asistente
// (ninguno si la conversación la atiende una persona o no hay nada que contestar).
export const replyTo = (conversationId) => withLock(String(conversationId), () => reply(conversationId));

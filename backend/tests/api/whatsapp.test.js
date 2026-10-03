import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import Assistant from "../../src/models/assistant.model.js";
import Conversation from "../../src/models/conversation.model.js";
import ConversationMessage from "../../src/models/conversationMessage.model.js";
import Customer from "../../src/models/customer.model.js";
import Order from "../../src/models/order.model.js";
import { hashPassword } from "../../src/lib/passwords.js";
import { setAiProvider } from "../../src/services/assistant/ai.js";
import { setTranscriber } from "../../src/services/assistant/transcription.js";
import { setSpeaker } from "../../src/services/assistant/voice.js";
import { flushReplies, setReplyDelay, settleWebhooks } from "../../src/services/assistant/whatsapp.js";
import { setWhatsappClient } from "../../src/services/assistant/whatsappCloud.js";
import { createCommerceWithOwner, createMenu, loginAs } from "../helpers.js";

const app = createApp();
const PHONE_ID = "109876543210";
const SECRET = "secreto-de-prueba";

// IA de mentira (como en assistant.test.js): responde en orden y guarda lo que le pidieron.
function fakeAi(steps) {
  const calls = [];
  setAiProvider({
    name: "fake",
    model: "claude-haiku-4-5-20251001",
    async complete(request) {
      calls.push(JSON.parse(JSON.stringify(request)));
      const step = steps.shift();
      if (!step) throw new Error("la IA de prueba no tiene más respuestas");
      return step;
    },
  });
  return calls;
}
const usage = { inputTokens: 100, outputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0 };
const say = (text) => ({ content: [{ type: "text", text }], stopReason: "end_turn", usage });
const use = (name, input) => ({ content: [{ type: "tool_use", id: `t-${name}`, name, input }], stopReason: "tool_use", usage });

// WhatsApp de mentira: guarda lo que se mandó.
let whatsapp;
beforeEach(() => {
  whatsapp = { sent: [], read: [], audios: [] };
  setWhatsappClient({
    sendText: async (message) => {
      whatsapp.sent.push(message);
      return ["wamid.saliente"];
    },
    markRead: async (message) => whatsapp.read.push(message),
    sendAudio: async (message) => whatsapp.audios.push(message),
    downloadMedia: async () => ({ buffer: Buffer.from("audio"), mimeType: "audio/ogg" }),
  });
  setReplyDelay(60_000);
});
afterEach(async () => {
  await flushReplies();
  setAiProvider(undefined);
  setTranscriber(undefined);
  setSpeaker(undefined);
});

const incoming = ({ from = "5555999991234", id = `wamid.${randomUUID()}`, name = "Maria", type = "text", body = "oi", phoneNumberId = PHONE_ID } = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "555599990000", phone_number_id: phoneNumberId },
            contacts: [{ profile: { name }, wa_id: from }],
            messages: [
              type === "audio"
                ? { from, id, timestamp: "1", type, audio: { id: "media-1", mime_type: "audio/ogg; codecs=opus", voice: true } }
                : type === "text"
                  ? { from, id, timestamp: "1", type, text: { body } }
                  : { from, id, timestamp: "1", type, image: { id: "media-2" } },
            ],
          },
        },
      ],
    },
  ],
});

// Como Meta: el cuerpo firmado con el App Secret.
async function webhook(payload, signature) {
  const raw = JSON.stringify(payload);
  const res = await request(app)
    .post("/api/whatsapp/webhook")
    .set("Content-Type", "application/json")
    .set("X-Hub-Signature-256", signature ?? `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`)
    .send(raw);
  await settleWebhooks();
  return res;
}

async function setup({ enabled = true } = {}) {
  const { commerce, owner } = await createCommerceWithOwner({ slug: "loja-zap", paymentMethods: ["cash", "pix"] });
  await createMenu(commerce);
  await Assistant.create({ commerce: commerce._id, enabled, phoneNumberId: PHONE_ID });
  return { commerce, owner };
}

describe("webhook de WhatsApp", () => {
  it("Meta verifica el webhook con nuestro token", async () => {
    const ok = await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "verificacion-de-prueba", "hub.challenge": "desafio-123" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("desafio-123");
    const wrong = await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "x" });
    expect(wrong.status).toBe(403);
  });

  it("sin la firma de Meta no se acepta nada", async () => {
    await setup();
    expect((await webhook(incoming(), "sha256=00")).status).toBe(401);
    const unsigned = await request(app).post("/api/whatsapp/webhook").send(incoming());
    expect(unsigned.status).toBe(401);
    expect(await ConversationMessage.countDocuments()).toBe(0);
  });

  it("un mensaje de texto: conversación nueva, respuesta del asistente por WhatsApp", async () => {
    await setup();
    const calls = fakeAi([say("Olá, Maria! O que vai ser hoje?")]);
    const res = await webhook(incoming({ body: "oi, boa noite" }));
    expect(res.body).toEqual({ ok: true });

    const conversation = await Conversation.findOne().lean();
    expect(conversation).toMatchObject({ channel: "whatsapp", waId: "5555999991234", locale: "pt-BR", status: "bot" });
    expect(conversation.customer).toEqual({ phone: "+5555999991234", name: "Maria" });
    expect(whatsapp.read).toHaveLength(1);

    await flushReplies();
    expect(calls).toHaveLength(1);
    expect(whatsapp.sent).toEqual([{ phoneNumberId: PHONE_ID, to: "5555999991234", text: "Olá, Maria! O que vai ser hoje?" }]);
    const reply = await ConversationMessage.findOne({ role: "assistant" }).lean();
    expect(reply.delivery).toBe("sent");
  });

  it("mensajes seguidos se contestan juntos; el mismo mensaje dos veces, una sola vez", async () => {
    await setup();
    const calls = fakeAi([say("Anotado!")]);
    const first = incoming({ body: "quero um x-burger" });
    await webhook(first);
    await webhook(first);
    await webhook(incoming({ body: "sem cebola" }));
    await flushReplies();
    expect(await ConversationMessage.countDocuments({ role: "customer" })).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages.at(-1).content).toBe("quero um x-burger\n\nsem cebola");
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("un número de Uruguay empieza en español; un local sin el asistente encendido no contesta", async () => {
    await setup({ enabled: false });
    fakeAi([]);
    await webhook(incoming({ from: "59899123456" }));
    expect(await Conversation.countDocuments()).toBe(0);

    await Assistant.updateOne({}, { $set: { enabled: true } });
    fakeAi([say("¡Hola!")]);
    await webhook(incoming({ from: "59899123456" }));
    await flushReplies();
    expect(await Conversation.findOne().lean()).toMatchObject({ locale: "es", customer: { phone: "+59899123456" } });
  });

  it("si vuelve después de 12 horas, es otra conversación", async () => {
    await setup();
    fakeAi([say("Oi!"), say("Oi de novo!")]);
    await webhook(incoming());
    await flushReplies();
    await Conversation.updateOne({}, { $set: { lastCustomerMessageAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
    await webhook(incoming({ body: "voltei" }));
    await flushReplies();
    const conversations = await Conversation.find().sort({ createdAt: 1 }).lean();
    expect(conversations.map((c) => c.status)).toEqual(["closed", "bot"]);
  });

  it("encuentra la cuenta del cliente aunque WhatsApp mande el número sin el 9", async () => {
    await setup();
    await Customer.create({
      name: "Rafael Oliveira",
      phone: "+5555981112045",
      passwordHash: await hashPassword("senha-do-rafael"),
      addresses: [{ label: "Casa", street: "Rua Sete de Setembro", number: "455", neighborhood: "Centro" }],
    });
    const calls = fakeAi([say("Oi, Rafael!")]);
    await webhook(incoming({ from: "555581112045", name: "Rafa" }));
    await flushReplies();
    expect(calls[0].system[1].text).toContain("Casa: Rua Sete de Setembro, 455 — Centro");
    expect(whatsapp.sent[0].to).toBe("555581112045");
  });

  it("fotos o stickers: pide que escriba", async () => {
    await setup();
    const calls = fakeAi([]);
    await webhook(incoming({ type: "image" }));
    expect(calls).toHaveLength(0);
    expect(whatsapp.sent[0].text).toContain("só entendo mensagens de texto");
  });

  it("audios: sin transcripción pide texto; con transcripción los contesta", async () => {
    await setup();
    fakeAi([]);
    await webhook(incoming({ type: "audio" }));
    expect(whatsapp.sent.at(-1).text).toContain("não consigo ouvir áudios");

    setTranscriber(async () => "quero um x-burger ao ponto");
    const calls = fakeAi([say("Anotado!")]);
    await webhook(incoming({ type: "audio" }));
    await flushReplies();
    const audio = await ConversationMessage.findOne({ role: "customer", text: "quero um x-burger ao ponto" }).lean();
    expect(audio.kind).toBe("audio");
    expect(calls[0].messages.at(-1).content).toContain("[Áudio] quero um x-burger ao ponto");
  });
});

describe("WhatsApp: contestar con voz", () => {
  it("si el local lo activó y el cliente mandó audio, además del texto va una nota de voz corta", async () => {
    await setup();
    await Assistant.updateOne({}, { $set: { voiceReplies: true } });
    setTranscriber(async () => "quero um x-burger");
    setSpeaker(async (text) => Buffer.from(`OggS ${text}`));
    fakeAi([say("Anotado! Vai ser para entrega ou retirada?"), say("*Resumo*\n1x X-Burger\nSubtotal\nEntrega\n*Total: R$ 25,00*\nRetirada\nConfirma?"), say("Pode ser!")]);

    await webhook(incoming({ type: "audio" }));
    await flushReplies();
    expect(whatsapp.sent.at(-1).text).toBe("Anotado! Vai ser para entrega ou retirada?");
    expect(whatsapp.audios).toHaveLength(1);
    expect(whatsapp.audios[0]).toMatchObject({ phoneNumberId: PHONE_ID, to: "5555999991234" });
    expect(whatsapp.audios[0].audio.toString()).toBe("OggS Anotado! Vai ser para entrega ou retirada?");

    // El resumen, aunque haya mandado audio, va solo por escrito.
    await webhook(incoming({ type: "audio" }));
    await flushReplies();
    expect(whatsapp.audios).toHaveLength(1);

    // Si escribe, se le contesta escrito.
    await webhook(incoming({ body: "retiro" }));
    await flushReplies();
    expect(whatsapp.audios).toHaveLength(1);
  });
});

describe("WhatsApp desde el panel", () => {
  it("una persona toma la conversación, contesta por WhatsApp y la devuelve", async () => {
    const { owner } = await setup();
    const agent = await loginAs(app, owner.email);
    fakeAi([say("Oi!")]);
    await webhook(incoming());
    await flushReplies();
    const { _id: id } = await Conversation.findOne().lean();

    await agent.post(`/api/owner/assistant/conversations/${id}/takeover`);
    const calls = fakeAi([]);
    await webhook(incoming({ body: "quero falar com alguém" }));
    await flushReplies();
    expect(calls).toHaveLength(0);
    expect((await Conversation.findById(id).lean()).lastRole).toBe("customer");

    const reply = await agent.post(`/api/owner/assistant/conversations/${id}/messages`).send({ text: "Oi! Aqui é o João da loja." });
    expect(reply.status).toBe(201);
    expect(reply.body.message.delivery).toBe("sent");
    expect(whatsapp.sent.at(-1)).toEqual({ phoneNumberId: PHONE_ID, to: "5555999991234", text: "Oi! Aqui é o João da loja." });

    // Lo último es del local: al devolverla, el asistente no contesta nada.
    await agent.post(`/api/owner/assistant/conversations/${id}/release`);
    await flushReplies();
    expect(whatsapp.sent).toHaveLength(2);

    // Pasadas 24 h, WhatsApp no deja escribirle.
    await Conversation.updateOne({ _id: id }, { $set: { lastCustomerMessageAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    const late = await agent.post(`/api/owner/assistant/conversations/${id}/messages`).send({ text: "Ainda está aí?" });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("WHATSAPP_WINDOW_CLOSED");
  });

  it("al devolverla con un mensaje del cliente sin contestar, el asistente lo contesta", async () => {
    const { owner } = await setup();
    const agent = await loginAs(app, owner.email);
    fakeAi([use("chamar_atendente", { motivo: "Quer falar com uma pessoa" }), say("")]);
    await webhook(incoming({ body: "quero falar com uma pessoa" }));
    await flushReplies();
    const { _id: id } = await Conversation.findOne().lean();
    await webhook(incoming({ body: "deixa, quero um x-burger" }));
    fakeAi([say("Claro! Qual o ponto da carne?")]);
    await agent.post(`/api/owner/assistant/conversations/${id}/release`);
    await flushReplies();
    expect(whatsapp.sent.at(-1).text).toBe("Claro! Qual o ponto da carne?");
  });

  it("un pedido por WhatsApp: queda en la cuenta del cliente y le avisa los cambios de estado", async () => {
    const { commerce, owner } = await setup();
    const account = await Customer.create({ name: "Maria", phone: "+5555999991234", passwordHash: await hashPassword("senha-da-maria") });
    const quote = {
      itens: [{ produto: "P1", quantidade: 1, opcoes: [{ opcao: "G1-2" }] }],
      tipo: "retirada",
      pagamento: "pix",
      nome: "Maria",
      idioma: "pt-BR",
    };
    fakeAi([use("cotar_pedido", quote), say("Resumo... Confirma?")]);
    await webhook(incoming({ body: "um x-burger ao ponto, retiro, pix" }));
    await flushReplies();
    fakeAi([use("criar_pedido", { versao: 1 }), say("Pedido #1 confirmado!")]);
    await webhook(incoming({ body: "sim" }));
    await flushReplies();

    const order = await Order.findOne({ commerce: commerce._id }).lean();
    expect(order).toMatchObject({ channel: "whatsapp", status: "new" });
    expect(String(order.account)).toBe(String(account._id));

    const agent = await loginAs(app, owner.email);
    await agent.patch(`/api/owner/orders/${order._id}/status`).send({ status: "confirmed" });
    await vi.waitFor(() => expect(whatsapp.sent.at(-1).text).toContain("foi confirmado"));
    await agent.patch(`/api/owner/orders/${order._id}/status`).send({ status: "ready" });
    await vi.waitFor(() => expect(whatsapp.sent.at(-1).text).toContain("pronto para retirar"));
  });
});

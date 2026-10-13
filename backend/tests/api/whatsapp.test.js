import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import twilio from "twilio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import Assistant from "../../src/models/assistant.model.js";
import Conversation from "../../src/models/conversation.model.js";
import ConversationMessage from "../../src/models/conversationMessage.model.js";
import Customer from "../../src/models/customer.model.js";
import Order from "../../src/models/order.model.js";
import Subscription from "../../src/models/subscription.model.js";
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
  whatsapp = { sent: [], read: [], audios: [], downloaded: [] };
  setWhatsappClient({
    sendText: async (message) => {
      whatsapp.sent.push(message);
      return ["wamid.saliente"];
    },
    markRead: async (message) => whatsapp.read.push(message),
    sendAudio: async (message) => whatsapp.audios.push(message),
    downloadMedia: async (media) => {
      whatsapp.downloaded.push(media);
      return { buffer: Buffer.from("audio"), mimeType: "audio/ogg" };
    },
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
  await Subscription.create({ commerce: commerce._id, plan: "Member Plus", status: "active" });
  await Assistant.create({ commerce: commerce._id, enabled, phoneNumberId: PHONE_ID });
  return { commerce, owner };
}

describe("webhook de WhatsApp", () => {
  it("no atiende por WhatsApp si el comercio no tiene Member Plus activa", async () => {
    const { commerce } = await setup();
    await Subscription.deleteOne({ commerce: commerce._id });
    fakeAi([say("No debería responder")]);
    expect((await webhook(incoming())).status).toBe(200);
    expect(await Conversation.countDocuments({ commerce: commerce._id })).toBe(0);
    expect(whatsapp.sent).toEqual([]);
  });

  it("permite bloquear la automatización de un número en chats futuros", async () => {
    const { owner, commerce } = await setup();
    fakeAi([say("Hola")]);
    await webhook(incoming());
    const conversation = await Conversation.findOne({ commerce: commerce._id, channel: "whatsapp" });
    const agent = await loginAs(app, owner.email);
    const blocked = await agent.post(`/api/owner/assistant/conversations/${conversation._id}/automation-block`).send({ blocked: true });
    expect(blocked.status).toBe(200);
    expect(blocked.body.blocked).toBe(true);

    await webhook(incoming({ id: "wamid.blocked-later" }));
    const current = await Conversation.findById(conversation._id);
    expect(current).toMatchObject({ status: "human", automationBlocked: true });
    expect(whatsapp.sent).toEqual([]);

    await Conversation.updateOne({ _id: conversation._id }, { $set: { lastCustomerMessageAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
    await webhook(incoming({ id: "wamid.blocked-new-thread" }));
    const threads = await Conversation.find({ commerce: commerce._id, channel: "whatsapp" }).lean();
    expect(threads).toHaveLength(2);
    expect(threads.find((thread) => thread.status !== "closed")).toMatchObject({ status: "human", automationBlocked: true });
    expect(whatsapp.sent).toEqual([]);
  });

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

// Como Twilio: un formulario firmado con el Auth Token sobre la URL que tiene cargada.
const TWILIO_URL = "https://prueba.ngrok-free.app/api/whatsapp/twilio";
const TWILIO_TOKEN = "token-de-twilio-de-prueba";
const SANDBOX = "14155238886";

const twilioIncoming = ({ from = "5555999991234", body = "oi", ...media } = {}) => ({
  MessageSid: `SM${randomUUID().replaceAll("-", "")}`,
  AccountSid: "AC00000000000000000000000000000000",
  From: `whatsapp:+${from}`,
  To: `whatsapp:+${SANDBOX}`,
  Body: body,
  ProfileName: "Maria",
  WaId: from,
  NumMedia: "0",
  ...media,
});

async function twilioWebhook(params, signature) {
  const res = await request(app)
    .post("/api/whatsapp/twilio")
    .type("form")
    .set("X-Twilio-Signature", signature ?? twilio.getExpectedTwilioSignature(TWILIO_TOKEN, TWILIO_URL, params))
    .send(params);
  await settleWebhooks();
  return res;
}

describe("webhook de Twilio", () => {
  beforeEach(() => {
    config.WHATSAPP_PROVIDER = "twilio";
  });
  afterEach(() => {
    config.WHATSAPP_PROVIDER = "meta";
  });

  async function setupSandbox() {
    const result = await setup();
    await Assistant.updateOne({ commerce: result.commerce._id }, { $set: { phoneNumberId: SANDBOX } });
    return result;
  }

  it("un mensaje por el Sandbox: TwiML vacío enseguida y la respuesta sale por la API", async () => {
    await setupSandbox();
    const calls = fakeAi([say("Olá, Maria! O que vai ser hoje?")]);
    const res = await twilioWebhook(twilioIncoming({ body: "oi, boa noite" }));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/xml/);
    expect(res.text).toBe("<Response/>");

    const conversation = await Conversation.findOne().lean();
    expect(conversation).toMatchObject({ channel: "whatsapp", waId: "5555999991234", locale: "pt-BR", status: "bot" });
    expect(conversation.customer).toEqual({ phone: "+5555999991234", name: "Maria" });

    await flushReplies();
    expect(calls).toHaveLength(1);
    expect(whatsapp.sent).toEqual([{ phoneNumberId: SANDBOX, to: "5555999991234", text: "Olá, Maria! O que vai ser hoje?" }]);
  });

  it("sin la firma de Twilio para esta URL no se acepta nada", async () => {
    await setupSandbox();
    fakeAi([]);
    expect((await twilioWebhook(twilioIncoming(), "firma-falsa")).status).toBe(401);
    expect((await request(app).post("/api/whatsapp/twilio").type("form").send(twilioIncoming())).status).toBe(401);
    // Firmado para otra dirección (por ejemplo, un túnel de ngrok viejo).
    const params = twilioIncoming();
    const otherUrl = twilio.getExpectedTwilioSignature(TWILIO_TOKEN, "https://otro.ngrok-free.app/api/whatsapp/twilio", params);
    expect((await twilioWebhook(params, otherUrl)).status).toBe(401);
    expect(await ConversationMessage.countDocuments()).toBe(0);
  });

  it("cada webhook atiende solo con su proveedor elegido", async () => {
    await setupSandbox();
    fakeAi([]);
    expect((await webhook(incoming())).status).toBe(404);
    config.WHATSAPP_PROVIDER = "meta";
    expect((await twilioWebhook(twilioIncoming())).status).toBe(404);
    expect(await ConversationMessage.countDocuments()).toBe(0);
  });

  it("un audio se baja de la URL de Twilio y se contesta transcrito; una foto pide texto", async () => {
    await setupSandbox();
    setTranscriber(async () => "quero um x-burger");
    const calls = fakeAi([say("Anotado!")]);
    const mediaUrl = "https://api.twilio.com/2010-04-01/Accounts/AC0/Messages/MM1/Media/ME1";
    await twilioWebhook(twilioIncoming({ body: "", NumMedia: "1", MediaUrl0: mediaUrl, MediaContentType0: "audio/ogg" }));
    await flushReplies();
    expect(whatsapp.downloaded).toEqual([mediaUrl]);
    expect(calls[0].messages.at(-1).content).toContain("quero um x-burger");
    expect(await ConversationMessage.findOne({ role: "customer" }).lean()).toMatchObject({ kind: "audio", text: "quero um x-burger" });

    await twilioWebhook(twilioIncoming({ body: "", NumMedia: "1", MediaUrl0: mediaUrl, MediaContentType0: "image/jpeg" }));
    expect(whatsapp.sent.at(-1).text).toContain("só entendo mensagens de texto");
  });
});

// Como 360dialog: el formato de Meta, a la URL con el secreto. El sandbox no manda "object" ni el número del local.
const D360_TOKEN = "secreto-del-webhook-de-prueba";
const D360_SANDBOX = "551146733492";

async function d360Webhook(payload, token = D360_TOKEN) {
  const res = await request(app).post(`/api/whatsapp/360dialog/${token}`).send(payload);
  await settleWebhooks();
  return res;
}

const d360Incoming = (options) => {
  const { object, ...payload } = incoming(options);
  delete payload.entry[0].changes[0].value.metadata;
  return payload;
};

describe("webhook de 360dialog", () => {
  beforeEach(() => {
    config.WHATSAPP_PROVIDER = "360dialog";
  });
  afterEach(() => {
    config.WHATSAPP_PROVIDER = "meta";
  });

  async function setupSandbox() {
    const result = await setup();
    await Assistant.updateOne({ commerce: result.commerce._id }, { $set: { phoneNumberId: D360_SANDBOX } });
    return result;
  }

  it("un mensaje del sandbox va al local de D360_PHONE_NUMBER y la respuesta sale por 360dialog", async () => {
    await setupSandbox();
    const calls = fakeAi([say("Olá, Maria! O que vai ser hoje?")]);
    const res = await d360Webhook(d360Incoming({ body: "oi, boa noite" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const conversation = await Conversation.findOne().lean();
    expect(conversation).toMatchObject({ channel: "whatsapp", waId: "5555999991234", status: "bot" });
    await flushReplies();
    expect(calls).toHaveLength(1);
    expect(whatsapp.sent).toEqual([{ phoneNumberId: D360_SANDBOX, to: "5555999991234", text: "Olá, Maria! O que vai ser hoje?" }]);
  });

  it("D360_PHONE_NUMBER manda sobre el número del aviso; sin él, se usa el del aviso", async () => {
    await setupSandbox();
    fakeAi([say("Oi!"), say("Oi de novo!")]);
    // El sandbox puede mandar otro id de número: igual es el de la API key.
    const otherId = incoming({ phoneNumberId: "999888777" });
    await d360Webhook({ entry: otherId.entry });
    await flushReplies();
    expect(whatsapp.sent.at(-1)).toEqual({ phoneNumberId: D360_SANDBOX, to: "5555999991234", text: "Oi!" });

    const original = config.D360_PHONE_NUMBER;
    config.D360_PHONE_NUMBER = undefined;
    try {
      await Assistant.updateOne({}, { $set: { phoneNumberId: PHONE_ID } });
      await d360Webhook({ entry: incoming({ from: "5555999990000" }).entry });
      await flushReplies();
      expect(whatsapp.sent.at(-1)).toEqual({ phoneNumberId: PHONE_ID, to: "5555999990000", text: "Oi de novo!" });
    } finally {
      config.D360_PHONE_NUMBER = original;
    }
  });

  it("un aviso sin \"field\" se lee igual", async () => {
    await setupSandbox();
    fakeAi([say("Oi!")]);
    const payload = d360Incoming();
    delete payload.entry[0].changes[0].field;
    await d360Webhook(payload);
    await flushReplies();
    expect(whatsapp.sent).toHaveLength(1);
  });

  it("sin el secreto, o con otro proveedor elegido, no se acepta nada", async () => {
    await setupSandbox();
    fakeAi([]);
    expect((await d360Webhook(d360Incoming(), "otro-secreto-cualquiera")).status).toBe(404);
    expect((await d360Webhook(d360Incoming(), `${D360_TOKEN}x`)).status).toBe(404);
    config.WHATSAPP_PROVIDER = "twilio";
    expect((await d360Webhook(d360Incoming())).status).toBe(404);
    expect(await ConversationMessage.countDocuments()).toBe(0);
  });
});

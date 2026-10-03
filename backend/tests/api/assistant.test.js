import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Assistant from "../../src/models/assistant.model.js";
import Commerce from "../../src/models/commerce.model.js";
import Conversation from "../../src/models/conversation.model.js";
import ConversationMessage from "../../src/models/conversationMessage.model.js";
import OptionGroup from "../../src/models/optionGroup.model.js";
import Order from "../../src/models/order.model.js";
import Product from "../../src/models/product.model.js";
import { formatBRL } from "../../src/lib/money.js";
import { setAiProvider } from "../../src/services/assistant/ai.js";
import { cleanupOldConversations } from "../../src/services/assistant/privacy.js";
import { setTranscriber } from "../../src/services/assistant/transcription.js";
import { setSpeaker } from "../../src/services/assistant/voice.js";
import { createCommerceWithOwner, createMenu, createStaff, loginAs } from "../helpers.js";

const app = createApp();

// IA de mentira: devuelve las respuestas en el orden dado y guarda lo que le pidieron.
function fakeAi(steps) {
  const calls = [];
  setAiProvider({
    name: "fake",
    model: "claude-haiku-4-5-20251001",
    async complete(request) {
      calls.push(JSON.parse(JSON.stringify(request)));
      const step = steps.shift();
      if (!step) throw new Error("la IA de prueba no tiene más respuestas");
      if (step instanceof Error) throw step;
      return step;
    },
  });
  return calls;
}
const usage = { inputTokens: 1000, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 4000 };
const say = (text) => ({ content: [{ type: "text", text }], stopReason: "end_turn", usage });
const use = (name, input, id = `t-${name}`) => ({ content: [{ type: "tool_use", id, name, input }], stopReason: "tool_use", usage });

// Con el menú de los tests: P1 X-Burger (G1 ponto, G2 adicionais), P2 X-Salada, P3 Coca-Cola.
const pickupQuote = {
  itens: [
    { produto: "P1", quantidade: 1, opcoes: [{ opcao: "G1-2" }] },
    { produto: "P3", quantidade: 1 },
  ],
  tipo: "retirada",
  pagamento: "pix",
  nome: "Maria Souza",
  idioma: "pt-BR",
};
const customer = { name: "Maria", phone: "55 99999-1234" };

afterEach(() => {
  setAiProvider(undefined);
  setTranscriber(undefined);
  setSpeaker(undefined);
});

async function setup() {
  const { commerce, owner } = await createCommerceWithOwner({ slug: "loja-bot", paymentMethods: ["cash", "pix"] });
  await createMenu(commerce);
  const agent = await loginAs(app, owner.email);
  const say = (body) => agent.post("/api/owner/assistant/simulator").send({ customer, ...body });
  return { commerce, owner, agent, send: say };
}

describe("asistente: tomar un pedido", () => {
  it("cotiza, espera la confirmación del cliente y crea el pedido", async () => {
    const { commerce, send } = await setup();
    const calls = fakeAi([use("cotar_pedido", pickupQuote), say("*Resumo* ... Total R$ 31,00. Confirma?")]);

    const first = await send({ text: "quero um x-burger ao ponto e uma coca, retiro aí", realOrders: true });
    expect(first.status).toBe(201);
    expect(first.body.messages.map((m) => m.role)).toEqual(["customer", "assistant"]);
    const [quote] = first.body.messages[1].toolCalls;
    expect(quote.name).toBe("cotar_pedido");
    expect(quote.output).toMatchObject({ ok: true, versao: 1, total: formatBRL(3100) });
    expect(quote.output.resumo).toContain("1x X-Burger");
    expect(first.body.messages[1].usage.costMicros).toBeGreaterThan(0);
    // La IA ve el menú con códigos y lo que pasa ahora (sin ids de la base).
    expect(calls[0].system[0].text).toContain(`P1 X-Burger — ${formatBRL(2500)}`);
    expect(calls[0].system[0].text).toContain("G1-2 Ao ponto");
    expect(calls[0].system[0].text).not.toMatch(/[a-f\d]{24}/);
    expect(calls[0].system[1].text).toContain("Loja: ABERTA");

    fakeAi([use("criar_pedido", { versao: 1 }), say("Pedido #1 confirmado!")]);
    const second = await send({ conversationId: first.body.conversation._id, text: "sim", realOrders: true });
    expect(second.body.messages[1].toolCalls[0].output).toMatchObject({ ok: true, numero: 1, total: formatBRL(3100) });

    const order = await Order.findOne({ commerce: commerce._id }).lean();
    expect(order).toMatchObject({ channel: "whatsapp", status: "new", totalCents: 3100, fulfillment: "pickup" });
    expect(order.customer).toEqual({ name: "Maria Souza", phone: "+5555999991234" });
    expect(String(order.conversation)).toBe(first.body.conversation._id);
    expect(second.body.conversation.orders).toEqual([String(order._id)]);
  });

  it("no crea el pedido si el cliente todavía no vio el resumen", async () => {
    const { commerce, send } = await setup();
    fakeAi([use("cotar_pedido", pickupQuote), use("criar_pedido", { versao: 1 }), say("Confirma?")]);
    const res = await send({ text: "um x-burger ao ponto e uma coca, pix, retiro", realOrders: true });
    const create = res.body.messages[1].toolCalls[1];
    expect(create.output.ok).toBe(false);
    expect(create.output.erros[0]).toContain("ainda não viu");
    expect(await Order.countDocuments({ commerce: commerce._id })).toBe(0);
  });

  it("en modo prueba cotiza pero no guarda el pedido", async () => {
    const { commerce, send } = await setup();
    fakeAi([use("cotar_pedido", pickupQuote), say("Confirma?")]);
    const first = await send({ text: "um x-burger e uma coca" });
    expect(first.body.conversation.testMode).toBe(true);
    fakeAi([use("criar_pedido", { versao: 1 }), say("Pedido confirmado!")]);
    const second = await send({ conversationId: first.body.conversation._id, text: "sim" });
    expect(second.body.messages[1].toolCalls[0].output).toMatchObject({ ok: true, numero: "TESTE" });
    expect(await Order.countDocuments({ commerce: commerce._id })).toBe(0);
  });

  it("explica los problemas del pedido para resolverlos con el cliente", async () => {
    const { commerce, send } = await setup();
    fakeAi([
      use("cotar_pedido", { ...pickupQuote, itens: [{ produto: "P99", quantidade: 1 }] }, "a"),
      use("cotar_pedido", { ...pickupQuote, itens: [{ produto: "P1", quantidade: 1 }] }, "b"),
      use("cotar_pedido", { ...pickupQuote, tipo: "entrega" }, "c"),
      use("cotar_pedido", { ...pickupQuote, pagamento: "cartao" }, "d"),
      say("Preciso de mais dados"),
    ]);
    const res = await send({ text: "quero algo" });
    const [unknown, missingOption, noAddress, payment] = res.body.messages[1].toolCalls.map((call) => call.output);
    expect(unknown.erros[0]).toContain("P99 não está no cardápio");
    expect(missingOption).toMatchObject({ ok: false, codigo: "OPTION_SELECTION_INVALID" });
    expect(noAddress.erros[0]).toContain("endereço");
    expect(payment).toMatchObject({ ok: false, codigo: "PAYMENT_METHOD_NOT_AVAILABLE" });

    await Commerce.updateOne({ _id: commerce._id }, { $set: { override: { mode: "closed", until: null } } });
    fakeAi([use("cotar_pedido", pickupQuote), say("Estamos fechados")]);
    const closed = await send({ conversationId: res.body.conversation._id, text: "e agora?" });
    expect(closed.body.messages[1].toolCalls[0].output).toMatchObject({ ok: false, codigo: "STORE_CLOSED" });
  });

  it("entrega por barrio: reconoce el barrio aunque venga sin acento", async () => {
    const { commerce, send } = await setup();
    await Commerce.updateOne(
      { _id: commerce._id },
      { $set: { deliveryMode: "zones", deliveryZones: [{ name: "São Miguel", feeCents: 700 }] } }
    );
    const delivery = { ...pickupQuote, tipo: "entrega", endereco: { rua: "Rua Uruguai", numero: "10", bairro: "sao miguel" } };
    fakeAi([use("cotar_pedido", delivery, "a"), use("cotar_pedido", { ...delivery, endereco: { ...delivery.endereco, bairro: "Centro" } }, "b"), say("ok")]);
    const res = await send({ text: "entrega" });
    const [known, unknown] = res.body.messages[1].toolCalls.map((call) => call.output);
    expect(known).toMatchObject({ ok: true, total: formatBRL(3800) });
    expect(unknown.erros[0]).toContain("Bairros atendidos: São Miguel");
  });
});

describe("asistente: cuando no sigue solo", () => {
  it("chamar_atendente pasa la conversación a una persona y el asistente se calla", async () => {
    const { send } = await setup();
    fakeAi([use("chamar_atendente", { motivo: "Reclamação de pedido" }), say("")]);
    const res = await send({ text: "meu pedido veio errado!" });
    expect(res.body.conversation).toMatchObject({ status: "human", handoff: { reason: "Reclamação de pedido" } });
    expect(res.body.messages[1].text).toContain("Vou chamar alguém da loja");

    const calls = fakeAi([]);
    const after = await send({ conversationId: res.body.conversation._id, text: "alô?" });
    expect(after.body.messages).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it("si la IA falla, deja el link del menú y pasa a una persona", async () => {
    const { send } = await setup();
    fakeAi([new Error("timeout")]);
    const res = await send({ text: "oi", locale: "es" });
    expect(res.body.messages[1].text).toContain("http://localhost:5173/loja-bot");
    expect(res.body.conversation.status).toBe("human");
  });

  it("con el tope del mes alcanzado no llama a la IA", async () => {
    const { commerce, send } = await setup();
    await Assistant.create({ commerce: commerce._id, monthlyBudgetUsdCents: 0 });
    const calls = fakeAi([say("oi")]);
    const res = await send({ text: "oi" });
    expect(calls).toHaveLength(0);
    expect(res.body.conversation).toMatchObject({ status: "human", handoff: { reason: "Chegou ao limite de gasto do mês" } });
  });

  it("sin IA configurada, el simulador avisa", async () => {
    const { send } = await setup();
    setAiProvider(null);
    const res = await send({ text: "oi" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ASSISTANT_UNAVAILABLE");
  });
});

describe("asistente: panel", () => {
  it("el equipo ve y atiende las conversaciones; configurar es del dueño", async () => {
    const { commerce, agent, send } = await setup();
    fakeAi([say("Olá! O que vai querer hoje?")]);
    const { body } = await send({ text: "oi" });
    const id = body.conversation._id;

    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-bot@test.local");
    expect((await staff.get("/api/owner/assistant")).status).toBe(403);
    expect((await staff.post("/api/owner/assistant/simulator").send({ customer, text: "oi" })).status).toBe(403);
    const list = await staff.get("/api/owner/assistant/conversations?channel=simulator");
    expect(list.body.conversations.map((c) => c._id)).toEqual([id]);
    expect(list.body.conversations[0].preview).toBe("Olá! O que vai querer hoje?");

    const detail = await staff.get(`/api/owner/assistant/conversations/${id}`);
    expect(detail.body.messages.map((m) => m.text)).toEqual(["oi", "Olá! O que vai querer hoje?"]);

    const reply = await staff.post(`/api/owner/assistant/conversations/${id}/messages`).send({ text: "Aqui é o João da loja" });
    expect(reply.status).toBe(201);
    expect(reply.body.conversation.status).toBe("human");
    expect((await agent.post(`/api/owner/assistant/conversations/${id}/release`)).body.conversation).toMatchObject({ status: "bot", handoff: null });
    expect((await agent.post(`/api/owner/assistant/conversations/${id}/takeover`)).body.conversation.status).toBe("human");
  });

  it("otro local no ve las conversaciones", async () => {
    const { send } = await setup();
    fakeAi([say("Olá!")]);
    const { body } = await send({ text: "oi" });
    const other = await createCommerceWithOwner({ slug: "loja-outra" });
    const intruder = await loginAs(app, other.owner.email);
    expect((await intruder.get(`/api/owner/assistant/conversations/${body.conversation._id}`)).status).toBe(404);
    expect((await intruder.post(`/api/owner/assistant/conversations/${body.conversation._id}/takeover`)).status).toBe(404);
    expect((await intruder.get("/api/owner/assistant/conversations")).body.conversations).toEqual([]);
    const reuse = await intruder.post("/api/owner/assistant/simulator").send({ customer, text: "oi", conversationId: body.conversation._id });
    expect(reuse.status).toBe(404);
  });

  it("configura el asistente y muestra el gasto del mes", async () => {
    const { agent, send } = await setup();
    fakeAi([use("cotar_pedido", pickupQuote), say("Confirma?")]);
    const first = await send({ text: "x-burger e coca", realOrders: true });
    fakeAi([use("criar_pedido", { versao: 1 }), say("Feito!")]);
    await send({ conversationId: first.body.conversation._id, text: "sim", realOrders: true });

    const res = await agent.patch("/api/owner/assistant").send({ enabled: true, phoneNumberId: "123456789012345", monthlyBudgetUsdCents: 500 });
    expect(res.status).toBe(200);
    expect(res.body.assistant).toMatchObject({ enabled: true, phoneNumberId: "123456789012345", monthlyBudgetUsdCents: 500 });
    expect(res.body.assistant.month).toMatchObject({ conversations: 1, orders: 1 });
    // 4 llamadas a la IA de prueba: 4 × (1000 × 1 + 100 × 5 + 4000 × 0,1) = 7600 millonésimos.
    expect(res.body.assistant.month.costMicros).toBe(7600);
    expect(res.body.assistant.available.ai).toBe(true);

    const other = await createCommerceWithOwner({ slug: "loja-outra" });
    const otherAgent = await loginAs(app, other.owner.email);
    const taken = await otherAgent.patch("/api/owner/assistant").send({ phoneNumberId: "123456789012345" });
    expect(taken.status).toBe(409);
    expect((await agent.patch("/api/owner/assistant").send({ phoneNumberId: "abc" })).status).toBe(400);
    expect((await agent.patch("/api/owner/assistant").send({})).status).toBe(400);
  });

  it("los pedidos del panel siguen entrando confirmados y los del menú como nuevos", async () => {
    const { commerce, agent } = await setup();
    const xSalada = await Product.findOne({ commerce: commerce._id, name: "X-Salada" });
    const ponto = await OptionGroup.findOne({ commerce: commerce._id, name: "Ponto da carne" });
    const items = [{ productId: String(xSalada._id), quantity: 1, options: [{ groupId: String(ponto._id), optionId: String(ponto.options[0]._id) }] }];
    const manual = await agent.post("/api/owner/orders").send({ channel: "whatsapp", customer, fulfillment: "pickup", paymentMethod: "cash", items });
    expect(manual.body.order).toMatchObject({ channel: "whatsapp", status: "confirmed", conversation: null });
    expect(await Conversation.countDocuments()).toBe(0);
  });
});

describe("asistente: privacidad", () => {
  it("al borrar la cuenta del cliente se borran sus conversaciones", async () => {
    const { send } = await setup();
    fakeAi([say("Olá!")]);
    await send({ text: "oi" });
    const cliente = request.agent(app);
    await cliente.post("/api/customer/signup").send({ name: "Maria", phone: customer.phone, password: "senha-da-maria-1" });
    expect((await cliente.post("/api/customer/me/delete").send({ password: "senha-da-maria-1" })).status).toBe(204);
    expect(await Conversation.countDocuments()).toBe(0);
    expect(await ConversationMessage.countDocuments()).toBe(0);
  });

  it("lo de más de 90 días se borra solo", async () => {
    const { send } = await setup();
    fakeAi([say("Olá!"), say("Oi de novo")]);
    const old = await send({ text: "oi" });
    await send({ text: "oi", customer: { name: "Ana", phone: "55 98888-7777" } });
    const longAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await Conversation.updateOne({ _id: old.body.conversation._id }, { $set: { lastMessageAt: longAgo } });
    expect(await cleanupOldConversations()).toEqual({ conversationsDeleted: 1, messagesDeleted: 0 });
    expect(await Conversation.countDocuments()).toBe(1);
    expect(await ConversationMessage.countDocuments()).toBe(2);
  });
});

describe("asistente: notas de voz en el simulador", () => {
  const audio = Buffer.from("audio de mentira ".repeat(20)).toString("base64");

  it("transcribe el audio y lo contesta como si fuera texto", async () => {
    const { agent } = await setup();
    const heard = [];
    setTranscriber(async (buffer, locale) => {
      heard.push({ size: buffer.length, locale });
      return "quero um x-burger ao ponto";
    });
    const calls = fakeAi([say("Anotado!")]);
    const res = await agent.post("/api/owner/assistant/simulator/audio").send({ customer, audio, locale: "es" });
    expect(res.status).toBe(201);
    expect(res.body.messages[0]).toMatchObject({ role: "customer", kind: "audio", text: "quero um x-burger ao ponto" });
    expect(heard).toEqual([{ size: 340, locale: "es" }]);
    expect(calls[0].messages.at(-1).content).toBe("[Áudio] quero um x-burger ao ponto");
  });

  it("sin transcripción, o si no se entiende, avisa", async () => {
    const { agent } = await setup();
    fakeAi([]);
    const off = await agent.post("/api/owner/assistant/simulator/audio").send({ customer, audio });
    expect(off.status).toBe(503);
    expect(off.body.error.code).toBe("TRANSCRIPTION_UNAVAILABLE");

    setTranscriber(async () => null);
    const unclear = await agent.post("/api/owner/assistant/simulator/audio").send({ customer, audio });
    expect(unclear.status).toBe(422);
    expect(unclear.body.error.code).toBe("AUDIO_NOT_UNDERSTOOD");
    expect((await agent.post("/api/owner/assistant/simulator/audio").send({ customer, audio: "no es base64!" })).status).toBe(400);
  });
});

describe("asistente: voz", () => {
  it("el panel escucha cómo suena una respuesta", async () => {
    const { agent } = await setup();
    expect((await agent.post("/api/owner/assistant/speech").send({ text: "Oi!" })).status).toBe(503);
    const said = [];
    setSpeaker(async (text, locale) => {
      said.push({ text, locale });
      return Buffer.from("OggS nota de voz");
    });
    const res = await agent.post("/api/owner/assistant/speech").send({ text: "Seu pedido *#12* sai em 20–30 min 🛵", locale: "pt-BR" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch("audio/ogg");
    expect(said).toEqual([{ text: "Seu pedido número doze sai em vinte a trinta minutos", locale: "pt-BR" }]);
    expect((await agent.get("/api/owner/assistant")).body.assistant.available.voice).toBe(true);
  });
});

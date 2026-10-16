import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Assistant from "../../src/models/assistant.model.js";
import Conversation from "../../src/models/conversation.model.js";
import ConversationMessage from "../../src/models/conversationMessage.model.js";
import Order from "../../src/models/order.model.js";
import Review from "../../src/models/review.model.js";
import Subscription from "../../src/models/subscription.model.js";
import { requestPendingReviews } from "../../src/services/assistant/reviewRequest.js";
import { setWhatsappClient } from "../../src/services/assistant/whatsappCloud.js";
import { createCommerceWithOwner, createMenu, createStaff, loginAs } from "../helpers.js";

const app = createApp();
const PHONE_ID = "109876543210";
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

let sent, commerce, owner, menu, nextNumber;
beforeEach(async () => {
  sent = [];
  nextNumber = 7;
  setWhatsappClient({ sendText: async (message) => (sent.push(message), ["wamid.saliente"]), markRead: async () => {} });
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a", name: "Loja A" }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-loja-a@test.local");
  await Subscription.create({ commerce: commerce._id, plan: "Plus", status: "active" });
  await Assistant.create({ commerce: commerce._id, enabled: true, phoneNumberId: PHONE_ID });
});
afterEach(() => setWhatsappClient(undefined));

// Un pedido entregado hace `deliveredMinutes`, que vino (o no) de una conversación de WhatsApp.
async function deliveredOrder({ deliveredMinutes = 90, lastMessageMinutes = 120, conversation = true, locale = "pt-BR", status = "delivered" } = {}) {
  const chat = conversation
    ? await Conversation.create({ commerce: commerce._id, channel: "whatsapp", waId: "5555999991234", customer: { name: "Maria Souza", phone: "+5555999991234" }, lastCustomerMessageAt: minutesAgo(lastMessageMinutes) })
    : null;
  const at = minutesAgo(deliveredMinutes);
  const { insertedId } = await Order.collection.insertOne({
    commerce: commerce._id, clientOrderId: randomUUID(), number: nextNumber++, status, locale, trackingToken: randomUUID().replaceAll("-", ""),
    conversation: chat?._id ?? null, channel: "whatsapp", customer: { name: "Maria Souza", phone: "+55 55 99999-1234" }, fulfillment: "pickup",
    paymentMethod: "pix", items: [{ product: menu.coca._id, name: "Coca", quantity: 1, unitPriceCents: 600, totalCents: 600, options: [] }],
    subtotalCents: 600, deliveryFeeCents: 0, totalCents: 600, scheduledFor: null, reviewRequestedAt: null,
    statusHistory: [{ status: "new", at: minutesAgo(deliveredMinutes + 40) }, { status, at }], createdAt: minutesAgo(deliveredMinutes + 40), updatedAt: at,
  });
  return { id: String(insertedId), chat };
}

describe("pedir la reseña por el WhatsApp del local", () => {
  it("dice si se puede y la manda en el idioma del pedido, sin sacarle la conversación al asistente", async () => {
    const { id, chat } = await deliveredOrder({ locale: "es" });
    expect((await owner.get(`/api/owner/orders/${id}/review-request`)).body).toEqual({ inApp: true, reason: null, requestedAt: null });

    const res = await owner.post(`/api/owner/orders/${id}/review-request`);
    expect(res.status).toBe(200);
    expect(res.body.requestedAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ phoneNumberId: PHONE_ID, to: "5555999991234" });
    expect(sent[0].text).toMatch(/^¡Hola, Maria! Gracias por tu pedido #7 en Loja A\. ¿Nos contás cómo estuvo\?/);
    expect(sent[0].text).toContain("/pedido/");
    expect(await ConversationMessage.countDocuments({ conversation: chat._id, role: "staff" })).toBe(1);
    expect((await Conversation.findById(chat._id)).status).toBe("bot");
    expect((await owner.get(`/api/owner/orders/${id}`)).body.order.reviewRequestedAt).toBe(res.body.requestedAt);
  });

  it("explica por qué no se puede: sin conversación, ventana cerrada, sin número, ya opinó o no entregado", async () => {
    const reasonOf = async (id) => (await owner.get(`/api/owner/orders/${id}/review-request`)).body.reason;

    const noChat = await deliveredOrder({ conversation: false });
    expect(await reasonOf(noChat.id)).toBe("NO_CONVERSATION");
    const old = await deliveredOrder({ lastMessageMinutes: 25 * 60 });
    expect(await reasonOf(old.id)).toBe("WINDOW_CLOSED");
    const cooking = await deliveredOrder({ status: "confirmed" });
    expect(await reasonOf(cooking.id)).toBe("NOT_DELIVERED");
    const reviewed = await deliveredOrder();
    await Review.create({ commerce: commerce._id, order: reviewed.id, orderNumber: 7, customerName: "Maria", rating: 5 });
    expect(await reasonOf(reviewed.id)).toBe("REVIEWED");

    const closed = await owner.post(`/api/owner/orders/${old.id}/review-request`);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe("WINDOW_CLOSED");

    await Assistant.updateOne({ commerce: commerce._id }, { $set: { phoneNumberId: null } });
    const fresh = await deliveredOrder();
    expect(await reasonOf(fresh.id)).toBe("NOT_CONNECTED");
    expect(sent).toEqual([]);
  });

  it("si WhatsApp no acepta el mensaje, avisa y no lo marca como pedido", async () => {
    setWhatsappClient({ sendText: async () => { throw Object.assign(new Error("caído"), { status: 500 }); } });
    const { id } = await deliveredOrder();
    const res = await owner.post(`/api/owner/orders/${id}/review-request`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("WHATSAPP_SEND_FAILED");
    expect((await Order.findById(id)).reviewRequestedAt).toBeNull();
  });

  it("un empleado puede pedirla; el pedido de otro local da 404", async () => {
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-a@test.local");
    const { id } = await deliveredOrder();
    expect((await staff.post(`/api/owner/orders/${id}/review-request`)).status).toBe(200);

    await createCommerceWithOwner({ slug: "loja-b" });
    const other = await loginAs(app, "dono-loja-b@test.local");
    expect((await other.get(`/api/owner/orders/${id}/review-request`)).status).toBe(404);
    expect((await other.post(`/api/owner/orders/${id}/review-request`)).status).toBe(404);
    expect((await request(app).post(`/api/owner/orders/${id}/review-request`)).status).toBe(401);
  });
});

describe("pedir la reseña sola después de la entrega", () => {
  it("solo con la opción activada, pasado el tiempo elegido, una vez y dentro de la ventana", async () => {
    const recent = await deliveredOrder({ deliveredMinutes: 20 });
    const due = await deliveredOrder({ deliveredMinutes: 70 });
    const closed = await deliveredOrder({ deliveredMinutes: 70, lastMessageMinutes: 25 * 60 });

    expect(await requestPendingReviews()).toBe(0);

    const settings = await owner.patch("/api/owner/assistant").send({ autoReviewRequest: true, reviewDelayMinutes: 60 });
    expect(settings.body.assistant).toMatchObject({ autoReviewRequest: true, reviewDelayMinutes: 60 });
    expect((await owner.patch("/api/owner/assistant").send({ reviewDelayMinutes: 45 })).status).toBe(400);

    expect(await requestPendingReviews()).toBe(1);
    expect(sent).toHaveLength(1);
    expect((await Order.findById(due.id)).reviewRequestedAt).not.toBeNull();
    expect((await Order.findById(recent.id)).reviewRequestedAt).toBeNull();
    expect((await Order.findById(closed.id)).reviewRequestedAt).toBeNull();
    // Lo manda el asistente: queda como suyo en la conversación.
    expect(await ConversationMessage.countDocuments({ conversation: due.chat._id, role: "assistant" })).toBe(1);

    // Otra vuelta no lo repite.
    expect(await requestPendingReviews()).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("no le escribe a un número que el local pidió no automatizar", async () => {
    await Assistant.updateOne({ commerce: commerce._id }, { $set: { autoReviewRequest: true } });
    const { chat } = await deliveredOrder({ deliveredMinutes: 90 });
    await Conversation.updateOne({ _id: chat._id }, { $set: { automationBlocked: true } });
    expect(await requestPendingReviews()).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("reseña también en Google", () => {
  it("el local guarda su link de Google y el seguimiento lo muestra", async () => {
    const url = "https://g.page/r/CQ1aBcDeFgHiEBM/review";
    const res = await owner.patch("/api/owner/store").send({ googleReviewUrl: url });
    expect(res.status).toBe(200);
    expect(res.body.store.googleReviewUrl).toBe(url);
    for (const valid of ["https://search.google.com/local/writereview?placeid=ChIJabc", "https://maps.app.goo.gl/abc123", ""]) {
      expect((await owner.patch("/api/owner/store").send({ googleReviewUrl: valid })).status).toBe(200);
    }
    for (const invalid of ["http://g.page/r/abc", "https://example.com/review", "https://google.com.evil.io/x"]) {
      expect((await owner.patch("/api/owner/store").send({ googleReviewUrl: invalid })).status).toBe(400);
    }

    await owner.patch("/api/owner/store").send({ googleReviewUrl: url });
    const { id } = await deliveredOrder({ conversation: false });
    const order = await Order.findById(id);
    const tracking = await request(app).get(`/api/public/orders/${order.trackingToken}`);
    expect(tracking.body.store.googleReviewUrl).toBe(url);
  });
});

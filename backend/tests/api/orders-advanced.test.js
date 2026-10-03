import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import Commerce from "../../src/models/commerce.model.js";
import Coupon from "../../src/models/coupon.model.js";
import Order from "../../src/models/order.model.js";
import { containsKey, createCommerceWithOwner, createMenu, createStaff, loginAs } from "../helpers.js";

const app = createApp();

let commerce, owner, menu;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a", deliveryFeeCents: 500 }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-loja-a@test.local");
});
afterEach(() => vi.useRealTimers());

// 5 Coca (R$ 30,00) con entrega de R$ 5,00.
const orderBody = (changes = {}) => ({
  clientOrderId: randomUUID(),
  customer: { name: "Maria Souza", phone: "55 99999-1234" },
  fulfillment: "delivery",
  address: { street: "Rua Brasil", number: "10", neighborhood: "Centro", reference: "Casa azul" },
  paymentMethod: "cash",
  items: [{ productId: String(menu.coca._id), quantity: 5 }],
  ...changes,
});
const postOrder = (body) => request(app).post("/api/public/stores/loja-a/orders").send(body);
const tokenOf = (receipt) => receipt.body.trackingUrl.split("/").at(-1);

describe("cupones", () => {
  const createCoupon = (data) => owner.post("/api/owner/coupons").send(data);

  it("se crean en mayúsculas y el código no se repite", async () => {
    const res = await createCoupon({ code: "demo10", type: "percent", value: 10 });
    expect(res.status).toBe(201);
    expect(res.body.coupon).toMatchObject({ code: "DEMO10", uses: 0, active: true });

    const again = await createCoupon({ code: "Demo10", type: "fixed", value: 500 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("COUPON_CODE_TAKEN");
  });

  it.each([
    ["porcentaje mayor que 100", { code: "MUCHO", type: "percent", value: 150 }],
    ["valor fijo en cero", { code: "NADA", type: "fixed", value: 0 }],
    ["termina antes de empezar", { code: "RARO", type: "percent", value: 5, startsAt: "2026-10-10T00:00:00Z", endsAt: "2026-10-01T00:00:00Z" }],
  ])("rechaza %s", async (_caso, data) => {
    const res = await createCoupon(data);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_COUPON");
  });

  it("descuentan del pedido y se ven en el mensaje", async () => {
    await createCoupon({ code: "DEMO10", type: "percent", value: 10 });
    const res = await postOrder(orderBody({ couponCode: "demo10" }));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      subtotalCents: 3000,
      discountCents: 300,
      deliveryFeeCents: 500,
      totalCents: 3200,
      coupon: { code: "DEMO10", type: "percent", value: 10 },
    });
    expect(res.body.whatsapp.message).toContain("Desconto (DEMO10): -R$ 3,00");
    expect((await Coupon.findOne({ code: "DEMO10" })).uses).toBe(1);
  });

  it("entrega grátis descuenta la tarifa y solo vale para delivery", async () => {
    await createCoupon({ code: "FRETE", type: "free_delivery" });
    const delivery = await postOrder(orderBody({ couponCode: "FRETE" }));
    expect(delivery.body.order).toMatchObject({ discountCents: 500, totalCents: 3000 });
    const pickup = await postOrder(orderBody({ couponCode: "FRETE", fulfillment: "pickup" }));
    expect(pickup.body.error.code).toBe("COUPON_NOT_APPLICABLE");
  });

  it("valida mínimo, vigencia, usos por cliente y usos totales", async () => {
    await createCoupon({ code: "MINIMO", type: "fixed", value: 500, minOrderCents: 5000 });
    expect((await postOrder(orderBody({ couponCode: "MINIMO" }))).body.error.code).toBe("COUPON_MIN_ORDER");

    await createCoupon({ code: "VELHO", type: "fixed", value: 500, endsAt: "2020-01-01T00:00:00Z" });
    expect((await postOrder(orderBody({ couponCode: "VELHO" }))).body.error.code).toBe("COUPON_EXPIRED");

    expect((await postOrder(orderBody({ couponCode: "NAOEXISTE" }))).body.error.code).toBe("COUPON_INVALID");

    await createCoupon({ code: "UMAVEZ", type: "fixed", value: 500, maxUsesPerCustomer: 1 });
    expect((await postOrder(orderBody({ couponCode: "UMAVEZ" }))).status).toBe(201);
    expect((await postOrder(orderBody({ couponCode: "UMAVEZ" }))).body.error.code).toBe("COUPON_ALREADY_USED");
    const otherCustomer = orderBody({ couponCode: "UMAVEZ", customer: { name: "Ana", phone: "55 98888-0000" } });
    expect((await postOrder(otherCustomer)).status).toBe(201);

    await createCoupon({ code: "DOIS", type: "fixed", value: 100, maxUses: 1 });
    expect((await postOrder(orderBody({ couponCode: "DOIS" }))).status).toBe(201);
    const exhausted = await postOrder(orderBody({ couponCode: "DOIS", customer: { name: "Ana", phone: "55 98888-0000" } }));
    expect(exhausted.body.error.code).toBe("COUPON_EXHAUSTED");
    expect(await Order.countDocuments({ "coupon.code": "DOIS" })).toBe(1);
  });

  it("cancelar el pedido libera el uso", async () => {
    await createCoupon({ code: "UNICO", type: "fixed", value: 100, maxUses: 1 });
    const created = await postOrder(orderBody({ couponCode: "UNICO" }));
    await owner.patch(`/api/owner/orders/${created.body.order._id}/status`).send({ status: "cancelled", reason: "Teste" });
    expect((await Coupon.findOne({ code: "UNICO" })).uses).toBe(0);
    expect((await postOrder(orderBody({ couponCode: "UNICO" }))).status).toBe(201);
  });

  it("el cliente puede validar un cupón antes de pedir", async () => {
    await createCoupon({ code: "DEMO10", type: "percent", value: 10, minOrderCents: 2000, maxUsesPerCustomer: 1 });
    const ok = await request(app).post("/api/public/stores/loja-a/coupons/validate").send({ code: "demo10" });
    expect(ok.body.coupon).toEqual({ code: "DEMO10", type: "percent", value: 10, minOrderCents: 2000 });

    await postOrder(orderBody({ couponCode: "DEMO10" }));
    const used = await request(app)
      .post("/api/public/stores/loja-a/coupons/validate")
      .send({ code: "DEMO10", phone: "(55) 99999-1234" });
    expect(used.body.error.code).toBe("COUPON_ALREADY_USED");
  });

  it("solo el dueño maneja cupones y cada local ve los suyos", async () => {
    const { body } = await createCoupon({ code: "DEMO10", type: "percent", value: 10 });
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-a@test.local");
    expect((await staff.get("/api/owner/coupons")).status).toBe(403);

    const other = await createCommerceWithOwner({ slug: "loja-b" });
    const ownerB = await loginAs(app, other.owner.email);
    expect((await ownerB.get("/api/owner/coupons")).body.coupons).toEqual([]);
    expect((await ownerB.patch(`/api/owner/coupons/${body.coupon._id}`).send({ active: false })).status).toBe(404);
    // Otro local puede tener un cupón con el mismo código.
    expect((await ownerB.post("/api/owner/coupons").send({ code: "DEMO10", type: "fixed", value: 100 })).status).toBe(201);
  });
});

describe("pedidos programados", () => {
  const evening = [{ open: "18:00", close: "22:00" }];
  const weekly = { sun: evening, mon: evening, tue: evening, wed: evening, thu: evening, fri: evening, sat: evening };

  beforeEach(async () => {
    // Sin override: manda el horario. Viernes 2026-09-25 12:00 en Brasil (cerrado ahora).
    await Commerce.updateOne({ _id: commerce._id }, { override: null, "hours.weekly": weekly });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
  });

  it("sin programación activada se rechazan", async () => {
    const res = await postOrder(orderBody({ scheduledFor: "2026-09-25T21:00:00Z" }));
    expect(res.body.error.code).toBe("SCHEDULING_NOT_AVAILABLE");
  });

  it("con el local cerrado ahora se puede programar para una franja disponible", async () => {
    await owner.patch("/api/owner/store").send({ scheduling: { enabled: true } });
    const slots = await request(app).get("/api/public/stores/loja-a/slots");
    expect(slots.body).toMatchObject({ enabled: true, slotMinutes: 30 });
    expect(slots.body.slots[0]).toBe("2026-09-25T21:00:00.000Z");

    expect((await postOrder(orderBody())).body.error.code).toBe("STORE_CLOSED");

    const scheduled = await postOrder(orderBody({ scheduledFor: slots.body.slots[2] }));
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.order.scheduledFor).toBe("2026-09-25T22:00:00.000Z");
    expect(scheduled.body.whatsapp.message).toContain("*Agendado para:* sex 25/09 às 19:00");

    const offSlot = await postOrder(orderBody({ scheduledFor: "2026-09-25T21:10:00Z" }));
    expect(offSlot.body.error.code).toBe("INVALID_SCHEDULE_TIME");
  });

  it("el panel lo muestra el día para el que está programado", async () => {
    await owner.patch("/api/owner/store").send({ scheduling: { enabled: true } });
    const { body } = await postOrder(orderBody({ scheduledFor: "2026-09-26T21:00:00Z" })); // sábado
    expect((await owner.get("/api/owner/orders")).body.orders).toHaveLength(0);
    const saturday = await owner.get("/api/owner/orders?date=2026-09-26");
    expect(saturday.body.orders.map((o) => o._id)).toEqual([body.order._id]);
  });
});

describe("estados, motivo y tiempo estimado", () => {
  it("al confirmar se ajusta el tiempo y el seguimiento lo muestra", async () => {
    const created = await postOrder(orderBody());
    const res = await owner
      .patch(`/api/owner/orders/${created.body.order._id}/status`)
      .send({ status: "confirmed", estimatedMinutes: { min: 20, max: 30 } });
    expect(res.body.order.estimatedMinutes).toEqual({ min: 20, max: 30 });

    const tracking = await request(app).get(`/api/public/orders/${tokenOf(created)}`);
    const confirmedAt = new Date(res.body.order.statusHistory.at(-1).at).getTime();
    expect(tracking.body.order.eta).toEqual({
      from: new Date(confirmedAt + 20 * 60_000).toISOString(),
      to: new Date(confirmedAt + 30 * 60_000).toISOString(),
    });
  });

  it("el tiempo solo se ajusta al confirmar", async () => {
    const created = await postOrder(orderBody());
    const res = await owner
      .patch(`/api/owner/orders/${created.body.order._id}/status`)
      .send({ status: "cancelled", reason: "Teste", estimatedMinutes: { min: 1, max: 2 } });
    expect(res.status).toBe(400);
  });
});

describe("seguimiento para el cliente", () => {
  it("muestra estado y resumen, sin teléfono ni dirección completa", async () => {
    const created = await postOrder(orderBody());
    expect(created.body.trackingUrl).toMatch(/^http:\/\/localhost:5173\/pedido\/[A-Za-z0-9_-]{32}$/);
    expect(created.body.whatsapp.message).toContain(`Acompanhe o pedido: ${created.body.trackingUrl}`);

    const res = await request(app).get(`/api/public/orders/${tokenOf(created)}`);
    expect(res.status).toBe(200);
    expect(res.body.store).toMatchObject({ name: "Loja loja-a", slug: "loja-a" });
    expect(res.body.order).toMatchObject({ number: 1, status: "new", customerName: "Maria", neighborhood: "Centro", totalCents: 3500 });
    const text = JSON.stringify(res.body);
    for (const secret of ["99999-1234", "5555999991234", "Rua Brasil", "Casa azul", "internalNotes"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("un token que no existe o de un local suspendido da 404", async () => {
    expect((await request(app).get("/api/public/orders/abcdefghijklmnopqrstuvwxyz0123")).status).toBe(404);
    const created = await postOrder(orderBody());
    await Commerce.updateOne({ _id: commerce._id }, { status: "suspended" });
    const res = await request(app).get(`/api/public/orders/${tokenOf(created)}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("cancelado no muestra tiempo estimado", async () => {
    const created = await postOrder(orderBody());
    await owner.patch(`/api/owner/orders/${created.body.order._id}/status`).send({ status: "cancelled", reason: "Sem entregador" });
    const res = await request(app).get(`/api/public/orders/${tokenOf(created)}`);
    expect(res.body.order).toMatchObject({ status: "cancelled", eta: null });
    expect(JSON.stringify(res.body)).not.toContain("Sem entregador");
  });
});

describe("pedidos cargados en el panel", () => {
  const manual = (changes = {}) => ({
    channel: "phone",
    customer: { name: "Seu Jorge", phone: "55 97777-6666" },
    fulfillment: "pickup",
    paymentMethod: "cash",
    items: [{ productId: String(menu.coca._id), quantity: 1 }],
    ...changes,
  });

  it("entran confirmados, aunque el local esté cerrado y no llegue al mínimo", async () => {
    await Commerce.updateOne({ _id: commerce._id }, { override: { mode: "closed", until: null }, minOrderCents: 10_000 });
    const res = await owner.post("/api/owner/orders").send(manual({ fulfillment: "delivery", address: { street: "R", number: "1", neighborhood: "Centro" } }));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ channel: "phone", status: "confirmed", totalCents: 1100 });
    expect(res.body.order.statusHistory.map((h) => h.status)).toEqual(["new", "confirmed"]);
    expect(res.body.trackingUrl).toContain("/pedido/");
  });

  it("en el mostrador el teléfono es opcional; por teléfono no", async () => {
    const counter = await owner.post("/api/owner/orders").send(manual({ channel: "counter", customer: { name: "Balcão" } }));
    expect(counter.status).toBe(201);
    expect(counter.body.order.customer).toEqual({ name: "Balcão", phone: "" });
    expect((await owner.post("/api/owner/orders").send(manual({ customer: { name: "Sem telefone" } }))).status).toBe(400);
  });

  it("respetan stock y agotados", async () => {
    await owner.patch(`/api/owner/products/${menu.coca._id}/availability`).send({ available: false });
    const res = await owner.post("/api/owner/orders").send(manual());
    expect(res.body.error.code).toBe("PRODUCT_UNAVAILABLE");
  });

  it("los carga también un empleado; sin sesión no", async () => {
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-a@test.local");
    expect((await staff.post("/api/owner/orders").send(manual())).status).toBe(201);
    expect((await request(app).post("/api/owner/orders").send(manual())).status).toBe(401);
  });
});

describe("notas internas y comanda", () => {
  it("las notas internas quedan en el panel y la comanda, nunca para el cliente", async () => {
    const created = await postOrder(orderBody());
    const id = created.body.order._id;
    const notes = await owner.patch(`/api/owner/orders/${id}/notes`).send({ internalNotes: "Cliente pediu troco em moedas" });
    expect(notes.body.order.internalNotes).toBe("Cliente pediu troco em moedas");

    const ticket = await owner.get(`/api/owner/orders/${id}/ticket?format=text&width=58`);
    expect(ticket.headers["content-type"]).toContain("text/plain");
    expect(ticket.text).toContain("Obs. internas: Cliente pediu");
    expect(Math.max(...ticket.text.trimEnd().split("\n").map((l) => l.length))).toBeLessThanOrEqual(32);

    const tracking = await request(app).get(`/api/public/orders/${tokenOf(created)}`);
    expect(JSON.stringify(tracking.body)).not.toContain("moedas");
    expect(containsKey(tracking.body, "internalNotes")).toBe(false);
  });

  it("la comanda HTML sale lista para imprimir en 80 mm", async () => {
    const created = await postOrder(orderBody({ customer: { name: "Ana <b>", phone: "55 99999-1234" } }));
    const res = await owner.get(`/api/owner/orders/${created.body.order._id}/ticket`);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("size: 80mm auto");
    expect(res.text).toContain("Ana &lt;b&gt;");
  });

  it("aislamiento: otro local no ve la comanda ni cambia notas", async () => {
    const created = await postOrder(orderBody());
    const other = await createCommerceWithOwner({ slug: "loja-b" });
    const ownerB = await loginAs(app, other.owner.email);
    expect((await ownerB.get(`/api/owner/orders/${created.body.order._id}/ticket`)).status).toBe(404);
    expect((await ownerB.patch(`/api/owner/orders/${created.body.order._id}/notes`).send({ internalNotes: "x" })).status).toBe(404);
  });
});

describe("idioma del mensaje", () => {
  it("un cliente en español recibe el mensaje en español", async () => {
    const res = await postOrder(orderBody({ locale: "es", paymentMethod: "cash", changeForCents: 5000 }));
    expect(res.body.whatsapp.message).toContain("*Pago:* Efectivo (cambio para R$ 50,00)");
    expect(res.body.whatsapp.message).toContain("Seguí tu pedido:");
    expect((await Order.findById(res.body.order._id)).locale).toBe("es");
  });
});

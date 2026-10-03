import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Category from "../../src/models/category.model.js";
import Commerce from "../../src/models/commerce.model.js";
import OptionGroup from "../../src/models/optionGroup.model.js";
import Order from "../../src/models/order.model.js";
import Product from "../../src/models/product.model.js";
import { containsKey, createCommerceWithOwner, createMenu, loginAs } from "../helpers.js";

const app = createApp();

let a, b, menuA, menuB;
beforeEach(async () => {
  a = await createCommerceWithOwner({
    slug: "loja-a",
    deliveryFeeCents: 500,
    paymentMethods: ["cash", "pix", "card"],
    pixKey: "loja-a@pix.com",
  });
  b = await createCommerceWithOwner({ slug: "loja-b" });
  menuA = await createMenu(a.commerce);
  menuB = await createMenu(b.commerce);
});

const pick = (group, name) => ({
  groupId: String(group._id),
  optionId: String(group.options.find((option) => option.name === name)._id),
});

// 2 X-Burger (ao ponto + bacon + cheddar) + 1 Coca, con entrega: 6400 + 600 + 500 = 7500.
const orderBody = (changes = {}) => ({
  clientOrderId: randomUUID(),
  customer: { name: "Maria", phone: "55 99999-1234" },
  fulfillment: "delivery",
  address: { street: "Rua Brasil", number: "123", neighborhood: "Centro", reference: "Perto da praça" },
  paymentMethod: "cash",
  items: [
    {
      productId: String(menuA.xBurger._id),
      quantity: 2,
      options: [pick(menuA.ponto, "Ao ponto"), pick(menuA.adicionais, "Bacon"), pick(menuA.adicionais, "Cheddar")],
      notes: "sem cebola",
    },
    { productId: String(menuA.coca._id), quantity: 1 },
  ],
  ...changes,
});

const postOrder = (body, slug = "loja-a", target = app) =>
  request(target).post(`/api/public/stores/${slug}/orders`).send(body);

describe("POST /api/public/stores/:slug/orders", () => {
  it("guarda el pedido, calcula el total y devuelve el link de WhatsApp", async () => {
    const res = await postOrder(orderBody());

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      number: 1,
      status: "new",
      subtotalCents: 7000,
      deliveryFeeCents: 500,
      totalCents: 7500,
    });
    expect(res.body.order.items[0].options.map((o) => o.name)).toEqual(["Ao ponto", "Bacon", "Cheddar"]);

    const { message, url } = res.body.whatsapp;
    expect(url.startsWith("https://wa.me/5555999990000?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe(message);
    expect(message).toContain("*Pedido #1 — Loja loja-a*");
    expect(message).toContain("   Obs.: sem cebola");
    expect(message).toMatch(/\*Total: R\$\s75,00\*/);
    expect(message).toContain("Cliente: Maria — +5555999991234");

    const saved = await Order.findById(res.body.order._id);
    expect(saved.customer.phone).toBe("+5555999991234");
    expect(saved.statusHistory.map((h) => h.status)).toEqual(["new"]);
  });

  it("ignora los precios que manda el cliente", async () => {
    const body = orderBody({ subtotalCents: 1, totalCents: 1, deliveryFeeCents: 0 });
    body.items = body.items.map((item) => ({ ...item, priceCents: 1, unitPriceCents: 1, totalCents: 1 }));
    const res = await postOrder(body);
    expect(res.body.order.totalCents).toBe(7500);
  });

  it("en retiro no cobra entrega y no guarda dirección", async () => {
    const res = await postOrder(orderBody({ fulfillment: "pickup" }));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ deliveryFeeCents: 0, totalCents: 7000 });
    expect((await Order.findById(res.body.order._id)).address).toBeUndefined();
  });

  it("numera los pedidos por local", async () => {
    expect((await postOrder(orderBody())).body.order.number).toBe(1);
    expect((await postOrder(orderBody())).body.order.number).toBe(2);
    const inB = orderBody({ items: [{ productId: String(menuB.coca._id), quantity: 1 }], paymentMethod: "card" });
    expect((await postOrder(inB, "loja-b")).body.order.number).toBe(1);
  });

  it("si llega dos veces el mismo pedido, no lo duplica", async () => {
    const body = orderBody();
    const first = await postOrder(body);
    const second = await postOrder(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.order._id).toBe(first.body.order._id);
    expect(second.body.whatsapp.url).toBe(first.body.whatsapp.url);
    expect(await Order.countDocuments()).toBe(1);
  });

  it("guarda el troco en dinheiro y muestra la chave en Pix", async () => {
    const cash = await postOrder(orderBody({ changeForCents: 10_000 }));
    expect(cash.body.order.changeForCents).toBe(10_000);
    expect(cash.body.whatsapp.message).toMatch(/Dinheiro \(troco para R\$\s100,00\)/);

    const pix = await postOrder(orderBody({ paymentMethod: "pix", changeForCents: 10_000 }));
    expect(pix.body.order.changeForCents).toBeNull();
    expect(pix.body.whatsapp.message).toContain("Pix (chave: loja-a@pix.com)");
  });

  it("el pedido mínimo solo aplica a delivery", async () => {
    await Commerce.updateOne({ _id: a.commerce._id }, { minOrderCents: 100_000 });
    expect((await postOrder(orderBody({ fulfillment: "pickup" }))).status).toBe(201);
    const delivery = await postOrder(orderBody());
    expect(delivery.status).toBe(409);
    expect(delivery.body.error).toMatchObject({ code: "MIN_ORDER_NOT_REACHED", details: { minOrderCents: 100_000 } });
  });

  const rejections = [
    ["local cerrado", 409, "STORE_CLOSED", () => Commerce.updateOne({ _id: a.commerce._id }, { override: { mode: "closed", until: null } })],
    ["local suspendido", 404, "STORE_NOT_FOUND", () => Commerce.updateOne({ _id: a.commerce._id }, { status: "suspended" })],
    ["producto agotado", 409, "PRODUCT_UNAVAILABLE", () => Product.updateOne({ _id: menuA.coca._id }, { available: false })],
    ["categoría inactiva", 409, "PRODUCT_UNAVAILABLE", () => Category.updateOne({ _id: menuA.bebidas._id }, { active: false })],
    [
      "opción agotada",
      409,
      "OPTION_UNAVAILABLE",
      () => OptionGroup.updateOne({ _id: menuA.adicionais._id, "options.name": "Bacon" }, { "options.$.available": false }),
    ],
    [
      "forma de pago no aceptada",
      400,
      "PAYMENT_METHOD_NOT_AVAILABLE",
      () => Commerce.updateOne({ _id: a.commerce._id }, { paymentMethods: ["card"] }),
    ],
    [
      "delivery desactivado",
      400,
      "FULFILLMENT_NOT_AVAILABLE",
      () => Commerce.updateOne({ _id: a.commerce._id }, { "fulfillment.delivery": false }),
    ],
    ["producto de otro local", 400, "PRODUCT_NOT_FOUND", null, () => ({ items: [{ productId: String(menuB.coca._id), quantity: 1 }] })],
    [
      "opción de un grupo de otro local",
      400,
      "INVALID_OPTION",
      null,
      () => ({ items: [{ productId: String(menuA.xBurger._id), quantity: 1, options: [pick(menuB.ponto, "Ao ponto")] }] }),
    ],
    [
      "opción que no es del producto",
      400,
      "INVALID_OPTION",
      null,
      () => ({ items: [{ productId: String(menuA.coca._id), quantity: 1, options: [pick(menuA.ponto, "Ao ponto")] }] }),
    ],
    [
      "falta elegir el ponto",
      400,
      "OPTION_SELECTION_INVALID",
      null,
      () => ({ items: [{ productId: String(menuA.xBurger._id), quantity: 1 }] }),
    ],
    [
      "dos pontos a la vez",
      400,
      "OPTION_SELECTION_INVALID",
      null,
      () => ({
        items: [
          {
            productId: String(menuA.xBurger._id),
            quantity: 1,
            options: [pick(menuA.ponto, "Ao ponto"), pick(menuA.ponto, "Bem passado")],
          },
        ],
      }),
    ],
    ["troco menor que el total", 400, "INVALID_CHANGE", null, () => ({ changeForCents: 5000 })],
    ["delivery sin dirección", 400, "VALIDATION_ERROR", null, () => ({ address: undefined })],
    ["carrito vacío", 400, "VALIDATION_ERROR", null, () => ({ items: [] })],
    ["cantidad 0", 400, "VALIDATION_ERROR", null, () => ({ items: [{ productId: String(menuA.coca._id), quantity: 0 }] })],
    ["cantidad 51", 400, "VALIDATION_ERROR", null, () => ({ items: [{ productId: String(menuA.coca._id), quantity: 51 }] })],
    ["cantidad con decimales", 400, "VALIDATION_ERROR", null, () => ({ items: [{ productId: String(menuA.coca._id), quantity: 1.5 }] })],
    ["teléfono inválido", 400, "VALIDATION_ERROR", null, () => ({ customer: { name: "Maria", phone: "123" } })],
    ["clientOrderId inválido", 400, "VALIDATION_ERROR", null, () => ({ clientOrderId: "x" })],
  ];

  it.each(rejections)("rechaza: %s", async (_caso, status, code, setup, changes) => {
    if (setup) await setup();
    const res = await postOrder(orderBody(changes ? changes() : {}));
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("corta con 429 después del límite de pedidos por IP", async () => {
    const limited = createApp({ limits: { orders: { limit: 1 } } });
    expect((await postOrder(orderBody(), "loja-a", limited)).status).toBe(201);
    const blocked = await postOrder(orderBody(), "loja-a", limited);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});

describe("panel del dueño: /api/owner/orders", () => {
  let owner;
  beforeEach(async () => {
    owner = await loginAs(app, a.owner.email);
  });

  it("lista los pedidos de hoy, los más nuevos primero", async () => {
    await postOrder(orderBody());
    await postOrder(orderBody());
    const res = await owner.get("/api/owner/orders");

    expect(res.status).toBe(200);
    expect(res.body.orders.map((o) => o.number)).toEqual([2, 1]);
    expect(res.body.orders[0]).toMatchObject({ customer: { name: "Maria" }, address: { street: "Rua Brasil" } });
    expect(new Date(res.body.serverTime).toISOString()).toBe(res.body.serverTime);
    expect(containsKey(res.body, "passwordHash")).toBe(false);
  });

  it("filtra por fecha (hora de Brasil) y por estado", async () => {
    const old = await postOrder(orderBody());
    await postOrder(orderBody());
    // 2026-01-10 a las 23:30 en Brasil (02:30 UTC del día siguiente).
    await Order.collection.updateOne(
      { _id: new Order.base.Types.ObjectId(old.body.order._id) },
      { $set: { createdAt: new Date("2026-01-11T02:30:00Z") } }
    );

    expect((await owner.get("/api/owner/orders")).body.orders).toHaveLength(1);
    const thatDay = await owner.get("/api/owner/orders?date=2026-01-10");
    expect(thatDay.body.orders.map((o) => o._id)).toEqual([old.body.order._id]);
    expect((await owner.get("/api/owner/orders?status=confirmed")).body.orders).toHaveLength(0);
    expect((await owner.get("/api/owner/orders?date=2026-02-30")).status).toBe(400);
  });

  it("con updatedSince devuelve solo lo que cambió (para el polling)", async () => {
    const first = await postOrder(orderBody());
    await postOrder(orderBody());
    const { serverTime } = (await owner.get("/api/owner/orders")).body;

    await owner.patch(`/api/owner/orders/${first.body.order._id}/status`).send({ status: "confirmed" });
    const res = await owner.get(`/api/owner/orders?updatedSince=${encodeURIComponent(serverTime)}`);
    expect(res.body.orders.map((o) => o._id)).toEqual([first.body.order._id]);
  });

  it("un delivery pasa por saiu para entrega y guarda el historial", async () => {
    const { _id } = (await postOrder(orderBody())).body.order;
    expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "confirmed" })).status).toBe(200);
    expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "ready" })).status).toBe(200);
    // Un delivery no puede pasar de pronto a entregue sin salir para entrega.
    expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "delivered" })).status).toBe(409);
    for (const status of ["out_for_delivery", "delivered"]) {
      const res = await owner.patch(`/api/owner/orders/${_id}/status`).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe(status);
    }
    const detail = await owner.get(`/api/owner/orders/${_id}`);
    expect(detail.body.order.statusHistory.map((h) => h.status)).toEqual([
      "new",
      "confirmed",
      "ready",
      "out_for_delivery",
      "delivered",
    ]);

    const cancel = await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "cancelled", reason: "Teste" });
    expect(cancel.status).toBe(409);
    expect(cancel.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("en retiro va de pronto a entregue directo", async () => {
    const { _id } = (await postOrder(orderBody({ fulfillment: "pickup" }))).body.order;
    for (const status of ["confirmed", "ready", "delivered"]) {
      expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status })).status).toBe(200);
    }
  });

  it("no deja saltear estados; cancelar exige motivo", async () => {
    const { _id } = (await postOrder(orderBody())).body.order;
    expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "delivered" })).status).toBe(409);
    expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "pago" })).status).toBe(400);
    expect((await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "cancelled" })).status).toBe(400);
    const cancel = await owner.patch(`/api/owner/orders/${_id}/status`).send({ status: "cancelled", reason: "Cliente desistiu" });
    expect(cancel.body.order).toMatchObject({ status: "cancelled", cancelReason: "Cliente desistiu" });
    expect(cancel.body.order.statusHistory.at(-1)).toMatchObject({ status: "cancelled", reason: "Cliente desistiu" });
  });

  it("aislamiento: otro dueño no ve ni cambia los pedidos del local", async () => {
    const { _id } = (await postOrder(orderBody())).body.order;
    const ownerB = await loginAs(app, b.owner.email);

    expect((await ownerB.get("/api/owner/orders")).body.orders).toHaveLength(0);
    expect((await ownerB.get(`/api/owner/orders/${_id}`)).status).toBe(404);
    expect((await ownerB.patch(`/api/owner/orders/${_id}/status`).send({ status: "confirmed" })).status).toBe(404);
    expect((await Order.findById(_id)).status).toBe("new");
  });

  it("sin sesión da 401 y con id inválido 400", async () => {
    expect((await request(app).get("/api/owner/orders")).status).toBe(401);
    expect((await owner.get("/api/owner/orders/abc")).status).toBe(400);
  });
});

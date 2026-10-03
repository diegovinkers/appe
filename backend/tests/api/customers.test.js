import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Order from "../../src/models/order.model.js";
import { createCommerceWithOwner, createMenu, loginAs } from "../helpers.js";

const app = createApp();
const PHONE = "55 99999-1234";
const PASSWORD = "senha-do-cliente-1";

let menu;
beforeEach(async () => {
  const { commerce } = await createCommerceWithOwner({ slug: "burger" });
  menu = await createMenu(commerce);
});

// Un pedido del menú público, con o sin la sesión del cliente (agent).
async function placeOrder({ agent = request(app), phone = PHONE, address } = {}) {
  const res = await agent.post("/api/public/stores/burger/orders").send({
    clientOrderId: randomUUID(),
    customer: { name: "Maria Souza", phone },
    ...(address ? { fulfillment: "delivery", address } : { fulfillment: "pickup" }),
    paymentMethod: "cash",
    items: [{ productId: menu.xBurger._id, quantity: 2, options: [{ groupId: menu.ponto._id, optionId: menu.ponto.options[0]._id }] }],
  });
  expect(res.status).toBe(201);
  return { id: res.body.order._id, token: res.body.trackingUrl.split("/").at(-1) };
}

async function signup(extra = {}) {
  const agent = request.agent(app);
  const res = await agent.post("/api/customer/signup").send({ name: "Maria Souza", phone: PHONE, password: PASSWORD, ...extra });
  return { agent, res };
}

describe("crear la cuenta y entrar", () => {
  it("con lo mínimo: entra directo y queda el teléfono normalizado", async () => {
    const { agent, res } = await signup({ address: { street: "Rua Brasil", number: "10", neighborhood: "Centro" } });
    expect(res.status).toBe(201);
    expect(res.body.customer).toMatchObject({ name: "Maria Souza", phone: "+5555999991234", locale: "pt-BR" });
    expect(res.body.customer.addresses).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/password|tokenVersion/i);
    expect((await agent.get("/api/customer/me")).status).toBe(200);
  });

  it("un teléfono, una cuenta", async () => {
    await signup();
    const again = await signup({ phone: "+55 55 99999-1234" });
    expect(again.res.status).toBe(409);
    expect(again.res.body.error.code).toBe("PHONE_TAKEN");
  });

  it("entrar: contraseña equivocada o teléfono sin cuenta dan el mismo error", async () => {
    await signup();
    for (const body of [{ phone: PHONE, password: "otra-senha-123" }, { phone: "55 98888-0000", password: PASSWORD }]) {
      const res = await request(app).post("/api/customer/login").send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("CUSTOMER_INVALID_CREDENTIALS");
    }
    const ok = request.agent(app);
    expect((await ok.post("/api/customer/login").send({ phone: PHONE, password: PASSWORD })).status).toBe(200);
    expect((await ok.post("/api/customer/logout")).status).toBe(204);
    expect((await ok.get("/api/customer/me")).status).toBe(401);
  });

  it("la sesión del cliente no abre el panel, y la del panel no abre la cuenta", async () => {
    const { agent } = await signup();
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    expect((await agent.get("/api/owner/store")).status).toBe(401);
    const owner = await loginAs(app, "dono-burger@test.local");
    expect((await owner.get("/api/customer/me")).status).toBe(401);
  });
});

describe("pedidos de la cuenta", () => {
  it("pedir con la sesión: el pedido queda en la cuenta y la dirección se guarda una vez", async () => {
    const { agent } = await signup();
    const address = { street: "Rua Uruguai", number: "640", neighborhood: "Centro" };
    const first = await placeOrder({ agent, address });
    await placeOrder({ agent, address: { ...address, street: "rua uruguai" } });
    await placeOrder({ agent });

    expect((await Order.findById(first.id)).account).toBeTruthy();
    const me = (await agent.get("/api/customer/me")).body.customer;
    expect(me.addresses.map((a) => a.street)).toEqual(["Rua Uruguai"]);

    const orders = (await agent.get("/api/customer/orders")).body.orders;
    expect(orders).toHaveLength(3);
    expect(orders[0]).toMatchObject({ itemsCount: 2, store: { slug: "burger", name: "Loja burger" } });
    expect(orders[0].trackingToken).toBeTruthy();
  });

  it("asocia pedidos de este aparato (link + mismo teléfono), nunca solo por teléfono", async () => {
    const mine = await placeOrder();
    const otherPhone = await placeOrder({ phone: "55 98888-7777" });
    await placeOrder(); // mismo teléfono, pero el link no está en este aparato

    const { agent, res } = await signup({ orderTokens: [mine.token, otherPhone.token] });
    expect(res.body.linkedOrders).toBe(1);
    const orders = (await agent.get("/api/customer/orders")).body.orders;
    expect(orders.map((o) => String(o._id))).toEqual([mine.id]);
  });

  it("la cuenta nueva toma la dirección de los pedidos que asocia", async () => {
    const { token } = await placeOrder({ address: { street: "Rua Uruguai", number: "640", neighborhood: "Centro", reference: "Casa verde" } });
    const { res } = await signup({ orderTokens: [token] });
    expect(res.body.customer.addresses).toEqual([
      expect.objectContaining({ street: "Rua Uruguai", number: "640", neighborhood: "Centro", reference: "Casa verde" }),
    ]);
  });

  it("no ve los pedidos de otra cuenta", async () => {
    const { agent } = await signup();
    await placeOrder({ agent });
    const other = request.agent(app);
    await other.post("/api/customer/signup").send({ name: "Juan", phone: "598 99 123 456", password: PASSWORD });
    expect((await other.get("/api/customer/orders")).body.orders).toEqual([]);
  });
});

describe("datos de la cuenta", () => {
  it("cambia nombre y direcciones", async () => {
    const { agent } = await signup();
    const res = await agent.patch("/api/customer/me").send({
      name: "Maria S.",
      addresses: [{ label: "Casa", street: "Rua A", number: "1", neighborhood: "Centro" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.customer).toMatchObject({ name: "Maria S.", addresses: [{ label: "Casa", street: "Rua A" }] });
    expect((await agent.patch("/api/customer/me").send({})).status).toBe(400);
  });

  it("borrar la cuenta pide la contraseña y deja los pedidos sin cuenta", async () => {
    const { agent } = await signup();
    const { id } = await placeOrder({ agent });
    expect((await agent.post("/api/customer/me/delete").send({ password: "otra-senha-123" })).status).toBe(401);
    expect((await agent.post("/api/customer/me/delete").send({ password: PASSWORD })).status).toBe(204);
    expect((await agent.get("/api/customer/me")).status).toBe(401);
    expect((await Order.findById(id)).account).toBeNull();
    // El teléfono queda libre para una cuenta nueva.
    expect((await signup()).res.status).toBe(201);
  });
});

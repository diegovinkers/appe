import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import AuditLog from "../../src/models/auditLog.model.js";
import Order from "../../src/models/order.model.js";
import Tab from "../../src/models/tab.model.js";
import { createCommerceWithOwner, createMenu, createStaff, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

let commerce, menu, owner;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a", paymentMethods: ["cash", "pix", "card"], pixKey: "loja@pix.com" }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-loja-a@test.local");
});

const items = () => [
  { productId: String(menu.xBurger._id), quantity: 2, options: [{ groupId: String(menu.ponto._id), optionId: String(menu.ponto.options[1]._id) }] },
  { productId: String(menu.coca._id), quantity: 1 },
];
const newTable = (body = {}) => owner.post("/api/owner/tables").send(body);
const tableOf = async (agent, id) => (await agent.get("/api/owner/tables")).body.tables.find((table) => table._id === id);

describe("salón: mesas", () => {
  it("crea mesas con número y lugar automáticos, ordenadas en la grilla", async () => {
    const first = await newTable({});
    expect(first.status).toBe(201);
    expect(first.body.table).toMatchObject({ number: 1, seats: 4, x: 0, y: 0, active: true });
    const second = (await newTable({ name: "Terraço", seats: 6 })).body.table;
    expect(second).toMatchObject({ number: 2, name: "Terraço", seats: 6, x: 2, y: 0 });
    expect((await newTable({ number: 2 })).body.error.code).toBe("TABLE_NUMBER_TAKEN");
    expect((await newTable({ x: 0, y: 0 })).body.error.code).toBe("TABLE_POSITION_TAKEN");

    const list = await owner.get("/api/owner/tables");
    expect(list.body.tables.map((table) => [table.number, table.state, table.tab])).toEqual([
      [1, "free", null],
      [2, "free", null],
    ]);
  });

  it("acomoda el plano de una vez y no deja dos mesas en la misma celda", async () => {
    const a = (await newTable({})).body.table;
    const b = (await newTable({})).body.table;
    const moved = await owner.put("/api/owner/tables/layout").send({ positions: [{ id: a._id, x: 5, y: 3 }, { id: b._id, x: 0, y: 0 }] });
    expect(moved.status).toBe(200);
    expect(moved.body.tables.map((table) => [table.number, table.x, table.y])).toEqual([[1, 5, 3], [2, 0, 0]]);
    const clash = await owner.put("/api/owner/tables/layout").send({ positions: [{ id: a._id, x: 0, y: 0 }] });
    expect(clash.status).toBe(409);
    expect((await owner.put("/api/owner/tables/layout").send({ positions: [{ id: a._id, x: 99, y: 0 }] })).status).toBe(400);
  });

  it("edita, desactiva y borra; con la cuenta abierta no", async () => {
    const table = (await newTable({})).body.table;
    const renamed = await owner.patch(`/api/owner/tables/${table._id}`).send({ number: 10, name: "Janela" });
    expect(renamed.body.table).toMatchObject({ number: 10, name: "Janela" });
    await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    expect((await owner.patch(`/api/owner/tables/${table._id}`).send({ active: false })).body.error.code).toBe("TABLE_HAS_OPEN_TAB");
    expect((await owner.delete(`/api/owner/tables/${table._id}`)).body.error.code).toBe("TABLE_HAS_OPEN_TAB");
    const other = (await newTable({})).body.table;
    expect((await owner.delete(`/api/owner/tables/${other._id}`)).status).toBe(204);
    expect(await AuditLog.countDocuments({ action: { $in: ["table.created", "table.updated", "table.deleted"] } })).toBe(4);
  });
});

describe("salón: la cuenta de la mesa", () => {
  it("el primer pedido abre la cuenta y entra a cocina; la mesa muestra cómo va", async () => {
    const table = (await newTable({})).body.table;
    const res = await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items(), notes: "Sem cebola" });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      fulfillment: "table",
      table: { _id: table._id, number: 1, name: "" },
      status: "confirmed",
      paymentMethod: null,
      deliveryFeeCents: 0,
      customer: { name: "Mesa 1", phone: "" },
      subtotalCents: 5600,
      totalCents: 5600,
    });
    expect(res.body.tab).toMatchObject({ status: "open", tableNumber: 1, totalCents: 5600, ordersCount: 1 });
    expect((await tableOf(owner, table._id)).state).toBe("kitchen");

    // Otro pedido va a la misma cuenta.
    const second = await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: [{ productId: String(menu.coca._id), quantity: 2 }] });
    expect(second.body.tab).toMatchObject({ _id: res.body.tab._id, totalCents: 6800, ordersCount: 2 });
    expect(await Tab.countDocuments({ commerce: commerce._id })).toBe(1);

    for (const order of [res.body.order, second.body.order]) await owner.patch(`/api/owner/orders/${order._id}/status`).send({ status: "ready" });
    expect((await tableOf(owner, table._id)).state).toBe("ready");
    await owner.post(`/api/owner/tabs/${res.body.tab._id}/bill`);
    const listed = await tableOf(owner, table._id);
    expect(listed.state).toBe("bill");
    expect(listed.tab.lastItems.map((item) => item.name)).toEqual(["X-Burger", "Coca-Cola 350ml", "Coca-Cola 350ml"]);

    const view = await owner.get(`/api/owner/tables/${table._id}/tab`);
    expect(view.body.orders).toHaveLength(2);
    expect(view.body.tab.status).toBe("bill_requested");
    const bill = await owner.get(`/api/owner/tabs/${res.body.tab._id}/bill?format=text&width=58`);
    expect(bill.text).toContain("MESA 1");
    expect(bill.text).toContain("R$ 68,00");
    const ticket = await owner.get(`/api/owner/orders/${res.body.order._id}/ticket?format=text`);
    expect(ticket.text).toContain("*** MESA 1 ***");
    expect(ticket.text).toContain("na conta da mesa");
  });

  it("no cierra con pedidos en cocina; al cerrar cobra y el cierre de caja la cuenta", async () => {
    const table = (await newTable({})).body.table;
    const first = await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    const tabId = first.body.tab._id;
    const pending = await owner.post(`/api/owner/tabs/${tabId}/close`).send({ paymentMethod: "card" });
    expect(pending.status).toBe(409);
    expect(pending.body.error).toMatchObject({ code: "TAB_HAS_PENDING_ORDERS", details: { orders: [first.body.order.number] } });

    await owner.patch(`/api/owner/orders/${first.body.order._id}/status`).send({ status: "ready" });
    expect((await owner.post(`/api/owner/tabs/${tabId}/close`).send({})).body.error.code).toBe("PAYMENT_METHOD_REQUIRED");
    expect((await owner.post(`/api/owner/tabs/${tabId}/close`).send({ paymentMethod: "cash", changeForCents: 100 })).body.error.code).toBe("INVALID_CHANGE");
    const closed = await owner.post(`/api/owner/tabs/${tabId}/close`).send({ paymentMethod: "cash", changeForCents: 10000 });
    expect(closed.status).toBe(200);
    expect(closed.body.tab).toMatchObject({ status: "closed", paymentMethod: "cash", changeForCents: 10000, totalCents: 5600 });
    const order = await Order.findById(first.body.order._id).lean();
    expect(order).toMatchObject({ status: "delivered", paymentMethod: "cash" });
    expect((await tableOf(owner, table._id)).state).toBe("free");
    expect((await owner.post(`/api/owner/tabs/${tabId}/close`).send({ paymentMethod: "cash" })).body.error.code).toBe("TAB_CLOSED");

    const day = new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const report = await owner.get(`/api/owner/reports?from=${day}&to=${day}`);
    expect(report.body.payments).toEqual([{ method: "cash", count: 1, salesCents: 5600 }]);
    expect(report.body.fulfillment).toEqual([{ type: "table", count: 1, salesCents: 5600 }]);
    expect(await AuditLog.countDocuments({ action: "tab.closed" })).toBe(1);

    // La mesa puede volver a abrir otra cuenta.
    expect((await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() })).body.tab._id).not.toBe(tabId);
  });

  it("cuenta dividida: cada parte con su forma de pago, que tienen que sumar el total", async () => {
    const table = (await newTable({})).body.table;
    const first = await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    const tabId = first.body.tab._id;
    await owner.patch(`/api/owner/orders/${first.body.order._id}/status`).send({ status: "ready" });
    const short = await owner.post(`/api/owner/tabs/${tabId}/close`).send({ payments: [{ paymentMethod: "pix", amountCents: 2800 }, { paymentMethod: "cash", amountCents: 2000 }] });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatchObject({ code: "PAYMENTS_DONT_MATCH", details: { totalCents: 5600, paidCents: 4800 } });
    expect((await owner.post(`/api/owner/tabs/${tabId}/close`).send({ paymentMethod: "pix", payments: [{ paymentMethod: "pix", amountCents: 5600 }] })).status).toBe(400);

    const closed = await owner.post(`/api/owner/tabs/${tabId}/close`).send({
      payments: [{ paymentMethod: "pix", amountCents: 2800 }, { paymentMethod: "cash", amountCents: 2800, changeForCents: 5000 }],
    });
    expect(closed.status).toBe(200);
    expect(closed.body.tab).toMatchObject({
      status: "closed",
      paymentMethod: null,
      totalCents: 5600,
      payments: [
        { paymentMethod: "pix", amountCents: 2800, changeForCents: null },
        { paymentMethod: "cash", amountCents: 2800, changeForCents: 5000 },
      ],
    });
    // Los pedidos no quedan con una sola forma: el cierre de caja cuenta cada parte.
    expect((await Order.findById(first.body.order._id).lean()).paymentMethod).toBeNull();
    const day = new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const report = await owner.get(`/api/owner/reports?from=${day}&to=${day}`);
    expect(report.body.payments).toEqual([
      { method: "cash", count: 1, salesCents: 2800 },
      { method: "pix", count: 1, salesCents: 2800 },
    ]);
    const bill = await owner.get(`/api/owner/tabs/${tabId}/bill?format=text`);
    expect(bill.text).toContain("Pagamentos:");
  });

  it("tasa de servicio: el local la prende, la cuenta la suma, el mozo la puede sacar y el reporte la muestra", async () => {
    await owner.patch("/api/owner/store").send({ serviceFeePercent: 10 });
    const table = (await newTable({})).body.table;
    const first = await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    const tabId = first.body.tab._id;
    expect(first.body.tab).toMatchObject({ subtotalCents: 5600, serviceFeeCents: 560, totalCents: 6160, serviceFeeWaived: false });
    expect((await owner.get(`/api/owner/tabs/${tabId}/bill?format=text`)).text).toContain("Taxa de servico (10%)");

    const waived = await owner.post(`/api/owner/tabs/${tabId}/service-fee`).send({ waived: true });
    expect(waived.body.tab).toMatchObject({ serviceFeeCents: 0, totalCents: 5600, serviceFeeWaived: true });
    await owner.post(`/api/owner/tabs/${tabId}/service-fee`).send({ waived: false });

    await owner.patch(`/api/owner/orders/${first.body.order._id}/status`).send({ status: "ready" });
    expect((await owner.post(`/api/owner/tabs/${tabId}/close`).send({ paymentMethod: "pix" })).body.tab).toMatchObject({ totalCents: 6160, serviceFeeCents: 560 });
    // Cerrada, ya no cambia aunque el local cambie el porcentaje.
    await owner.patch("/api/owner/store").send({ serviceFeePercent: 0 });
    const day = new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const report = await owner.get(`/api/owner/reports?from=${day}&to=${day}`);
    expect(report.body).toMatchObject({ salesCents: 6160, serviceFeeCents: 560, payments: [{ method: "pix", count: 1, salesCents: 6160 }] });
    expect((await owner.patch("/api/owner/store").send({ serviceFeePercent: 31 })).status).toBe(400);
  });

  it("una mesa que se fue sin consumir se cierra sin forma de pago", async () => {
    const table = (await newTable({})).body.table;
    const first = await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    await owner.patch(`/api/owner/orders/${first.body.order._id}/status`).send({ status: "cancelled", reason: "Cliente desistiu" });
    const closed = await owner.post(`/api/owner/tabs/${first.body.tab._id}/close`).send({});
    expect(closed.body.tab).toMatchObject({ status: "closed", totalCents: 0, paymentMethod: null });
  });

  it("pasa la cuenta a otra mesa libre", async () => {
    const one = (await newTable({})).body.table;
    const two = (await newTable({ name: "Janela" })).body.table;
    const three = (await newTable({})).body.table;
    const first = await owner.post(`/api/owner/tables/${one._id}/orders`).send({ items: items() });
    await owner.post(`/api/owner/tables/${three._id}/orders`).send({ items: items() });
    const tabId = first.body.tab._id;

    expect((await owner.post(`/api/owner/tabs/${tabId}/move`).send({ tableId: three._id })).body.error.code).toBe("TABLE_HAS_OPEN_TAB");
    const moved = await owner.post(`/api/owner/tabs/${tabId}/move`).send({ tableId: two._id });
    expect(moved.body.tab).toMatchObject({ table: two._id, tableNumber: 2 });
    expect((await Order.findById(first.body.order._id).lean()).table).toMatchObject({ number: 2, name: "Janela" });
    expect((await tableOf(owner, one._id)).state).toBe("free");
    expect((await tableOf(owner, two._id)).state).toBe("kitchen");
    expect(await AuditLog.countDocuments({ action: "tab.moved" })).toBe(1);
  });

  it("el seguimiento público no muestra pedidos de mesa", async () => {
    const table = (await newTable({})).body.table;
    await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    const order = await Order.findOne({ commerce: commerce._id }).lean();
    expect((await request(app).get(`/api/public/orders/${order.trackingToken}`)).status).toBe(404);
  });

  it("un pedido de mesa no se puede hacer desde el menú público", async () => {
    const res = await request(app).post("/api/public/stores/loja-a/orders").send({
      clientOrderId: "pedido-de-mesa-123", customer: { name: "Ana", phone: "55 99999-1234" }, fulfillment: "table", paymentMethod: "cash",
      items: [{ productId: String(menu.coca._id), quantity: 1 }],
    });
    expect(res.status).toBe(400);
  });
});

describe("salón: permisos y aislamiento", () => {
  it("el empleado atiende las mesas pero no las arma", async () => {
    const table = (await newTable({})).body.table;
    const staff = await loginAs(app, (await createStaff(commerce)).email);
    expect((await staff.get("/api/owner/tables")).status).toBe(200);
    const order = await staff.post(`/api/owner/tables/${table._id}/orders`).send({ items: items() });
    expect(order.status).toBe(201);
    expect((await staff.post(`/api/owner/tabs/${order.body.tab._id}/bill`)).status).toBe(200);
    expect((await staff.post("/api/owner/tables").send({})).status).toBe(403);
    expect((await staff.patch(`/api/owner/tables/${table._id}`).send({ name: "x" })).status).toBe(403);
    expect((await staff.put("/api/owner/tables/layout").send({ positions: [{ id: table._id, x: 1, y: 1 }] })).status).toBe(403);
    expect((await staff.delete(`/api/owner/tables/${table._id}`)).status).toBe(403);
  });

  it("sin sesión 401, superadmin 403 y entrada inválida 400", async () => {
    expect((await request(app).get("/api/owner/tables")).status).toBe(401);
    await createSuperadmin();
    expect((await (await loginAs(app, "root@test.local")).get("/api/owner/tables")).status).toBe(403);
    expect((await newTable({ seats: 0 })).status).toBe(400);
    expect((await newTable({ number: "uno" })).status).toBe(400);
    const table = (await newTable({})).body.table;
    expect((await owner.post(`/api/owner/tables/${table._id}/orders`).send({ items: [] })).status).toBe(400);
    expect((await owner.get("/api/owner/tables/no-es-id/tab")).status).toBe(400);
  });

  it("no ve ni toca mesas ni cuentas de otro local", async () => {
    const { commerce: other } = await createCommerceWithOwner({ slug: "loja-b" });
    const otherMenu = await createMenu(other);
    const otherOwner = await loginAs(app, "dono-loja-b@test.local");
    const theirs = (await otherOwner.post("/api/owner/tables").send({})).body.table;
    const theirOrder = await otherOwner.post(`/api/owner/tables/${theirs._id}/orders`).send({ items: [{ productId: String(otherMenu.coca._id), quantity: 1 }] });
    const theirTab = theirOrder.body.tab._id;

    expect((await owner.get("/api/owner/tables")).body.tables).toEqual([]);
    expect((await owner.get(`/api/owner/tables/${theirs._id}/tab`)).status).toBe(404);
    expect((await owner.patch(`/api/owner/tables/${theirs._id}`).send({ name: "x" })).status).toBe(404);
    expect((await owner.delete(`/api/owner/tables/${theirs._id}`)).status).toBe(404);
    expect((await owner.put("/api/owner/tables/layout").send({ positions: [{ id: theirs._id, x: 3, y: 3 }] })).status).toBe(404);
    expect((await owner.post(`/api/owner/tables/${theirs._id}/orders`).send({ items: items() })).status).toBe(404);
    expect((await owner.post(`/api/owner/tabs/${theirTab}/bill`)).status).toBe(404);
    expect((await owner.post(`/api/owner/tabs/${theirTab}/close`).send({ paymentMethod: "cash" })).status).toBe(404);
    expect((await owner.get(`/api/owner/tabs/${theirTab}/bill`)).status).toBe(404);
    const mine = (await newTable({})).body.table;
    const myOrder = await owner.post(`/api/owner/tables/${mine._id}/orders`).send({ items: items() });
    expect((await owner.post(`/api/owner/tabs/${myOrder.body.tab._id}/move`).send({ tableId: theirs._id })).status).toBe(404);
    // Productos de otro local en un pedido de mesa: no.
    expect((await owner.post(`/api/owner/tables/${mine._id}/orders`).send({ items: [{ productId: String(otherMenu.coca._id), quantity: 1 }] })).status).toBeGreaterThanOrEqual(400);
  });
});

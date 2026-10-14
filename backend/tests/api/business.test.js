import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/app.js";
import { createCommerceWithOwner, createSuperadmin, createStaff, loginAs } from "../helpers.js";
import Commerce from "../../src/models/commerce.model.js";
import Order from "../../src/models/order.model.js";
import Subscription from "../../src/models/subscription.model.js";
const app = createApp();

describe("suscripciones y reportes", () => {
  it("restringe administración, evita duplicar pagos y no suspende el comercio", async () => {
    const { commerce, owner } = await createCommerceWithOwner();
    const { owner: other } = await createCommerceWithOwner({ slug: "otra" });
    const admin = await createSuperadmin(); const root = await loginAs(app, admin.email);
    const agent = await loginAs(app, owner.email); const second = await loginAs(app, other.email);
    const path = `/api/admin/commerces/${commerce._id}/subscription`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await agent.get(path)).status).toBe(403);
    expect((await root.put(path).send({ priceCents: -1 })).status).toBe(400);
    expect((await root.put(path).send({ plan: "Essencial", priceCents: 7990, dueDate: "2020-01-01", status: "active" })).body.subscription.overdue).toBe(true);
    const payment = { reference: randomUUID(), amountCents: 7990, paidAt: "2020-01-01T15:00:00.000Z", period: "2020-01" };
    expect((await root.post(`${path}/payments`).send(payment)).status).toBe(201);
    const repeat = await root.post(`${path}/payments`).send(payment);
    expect(repeat.status).toBe(200); expect(repeat.body.subscription.payments).toHaveLength(1);
    expect((await agent.get("/api/owner/subscription")).body.subscription.payments).toHaveLength(1);
    expect((await second.get("/api/owner/subscription")).body.subscription.payments).toHaveLength(0);
    expect((await Commerce.findById(commerce._id)).status).toBe("active");
    const staff = await createStaff(commerce); const employee = await loginAs(app, staff.email);
    expect((await employee.get("/api/owner/subscription")).status).toBe(403);
    expect((await employee.get("/api/owner/reports?from=2026-01-01&to=2026-01-31")).status).toBe(403);
  });
  it("agrega más de 500 pedidos, corta el día a las 05:00 de Brasil y excluye otros locales y cancelados", async () => {
    const { commerce, owner } = await createCommerceWithOwner(); const { commerce: other } = await createCommerceWithOwner({ slug: "otra" });
    const agent = await loginAs(app, owner.email);
    // Direct fixture insertion deliberately avoids 502 unrelated order-placement transactions.
    await Order.collection.insertMany(Array.from({ length: 502 }, (_, i) => ({ commerce: commerce._id, clientOrderId: randomUUID(), number: i + 1, status: "delivered", totalCents: 1000, items: [], createdAt: new Date("2026-01-02T07:59:00Z") })));
    await Order.collection.insertMany([
      { commerce: commerce._id, clientOrderId: randomUUID(), number: 503, status: "cancelled", totalCents: 9999, items: [], createdAt: new Date("2026-01-01T12:00:00Z") },
      { commerce: other._id, clientOrderId: randomUUID(), number: 1, status: "delivered", totalCents: 9999, items: [], createdAt: new Date("2026-01-01T12:00:00Z") },
      // 05:00 del 2 en Brasil: ya es el día siguiente; 04:59 del 1, el anterior.
      { commerce: commerce._id, clientOrderId: randomUUID(), number: 504, status: "delivered", totalCents: 9999, items: [], createdAt: new Date("2026-01-02T08:00:00Z") },
      { commerce: commerce._id, clientOrderId: randomUUID(), number: 505, status: "delivered", totalCents: 9999, items: [], createdAt: new Date("2026-01-01T07:59:00Z") },
    ]);
    const result = await agent.get("/api/owner/reports?from=2026-01-01&to=2026-01-01");
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ completed: 502, salesCents: 502000, averageCents: 1000, cancelled: 1 });
    expect((await agent.get("/api/owner/reports?from=2026-02-30&to=2026-03-01")).status).toBe(400);
  });
});

describe("cierre de caja", () => {
  it("separa por forma de pago, entrega o retiro y día de operación, y avisa lo que sigue abierto", async () => {
    const { commerce, owner } = await createCommerceWithOwner({ slug: "caixa" });
    const agent = await loginAs(app, owner.email);
    const order = (number, fields) => ({
      commerce: commerce._id, clientOrderId: randomUUID(), number, status: "delivered", items: [],
      subtotalCents: 0, deliveryFeeCents: 0, discountCents: 0, totalCents: 0, ...fields,
    });
    await Order.collection.insertMany([
      // Viernes 2026-01-02 a la noche (y la 01:00 del sábado cuenta en el viernes).
      order(1, { paymentMethod: "cash", fulfillment: "delivery", subtotalCents: 3000, deliveryFeeCents: 500, totalCents: 3500, createdAt: new Date("2026-01-02T23:00:00Z") }),
      order(2, { paymentMethod: "pix", fulfillment: "pickup", subtotalCents: 2000, discountCents: 200, totalCents: 1800, createdAt: new Date("2026-01-03T04:00:00Z") }),
      // Sábado.
      order(3, { paymentMethod: "card", fulfillment: "delivery", subtotalCents: 4000, deliveryFeeCents: 500, totalCents: 4500, createdAt: new Date("2026-01-03T22:00:00Z") }),
      order(4, { paymentMethod: "cash", fulfillment: "pickup", subtotalCents: 1000, totalCents: 1000, createdAt: new Date("2026-01-03T22:30:00Z") }),
      // Abierto y cancelado: no son ventas.
      order(5, { status: "confirmed", paymentMethod: "cash", fulfillment: "pickup", totalCents: 2500, createdAt: new Date("2026-01-03T23:00:00Z") }),
      order(6, { status: "cancelled", paymentMethod: "pix", fulfillment: "pickup", totalCents: 9999, createdAt: new Date("2026-01-03T23:10:00Z") }),
    ]);
    const { body } = await agent.get("/api/owner/reports?from=2026-01-02&to=2026-01-03");
    expect(body).toMatchObject({
      completed: 4, cancelled: 1, salesCents: 10800, subtotalCents: 10000, deliveryFeeCents: 1000, discountCents: 200,
      open: { count: 1, salesCents: 2500 },
    });
    expect(body.payments).toEqual([
      { method: "card", count: 1, salesCents: 4500 },
      { method: "cash", count: 2, salesCents: 4500 },
      { method: "pix", count: 1, salesCents: 1800 },
    ]);
    expect(body.fulfillment).toEqual([
      { type: "delivery", count: 2, salesCents: 8000 },
      { type: "pickup", count: 2, salesCents: 2800 },
    ]);
    expect(body.days).toEqual([
      { day: "2026-01-02", count: 2, salesCents: 5300 },
      { day: "2026-01-03", count: 2, salesCents: 5500 },
    ]);
  });
});

describe("planes Essencial y Plus", () => {
  it("el plan se elige de la lista y el nombre viejo se muestra como Plus", async () => {
    const { commerce, owner } = await createCommerceWithOwner({ slug: "planes" });
    const admin = await createSuperadmin(); const root = await loginAs(app, admin.email);
    const path = `/api/admin/commerces/${commerce._id}/subscription`;
    const body = { priceCents: 9990, dueDate: null, status: "active" };
    expect((await root.put(path).send({ ...body, plan: "Member+" })).status).toBe(400);
    expect((await root.put(path).send({ ...body, plan: "Plus" })).body.subscription.plan).toBe("Plus");
    await Subscription.updateOne({ commerce: commerce._id }, { $set: { plan: "Member Plus" } });
    const agent = await loginAs(app, owner.email);
    expect((await agent.get("/api/owner/subscription")).body.subscription.plan).toBe("Plus");
  });
});

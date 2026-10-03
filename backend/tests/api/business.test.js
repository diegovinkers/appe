import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/app.js";
import { createCommerceWithOwner, createSuperadmin, createStaff, loginAs } from "../helpers.js";
import Commerce from "../../src/models/commerce.model.js";
import Order from "../../src/models/order.model.js";
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
  it("agrega más de 500 pedidos, respeta la fecha de Brasil y excluye otros locales y cancelados", async () => {
    const { commerce, owner } = await createCommerceWithOwner(); const { commerce: other } = await createCommerceWithOwner({ slug: "otra" });
    const agent = await loginAs(app, owner.email);
    // Direct fixture insertion deliberately avoids 502 unrelated order-placement transactions.
    await Order.collection.insertMany(Array.from({ length: 502 }, (_, i) => ({ commerce: commerce._id, clientOrderId: randomUUID(), number: i + 1, status: "delivered", totalCents: 1000, items: [], createdAt: new Date("2026-01-02T02:59:00Z") })));
    await Order.collection.insertMany([
      { commerce: commerce._id, clientOrderId: randomUUID(), number: 503, status: "cancelled", totalCents: 9999, items: [], createdAt: new Date("2026-01-01T12:00:00Z") },
      { commerce: other._id, clientOrderId: randomUUID(), number: 1, status: "delivered", totalCents: 9999, items: [], createdAt: new Date("2026-01-01T12:00:00Z") },
      { commerce: commerce._id, clientOrderId: randomUUID(), number: 504, status: "delivered", totalCents: 9999, items: [], createdAt: new Date("2026-01-02T03:00:00Z") },
    ]);
    const result = await agent.get("/api/owner/reports?from=2026-01-01&to=2026-01-01");
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ completed: 502, salesCents: 502000, averageCents: 1000, cancelled: 1 });
    expect((await agent.get("/api/owner/reports?from=2026-02-30&to=2026-03-01")).status).toBe(400);
  });
});

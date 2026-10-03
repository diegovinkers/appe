import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import AuditLog from "../../src/models/auditLog.model.js";
import Commerce from "../../src/models/commerce.model.js";
import Order from "../../src/models/order.model.js";
import { acquireLock, runJob } from "../../src/jobs/scheduler.js";
import {
  createCommerceWithOwner,
  createMenu,
  createStaff,
  createSuperadmin,
  loginAs,
} from "../helpers.js";

const app = createApp();

afterEach(() => vi.restoreAllMocks());

describe("requests", () => {
  it("cada respuesta trae un X-Request-Id", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("un error inesperado da 500 genérico con el requestId para buscarlo en los logs", async () => {
    vi.spyOn(Commerce, "findOne").mockImplementationOnce(() => {
      throw new Error("detalle interno que no tiene que salir");
    });
    const res = await request(app).get("/api/public/stores/loja-a");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "Erro interno do servidor",
      requestId: res.headers["x-request-id"],
    });
  });
});

describe("protección CSRF por Content-Type", () => {
  it.each([
    ["application/x-www-form-urlencoded", "email=a%40b.com&password=x"],
    ["multipart/form-data; boundary=x", "--x--"],
    ["text/plain", '{"email":"a@b.com","password":"x"}'],
  ])("rechaza con 415 un POST %s", async (type, body) => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", type).send(body);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("acepta JSON con charset y requests sin body", async () => {
    const json = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json; charset=utf-8")
      .send(JSON.stringify({ email: "nadie@test.local", password: "x" }));
    expect(json.status).toBe(401);
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });
});

describe("permisos del empleado (staff)", () => {
  let staff, menu;
  beforeEach(async () => {
    const { commerce } = await createCommerceWithOwner();
    menu = await createMenu(commerce);
    await createStaff(commerce);
    staff = await loginAs(app, "staff-loja-a@test.local");
  });

  it("atiende pedidos, marca agotados y ve el menú", async () => {
    expect((await staff.get("/api/owner/orders")).status).toBe(200);
    expect((await staff.get("/api/owner/products")).status).toBe(200);
    const product = await staff.patch(`/api/owner/products/${menu.coca._id}/availability`).send({ available: false });
    expect(product.status).toBe(200);
    expect(product.body.product.available).toBe(false);
    const option = menu.adicionais.options[0];
    expect(
      (await staff.patch(`/api/owner/option-groups/${menu.adicionais._id}/options/${option._id}`).send({ available: false }))
        .status
    ).toBe(200);
  });

  it("no cambia precios, menú ni configuración", async () => {
    const forbidden = [
      staff.patch(`/api/owner/products/${menu.coca._id}`).send({ priceCents: 1 }),
      staff.post("/api/owner/products").send({ category: String(menu.bebidas._id), name: "X", priceCents: 1 }),
      staff.delete(`/api/owner/products/${menu.coca._id}`),
      staff.post("/api/owner/categories").send({ name: "X" }),
      staff.patch("/api/owner/store").send({ name: "Outro nome" }),
      staff.get("/api/admin/commerces"),
    ];
    for (const res of await Promise.all(forbidden)) {
      expect(res.status).toBe(403);
    }
  });
});

describe("auditoría", () => {
  it("registra cambios de precio, borrados, cancelaciones y cambios del local", async () => {
    const { commerce, owner } = await createCommerceWithOwner();
    const menu = await createMenu(commerce);
    const agent = await loginAs(app, owner.email);

    await agent.patch(`/api/owner/products/${menu.coca._id}`).send({ priceCents: 700 });
    await agent.patch(`/api/owner/products/${menu.coca._id}`).send({ name: "Coca lata" }); // sin cambio de precio
    await agent.patch("/api/owner/store").send({ deliveryFeeCents: 800 });
    await agent.delete(`/api/owner/products/${menu.xSalada._id}`);
    const bacon = menu.adicionais.options[0];
    const groupUpdate = await agent.patch(`/api/owner/option-groups/${menu.adicionais._id}`).send({
      maxSelect: 2,
      options: [{ _id: String(bacon._id), name: "Bacon", priceCents: 500 }, { name: "Picles" }],
    });
    expect(groupUpdate.status).toBe(200);

    const entries = await AuditLog.find({ commerce: commerce._id }).sort({ createdAt: 1 }).lean();
    expect(entries.map((e) => e.action)).toEqual([
      "product.price_changed",
      "store.updated",
      "product.deleted",
      "option_group.prices_changed",
    ]);
    expect(entries[0]).toMatchObject({
      actor: { user: owner._id, role: "owner" },
      changes: { name: "Coca-Cola 350ml", priceCents: [600, 700] },
    });
    expect(entries[1].changes).toEqual({ deliveryFeeCents: [0, 800] });
    expect(entries[3].changes.options).toEqual([{ option: "Bacon", priceCents: [400, 500] }]);
  });

  it("registra quién canceló un pedido", async () => {
    const { commerce, owner } = await createCommerceWithOwner();
    const menu = await createMenu(commerce);
    const created = await request(app)
      .post("/api/public/stores/loja-a/orders")
      .send({
        clientOrderId: randomUUID(),
        customer: { name: "Maria", phone: "55 99999-1234" },
        fulfillment: "pickup",
        paymentMethod: "cash",
        items: [{ productId: String(menu.coca._id), quantity: 1 }],
      });
    const agent = await loginAs(app, owner.email);
    const res = await agent.patch(`/api/owner/orders/${created.body.order._id}/status`).send({ status: "cancelled", reason: "Cliente desistiu" });

    expect(res.body.order.statusHistory.at(-1)).toMatchObject({ status: "cancelled", by: String(owner._id) });
    const entry = await AuditLog.findOne({ action: "order.cancelled" }).lean();
    expect(entry.changes).toEqual({ number: 1, from: "new", totalCents: 600, reason: "Cliente desistiu" });
  });

  it("el superadmin ve la auditoría de toda la plataforma y la filtra por local", async () => {
    await createSuperadmin();
    const root = await loginAs(app, "root@test.local");
    const created = await root.post("/api/admin/commerces").send({
      commerce: { name: "Nova", slug: "nova", whatsapp: "55 99999-8888" },
      owner: { name: "Ana", email: "ana@test.local", password: "senha-da-ana-1" },
    });
    await root.patch(`/api/admin/commerces/${created.body.commerce._id}`).send({ status: "suspended" });

    const res = await root.get(`/api/admin/audit?commerce=${created.body.commerce._id}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.action)).toEqual(["admin.commerce_updated", "admin.commerce_created"]);
    expect(res.body.entries[0].changes).toEqual({ status: ["active", "suspended"] });

    const { owner } = await createCommerceWithOwner({ slug: "outra" });
    const ownerAgent = await loginAs(app, owner.email);
    expect((await ownerAgent.get("/api/admin/audit")).status).toBe(403);
  });
});

describe("transacciones al crear pedidos", () => {
  let menu;
  beforeEach(async () => {
    ({ commerce: menu } = await createCommerceWithOwner());
    menu = await createMenu(menu);
  });

  const body = (clientOrderId = randomUUID()) => ({
    clientOrderId,
    customer: { name: "Maria", phone: "55 99999-1234" },
    fulfillment: "pickup",
    paymentMethod: "cash",
    items: [{ productId: String(menu.coca._id), quantity: 1 }],
  });
  const post = (payload) => request(app).post("/api/public/stores/loja-a/orders").send(payload);

  it("si falla al guardar, el número de pedido no se pierde", async () => {
    vi.spyOn(Order, "create").mockRejectedValueOnce(new Error("falla simulada"));
    expect((await post(body())).status).toBe(500);
    expect((await post(body())).body.order.number).toBe(1);
  });

  it("dos envíos simultáneos del mismo pedido crean uno solo y no saltean números", async () => {
    const payload = body();
    const results = await Promise.all([post(payload), post(payload)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await Order.countDocuments()).toBe(1);
    expect((await post(body())).body.order.number).toBe(2);
  });
});

describe("jobs programados", () => {
  it("solo una instancia toma el lock hasta que vence", async () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(await acquireLock("prueba", 60_000, now)).toBe(true);
    expect(await acquireLock("prueba", 60_000, new Date(now.getTime() + 30_000))).toBe(false);
    expect(await acquireLock("prueba", 60_000, new Date(now.getTime() + 61_000))).toBe(true);
  });

  it("un job que falla no rompe nada y no se repite mientras dura el lock", async () => {
    const run = vi.fn().mockRejectedValue(new Error("falla"));
    expect(await runJob({ name: "falla", run, lockMs: 60_000 })).toBe(true);
    expect(await runJob({ name: "falla", run, lockMs: 60_000 })).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

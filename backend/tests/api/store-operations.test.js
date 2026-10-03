import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { cleanupStoreSchedules } from "../../src/jobs/maintenance.js";
import AuditLog from "../../src/models/auditLog.model.js";
import Commerce from "../../src/models/commerce.model.js";
import Order from "../../src/models/order.model.js";
import { createCommerceWithOwner, createMenu, createStaff, loginAs } from "../helpers.js";

const app = createApp();

// Lee el body como Buffer (PNG, SVG).
const binary = (res, callback) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
};

let commerce, owner, menu;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a", deliveryFeeCents: 500 }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-loja-a@test.local");
});

afterEach(() => vi.useRealTimers());

const orderBody = (changes = {}) => ({
  clientOrderId: randomUUID(),
  customer: { name: "Maria", phone: "55 99999-1234" },
  fulfillment: "delivery",
  address: { street: "Rua Brasil", number: "10", neighborhood: "Centro" },
  paymentMethod: "cash",
  items: [{ productId: String(menu.coca._id), quantity: 2 }],
  ...changes,
});
const postOrder = (body) => request(app).post("/api/public/stores/loja-a/orders").send(body);

describe("horarios (PUT /api/owner/store/hours)", () => {
  const weekly = { fri: [{ open: "11:00", close: "14:30" }, { open: "18:00", close: "02:00" }] };

  it("guarda el horario y el menú público calcula si está abierto", async () => {
    // Sin override: manda el horario. Viernes 2026-09-25 12:00 en Brasil.
    await Commerce.updateOne({ _id: commerce._id }, { override: null });
    const res = await owner.put("/api/owner/store/hours").send({ weekly });
    expect(res.status).toBe(200);
    expect(res.body.store.hours.weekly.fri).toHaveLength(2);
    expect(res.body.store.hours.weekly.mon).toEqual([]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
    const open = await request(app).get("/api/public/stores/loja-a");
    expect(open.body.store).toMatchObject({ isOpen: true, opening: { status: "open", closesAt: "2026-09-25T17:30:00.000Z" } });

    vi.setSystemTime(new Date("2026-09-25T18:00:00Z")); // 15:00, entre turnos
    const closed = await request(app).get("/api/public/stores/loja-a");
    expect(closed.body.store).toMatchObject({ isOpen: false, opening: { status: "closed", nextOpenAt: "2026-09-25T21:00:00.000Z" } });
    const order = await postOrder(orderBody());
    expect(order.status).toBe(409);
    expect(order.body.error).toMatchObject({ code: "STORE_CLOSED", details: { nextOpenAt: "2026-09-25T21:00:00.000Z" } });
  });

  it("descarta las excepciones de días pasados y muestra las próximas", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
    const res = await owner.put("/api/owner/store/hours").send({
      weekly,
      exceptions: [
        { date: "2026-09-01", closed: true },
        { date: "2026-10-12", closed: true, note: "Feriado" },
        { date: "2026-12-24", intervals: [{ open: "10:00", close: "15:00" }] },
      ],
    });
    expect(res.body.store.hours.exceptions.map((e) => e.date)).toEqual(["2026-10-12", "2026-12-24"]);

    const menuRes = await request(app).get("/api/public/stores/loja-a");
    expect(menuRes.body.store.hours.upcomingExceptions).toEqual([]); // el 12/10 está a más de 14 días
    vi.setSystemTime(new Date("2026-10-05T15:00:00Z"));
    const later = await request(app).get("/api/public/stores/loja-a");
    expect(later.body.store.hours.upcomingExceptions).toEqual([
      { date: "2026-10-12", closed: true, intervals: [], note: "Feriado" },
    ]);
  });

  it.each([
    ["hora mal escrita", { weekly: { mon: [{ open: "8:00", close: "12:00" }] } }],
    ["apertura igual al cierre", { weekly: { mon: [{ open: "10:00", close: "10:00" }] } }],
    ["turnos que se pisan", { weekly: { mon: [{ open: "10:00", close: "15:00" }, { open: "14:00", close: "18:00" }] } }],
    ["turno que cruza la medianoche y pisa otro", { weekly: { mon: [{ open: "20:00", close: "02:00" }, { open: "22:00", close: "23:00" }] } }],
    ["excepción sin horarios ni cerrado", { weekly: {}, exceptions: [{ date: "2027-01-01" }] }],
    ["fecha repetida", { weekly: {}, exceptions: [{ date: "2027-01-01", closed: true }, { date: "2027-01-01", closed: true }] }],
    ["fecha inexistente", { weekly: {}, exceptions: [{ date: "2027-02-30", closed: true }] }],
  ])("rechaza con 400: %s", async (_caso, body) => {
    const res = await owner.put("/api/owner/store/hours").send(body);
    expect(res.status).toBe(400);
  });

  it("acepta un turno hasta la medianoche con 24:00", async () => {
    const res = await owner.put("/api/owner/store/hours").send({ weekly: { sat: [{ open: "18:00", close: "24:00" }] } });
    expect(res.status).toBe(200);
  });
});

describe("apertura manual (PUT /api/owner/store/status)", () => {
  it("pausar: el menú avisa y los pedidos se rechazan con el mensaje", async () => {
    const res = await owner.put("/api/owner/store/status").send({ mode: "paused", minutes: 20, message: "Muitos pedidos" });
    expect(res.status).toBe(200);
    expect(res.body.opening).toMatchObject({ status: "paused", acceptingOrders: false, message: "Muitos pedidos" });

    const publicRes = await request(app).get("/api/public/stores/loja-a");
    expect(publicRes.body.store).toMatchObject({ isOpen: false, opening: { status: "paused", message: "Muitos pedidos" } });

    const order = await postOrder(orderBody());
    expect(order.status).toBe(409);
    expect(order.body.error).toMatchObject({ code: "STORE_PAUSED", message: "Muitos pedidos" });
  });

  it("cerrar hasta una hora y volver al horario con auto", async () => {
    const until = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const closed = await owner.put("/api/owner/store/status").send({ mode: "closed", until });
    expect(closed.body.store.override).toMatchObject({ mode: "closed", until });

    const auto = await owner.put("/api/owner/store/status").send({ mode: "auto" });
    expect(auto.body.store.override).toBeNull();
    expect(auto.body.opening.source).toBe("schedule");
  });

  it.each([
    ["un horario pasado", { mode: "closed", until: "2020-01-01T00:00:00Z" }],
    ["más de 7 días", { mode: "open", until: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() }],
  ])("rechaza %s", async (_caso, body) => {
    const res = await owner.put("/api/owner/store/status").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_UNTIL");
  });

  it("rechaza pausas fuera de rango y modos desconocidos", async () => {
    expect((await owner.put("/api/owner/store/status").send({ mode: "paused", minutes: 1 })).status).toBe(400);
    expect((await owner.put("/api/owner/store/status").send({ mode: "sleeping" })).status).toBe(400);
  });

  it("un empleado puede abrir y pausar, pero no cambiar el horario", async () => {
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-a@test.local");
    expect((await staff.put("/api/owner/store/status").send({ mode: "paused", minutes: 10 })).status).toBe(200);
    expect((await staff.put("/api/owner/store/hours").send({ weekly: {} })).status).toBe(403);
  });

  it("queda en la auditoría quién cambió horarios y apertura", async () => {
    await owner.put("/api/owner/store/hours").send({ weekly: {} });
    await owner.put("/api/owner/store/status").send({ mode: "paused", minutes: 15 });
    const actions = (await AuditLog.find({ commerce: commerce._id }).sort({ createdAt: 1 })).map((e) => e.action);
    expect(actions).toEqual(["store.hours_updated", "store.status_changed"]);
  });
});

describe("entrega por barrio", () => {
  const zones = [
    { name: "Centro", feeCents: 400 },
    { name: "Colina Santa Teresa", feeCents: 600, minOrderCents: 3000, estimateMin: 50, estimateMax: 70 },
    { name: "Zona rural", feeCents: 1500, active: false },
  ];

  const useZones = async () => {
    const res = await owner.patch("/api/owner/store").send({ deliveryMode: "zones", deliveryZones: zones });
    expect(res.status).toBe(200);
    return res.body.store.deliveryZones;
  };

  it("el menú muestra solo los barrios activos", async () => {
    await useZones();
    const res = await request(app).get("/api/public/stores/loja-a");
    expect(res.body.store.deliveryMode).toBe("zones");
    expect(res.body.store.deliveryZones.map((z) => z.name)).toEqual(["Centro", "Colina Santa Teresa"]);
  });

  it("el pedido cobra la tarifa del barrio y guarda su nombre", async () => {
    const [centro] = await useZones();
    const res = await postOrder(orderBody({ address: { street: "Rua Brasil", number: "10", zoneId: centro._id, neighborhood: "Outro" } }));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ deliveryFeeCents: 400, totalCents: 1600, estimatedMinutes: { min: 40, max: 60 } });
    expect(res.body.whatsapp.message).toContain("— Centro");
    expect(res.body.whatsapp.message).toContain("Previsão de entrega: 40–60 min");
    const saved = await Order.findById(res.body.order._id);
    expect(saved.address.neighborhood).toBe("Centro");
    expect(String(saved.address.zoneId)).toBe(centro._id);
  });

  it("respeta el mínimo y el tiempo propios del barrio", async () => {
    const [, colina] = await useZones();
    const small = await postOrder(orderBody({ address: { street: "R", number: "1", zoneId: colina._id } }));
    expect(small.status).toBe(409);
    expect(small.body.error).toMatchObject({ code: "MIN_ORDER_NOT_REACHED", details: { minOrderCents: 3000 } });

    const big = await postOrder(
      orderBody({ address: { street: "R", number: "1", zoneId: colina._id }, items: [{ productId: String(menu.coca._id), quantity: 5 }] })
    );
    expect(big.body.order).toMatchObject({ deliveryFeeCents: 600, estimatedMinutes: { min: 50, max: 70 } });
  });

  it("rechaza un barrio inactivo, uno de otro local o ninguno", async () => {
    const saved = await useZones();
    const inactive = saved.find((z) => z.name === "Zona rural");
    for (const address of [
      { street: "R", number: "1", zoneId: inactive._id },
      { street: "R", number: "1", zoneId: "64b000000000000000000000" },
      { street: "R", number: "1", neighborhood: "Centro" },
    ]) {
      const res = await postOrder(orderBody({ address }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("DELIVERY_ZONE_NOT_AVAILABLE");
    }
  });

  it("entrega grátis desde un subtotal", async () => {
    await owner.patch("/api/owner/store").send({ freeDeliveryFromCents: 1000 });
    const free = await postOrder(orderBody()); // 2 cocas = 1200
    expect(free.body.order).toMatchObject({ subtotalCents: 1200, deliveryFeeCents: 0, totalCents: 1200 });
    const paid = await postOrder(orderBody({ items: [{ productId: String(menu.coca._id), quantity: 1 }] }));
    expect(paid.body.order.deliveryFeeCents).toBe(500);
  });

  it("con tarifa fija exige el nombre del barrio", async () => {
    const res = await postOrder(orderBody({ address: { street: "Rua Brasil", number: "10" } }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("address.neighborhood");
  });

  it("al editar los barrios conserva los ids y valida nombres e ids", async () => {
    const [centro] = await useZones();
    const kept = await owner.patch("/api/owner/store").send({
      deliveryZones: [{ _id: centro._id, name: "Centro", feeCents: 450 }, { name: "Vila Nova", feeCents: 700 }],
    });
    expect(kept.body.store.deliveryZones[0]).toMatchObject({ _id: centro._id, feeCents: 450 });

    const duplicate = await owner.patch("/api/owner/store").send({
      deliveryZones: [{ name: "Centro", feeCents: 1 }, { name: "centro", feeCents: 2 }],
    });
    expect(duplicate.body.error.code).toBe("DUPLICATE_ZONE");

    const foreign = await owner.patch("/api/owner/store").send({
      deliveryZones: [{ _id: "64b000000000000000000000", name: "X", feeCents: 1 }],
    });
    expect(foreign.body.error.code).toBe("INVALID_ZONE");
  });

  it("entregar por barrio exige al menos un barrio activo", async () => {
    const res = await owner.patch("/api/owner/store").send({ deliveryMode: "zones" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_DELIVERY_ZONES");
  });
});

describe("presentación, tiempos y programación", () => {
  it("guarda portada, Instagram normalizado, texto y aviso", async () => {
    const res = await owner.patch("/api/owner/store").send({
      coverUrl: `https://res.cloudinary.com/nube-de-prueba/image/upload/v1/app-pedidos/${commerce._id}/cover/capa.jpg`,
      instagram: "@Burger.Demo",
      about: "Desde 2019 na fronteira.",
      notice: "Hoje não temos batata",
    });
    expect(res.body.store).toMatchObject({ instagram: "burger.demo", notice: "Hoje não temos batata" });
    const publicRes = await request(app).get("/api/public/stores/loja-a");
    expect(publicRes.body.store).toMatchObject({ coverUrl: expect.stringContaining("/cover/capa.jpg"), instagram: "burger.demo" });
  });

  it.each([
    ["Instagram con espacios", { instagram: "burger demo" }],
    ["portada que no es URL", { coverUrl: "capa.jpg" }],
    ["franja de 20 minutos", { scheduling: { slotMinutes: 20 } }],
  ])("rechaza con 400: %s", async (_caso, body) => {
    expect((await owner.patch("/api/owner/store").send(body)).status).toBe(400);
  });

  it("combina los tiempos campo por campo y valida mínimo contra máximo", async () => {
    const ok = await owner.patch("/api/owner/store").send({ estimates: { deliveryMax: 90 } });
    expect(ok.body.store.estimates).toEqual({ deliveryMin: 40, deliveryMax: 90, pickupMin: 20, pickupMax: 30 });
    const bad = await owner.patch("/api/owner/store").send({ estimates: { pickupMin: 45 } });
    expect(bad.body.error.code).toBe("INVALID_ESTIMATES");
  });

  it("guarda la configuración de pedidos programados", async () => {
    const res = await owner.patch("/api/owner/store").send({ scheduling: { enabled: true, slotMinutes: 15 } });
    expect(res.body.store.scheduling).toEqual({ enabled: true, minLeadMinutes: 30, maxDaysAhead: 2, slotMinutes: 15 });
  });

  it("en retiro la previsión sale de los tiempos de retiro", async () => {
    const res = await postOrder(orderBody({ fulfillment: "pickup" }));
    expect(res.body.order.estimatedMinutes).toEqual({ min: 20, max: 30 });
    expect(res.body.whatsapp.message).toContain("Pronto para retirar em: 20–30 min");
  });
});

describe("QR del menú (GET /api/owner/store/qr)", () => {
  it("devuelve un PNG por defecto", async () => {
    const res = await owner.get("/api/owner/store/qr").buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-disposition"]).toContain('filename="qr-loja-a.png"');
    expect(res.body.subarray(1, 4).toString()).toBe("PNG");
  });

  it("devuelve un SVG si se pide", async () => {
    const res = await owner.get("/api/owner/store/qr?format=svg&size=256").buffer(true).parse(binary);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.body.toString()).toContain("<svg");
  });

  it("valida el tamaño", async () => {
    expect((await owner.get("/api/owner/store/qr?size=10")).status).toBe(400);
  });
});

describe("job de limpieza de horarios", () => {
  it("borra excepciones pasadas y overrides vencidos, y deja el resto", async () => {
    const now = new Date("2026-09-25T15:00:00Z");
    await Commerce.updateOne(
      { _id: commerce._id },
      {
        "hours.exceptions": [
          { date: "2026-09-20", closed: true, intervals: [] },
          { date: "2026-10-12", closed: true, intervals: [] },
        ],
        override: { mode: "closed", until: new Date("2026-09-25T14:00:00Z") },
      }
    );
    const other = await createCommerceWithOwner({ slug: "loja-b", override: { mode: "paused", until: new Date("2026-09-25T16:00:00Z") } });

    expect(await cleanupStoreSchedules(now)).toEqual({ exceptionsCleaned: 1, overridesCleared: 1 });
    const updated = await Commerce.findById(commerce._id);
    expect(updated.hours.exceptions.map((e) => e.date)).toEqual(["2026-10-12"]);
    expect(updated.override).toBeNull();
    expect((await Commerce.findById(other.commerce._id)).override.mode).toBe("paused");
  });
});

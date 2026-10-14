import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Commerce from "../../src/models/commerce.model.js";
import { createCommerceWithOwner, createMenu, loginAs } from "../helpers.js";

const app = createApp();

let commerce, menu, owner;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a", paymentMethods: ["cash", "pix", "card"], pixKey: "loja@pix.com" }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-loja-a@test.local");
});

const order = (fulfillment, paymentMethod) => ({
  clientOrderId: randomUUID(),
  customer: { name: "Maria", phone: "55 99999-1234" },
  fulfillment,
  ...(fulfillment === "delivery" && { address: { street: "Rua Brasil", number: "10", neighborhood: "Centro" } }),
  paymentMethod,
  items: [{ productId: String(menu.coca._id), quantity: 1 }],
});
const place = (body) => request(app).post("/api/public/stores/loja-a/orders").send(body);

describe("formas de pago del local", () => {
  it("un local sin opciones guardadas (de antes) acepta todo como siempre", async () => {
    await Commerce.collection.updateOne({ _id: commerce._id }, { $unset: { paymentOptions: "" } });
    const menuRes = await request(app).get("/api/public/stores/loja-a");
    expect(menuRes.body.store.paymentOptions).toEqual({
      cash: { fulfillment: "both", note: "", askChange: true },
      pix: { fulfillment: "both", note: "" },
      card: { fulfillment: "both", note: "" },
    });
    expect((await owner.get("/api/owner/store")).body.store.paymentOptions.card.fulfillment).toBe("both");
    expect((await place(order("delivery", "card"))).status).toBe(201);
  });

  it("tarjeta solo al retirar: el envío con tarjeta se rechaza", async () => {
    const res = await owner.patch("/api/owner/store").send({ paymentOptions: { card: { fulfillment: "pickup", note: "Crédito e débito" } } });
    expect(res.status).toBe(200);
    expect(res.body.store.paymentOptions.card).toEqual({ fulfillment: "pickup", note: "Crédito e débito" });
    // Lo que no se mandó queda como estaba.
    expect(res.body.store.paymentOptions.cash).toEqual({ fulfillment: "both", note: "", askChange: true });

    const delivery = await place(order("delivery", "card"));
    expect(delivery.status).toBe(400);
    expect(delivery.body.error.code).toBe("PAYMENT_METHOD_NOT_AVAILABLE");
    expect((await place(order("pickup", "card"))).status).toBe(201);
    expect((await place(order("delivery", "cash"))).status).toBe(201);
  });

  it("cada modo de entrega activo necesita al menos una forma de pago", async () => {
    const res = await owner.patch("/api/owner/store").send({
      paymentOptions: { cash: { fulfillment: "pickup" }, pix: { fulfillment: "pickup" }, card: { fulfillment: "pickup" } },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_PAYMENT_FOR_FULFILLMENT");
    // Sin entrega, sí.
    const pickupOnly = await owner.patch("/api/owner/store").send({
      fulfillment: { delivery: false },
      paymentOptions: { cash: { fulfillment: "pickup" }, pix: { fulfillment: "pickup" }, card: { fulfillment: "pickup" } },
    });
    expect(pickupOnly.status).toBe(200);
    expect((await owner.patch("/api/owner/store").send({ paymentOptions: { card: { fulfillment: "todos" } } })).status).toBe(400);
  });

  it("valida una chave Pix nueva, pero no rompe la que ya estaba", async () => {
    const wrong = await owner.patch("/api/owner/store").send({ pixKey: "x" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_PIX_KEY");
    expect((await owner.patch("/api/owner/store").send({ pixKey: "529.982.247-25" })).status).toBe(200);

    // Un local con una chave vieja que hoy no pasaría puede seguir guardando lo demás.
    await Commerce.updateOne({ _id: commerce._id }, { $set: { pixKey: "chave antiga" } });
    const other = await owner.patch("/api/owner/store").send({ pixKey: "chave antiga", notice: "Hoje sem batata" });
    expect(other.status).toBe(200);
  });

  it("el seguimiento muestra la chave Pix solo si el pedido es con Pix", async () => {
    const pix = await place(order("pickup", "pix"));
    const card = await place(order("pickup", "card"));
    const token = (res) => res.body.trackingUrl.split("/").at(-1);
    expect((await request(app).get(`/api/public/orders/${token(pix)}`)).body.store.pixKey).toBe("loja@pix.com");
    expect((await request(app).get(`/api/public/orders/${token(card)}`)).body.store.pixKey).toBe("");
  });
});

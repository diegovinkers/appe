import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Commerce from "../../src/models/commerce.model.js";
import Order from "../../src/models/order.model.js";
import { containsKey, createCommerceWithOwner, createMenu, createStaff, loginAs } from "../helpers.js";

const app = createApp();

let commerce, menu, owner;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "burger" }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-burger@test.local");
});

async function placeOrder(name = "Maria Souza") {
  const res = await request(app)
    .post("/api/public/stores/burger/orders")
    .send({
      clientOrderId: randomUUID(),
      customer: { name, phone: "55 99999-1234" },
      fulfillment: "pickup",
      paymentMethod: "cash",
      items: [{ productId: menu.xBurger._id, quantity: 1, options: [{ groupId: menu.ponto._id, optionId: menu.ponto.options[0]._id }] }],
    });
  expect(res.status).toBe(201);
  return { id: res.body.order._id, token: res.body.trackingUrl.split("/").at(-1) };
}

async function deliver(id) {
  for (const status of ["confirmed", "ready", "delivered"]) {
    expect((await owner.patch(`/api/owner/orders/${id}/status`).send({ status })).status).toBe(200);
  }
}

const review = (token, body) => request(app).post(`/api/public/orders/${token}/review`).send(body);
const tracking = async (token) => (await request(app).get(`/api/public/orders/${token}`)).body;

describe("POST /api/public/orders/:token/review", () => {
  it("solo se puede opinar con el pedido entregado", async () => {
    const { token } = await placeOrder();
    expect(await tracking(token)).toMatchObject({ review: null, canReview: false });
    const res = await review(token, { rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("REVIEW_NOT_ALLOWED");
  });

  it("una vez por pedido, y el seguimiento la muestra con el primer nombre", async () => {
    const { id, token } = await placeOrder("Maria Souza da Silva");
    await deliver(id);
    expect(await tracking(token)).toMatchObject({ review: null, canReview: true });

    const res = await review(token, { rating: 4, comment: "  Chegou quentinho  " });
    expect(res.status).toBe(201);
    expect(res.body.review).toMatchObject({ rating: 4, comment: "Chegou quentinho", customerName: "Maria" });
    expect(await tracking(token)).toMatchObject({ review: { rating: 4 }, canReview: false });

    const again = await review(token, { rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("REVIEW_EXISTS");
  });

  it("se cierra 30 días después de la entrega", async () => {
    const { id, token } = await placeOrder();
    await deliver(id);
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Order.updateOne({ _id: id, "statusHistory.status": "delivered" }, { $set: { "statusHistory.$.at": longAgo } });

    expect((await tracking(token)).canReview).toBe(false);
    const res = await review(token, { rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("REVIEW_WINDOW_CLOSED");
  });

  it.each([
    ["sin estrellas", { comment: "oi" }],
    ["0 estrellas", { rating: 0 }],
    ["6 estrellas", { rating: 6 }],
    ["media estrella", { rating: 3.5 }],
    ["comentario largo", { rating: 5, comment: "x".repeat(501) }],
  ])("rechaza con 400: %s", async (_caso, body) => {
    const { id, token } = await placeOrder();
    await deliver(id);
    const res = await review(token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("link que no existe, o de un local suspendido: 404", async () => {
    expect((await review("x".repeat(32), { rating: 5 })).status).toBe(404);
    const { id, token } = await placeOrder();
    await deliver(id);
    await Commerce.updateOne({ _id: commerce._id }, { status: "suspended" });
    expect((await review(token, { rating: 5 })).status).toBe(404);
  });
});

describe("reseñas en el menú y en el panel", () => {
  async function twoReviews() {
    for (const [name, rating] of [["Ana Lima", 5], ["Juan Pérez", 3]]) {
      const { id, token } = await placeOrder(name);
      await deliver(id);
      expect((await review(token, { rating, comment: `Nota ${rating}` })).status).toBe(201);
    }
  }

  it("el menú muestra el promedio y las reseñas visibles, sin datos privados", async () => {
    await twoReviews();
    const store = await request(app).get("/api/public/stores/burger");
    expect(store.body.store.rating).toEqual({ average: 4, count: 2 });
    const directory = await request(app).get("/api/public/stores");
    expect(directory.body.stores[0].rating).toEqual({ average: 4, count: 2 });

    const list = await request(app).get("/api/public/stores/burger/reviews");
    expect(list.status).toBe(200);
    expect(list.body.reviews.map((r) => [r.customerName, r.rating])).toEqual([["Juan", 3], ["Ana", 5]]);
    for (const key of ["phone", "order", "orderNumber", "_id", "hidden", "commerce"]) {
      expect(containsKey(list.body, key), key).toBe(false);
    }
  });

  it("sin reseñas, el promedio es null", async () => {
    expect((await request(app).get("/api/public/stores/burger")).body.store.rating).toEqual({ average: null, count: 0 });
  });

  it("el dueño oculta una reseña: sale del menú y del promedio, pero la sigue viendo", async () => {
    await twoReviews();
    const mine = (await owner.get("/api/owner/reviews")).body.reviews;
    expect(mine).toHaveLength(2);
    const juan = mine.find((r) => r.customerName === "Juan");

    const hide = await owner.patch(`/api/owner/reviews/${juan._id}`).send({ hidden: true });
    expect(hide.status).toBe(200);
    expect(hide.body.review.hidden).toBe(true);

    expect((await request(app).get("/api/public/stores/burger/reviews")).body).toMatchObject({ rating: { average: 5, count: 1 } });
    expect((await owner.get("/api/owner/reviews")).body.reviews).toHaveLength(2);
  });

  it("el empleado las lee pero no las oculta; otro local no las toca", async () => {
    await twoReviews();
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-burger@test.local");
    const list = await staff.get("/api/owner/reviews");
    expect(list.status).toBe(200);
    const id = list.body.reviews[0]._id;
    expect((await staff.patch(`/api/owner/reviews/${id}`).send({ hidden: true })).status).toBe(403);

    await createCommerceWithOwner({ slug: "outra" });
    const other = await loginAs(app, "dono-outra@test.local");
    expect((await other.get("/api/owner/reviews")).body.reviews).toEqual([]);
    expect((await other.patch(`/api/owner/reviews/${id}`).send({ hidden: true })).status).toBe(404);
  });
});

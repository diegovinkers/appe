import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Order from "../../src/models/order.model.js";
import { createCommerceWithOwner, createMenu, loginAs } from "../helpers.js";

const app = createApp();

// Pedidos directo en la base, con los productos y la fecha que hagan falta.
let number = 1;
const insert = (commerce, items, { status = "delivered", daysAgo = 1 } = {}) => {
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return Order.collection.insertOne({
    commerce: commerce._id, clientOrderId: randomUUID(), number: number++, status, createdAt: at, updatedAt: at, scheduledFor: null,
    customer: { name: "Ana", phone: "" }, fulfillment: "pickup", paymentMethod: "cash", subtotalCents: 0, deliveryFeeCents: 0, totalCents: 0, statusHistory: [],
    items: items.map(([product, quantity]) => ({ product: product._id, name: product.name, quantity, unitPriceCents: 0, totalCents: 0, options: [] })),
  });
};

describe("lo más pedido (GET /api/owner/orders/top-products)", () => {
  it("suma las cantidades de los últimos 30 días, sin cancelados ni otros locales", async () => {
    const { commerce, owner } = await createCommerceWithOwner({ slug: "loja-top" });
    const menu = await createMenu(commerce);
    const agent = await loginAs(app, owner.email);
    await insert(commerce, [[menu.coca, 2], [menu.xBurger, 1]]);
    await insert(commerce, [[menu.coca, 1]], { status: "confirmed" });
    await insert(commerce, [[menu.xBurger, 5]], { status: "cancelled" });
    await insert(commerce, [[menu.xBurger, 9]], { daysAgo: 40 });
    const other = await createCommerceWithOwner({ slug: "loja-outra" });
    await insert(other.commerce, [[menu.xBurger, 50]]);

    const res = await agent.get("/api/owner/orders/top-products");
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([
      { productId: String(menu.coca._id), quantity: 3 },
      { productId: String(menu.xBurger._id), quantity: 1 },
    ]);
  });

  it("sin pedidos devuelve la lista vacía", async () => {
    const { owner } = await createCommerceWithOwner({ slug: "loja-vazia" });
    const agent = await loginAs(app, owner.email);
    expect((await agent.get("/api/owner/orders/top-products")).body).toEqual({ products: [] });
  });
});

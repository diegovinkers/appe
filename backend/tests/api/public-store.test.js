import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Category from "../../src/models/category.model.js";
import Commerce from "../../src/models/commerce.model.js";
import OptionGroup from "../../src/models/optionGroup.model.js";
import Product from "../../src/models/product.model.js";
import { containsKey, createCommerceWithOwner, createMenu } from "../helpers.js";

const app = createApp();

let commerce, menu;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "burger-demo", pixKey: "loja@pix.com" }));
  menu = await createMenu(commerce);
});

describe("GET /api/public/stores (directorio)", () => {
  it("lista los locales activos, primero los que reciben pedidos", async () => {
    await createCommerceWithOwner({ slug: "abacaxi", name: "Abacaxi Lanches", override: { mode: "closed", until: null } });
    await createCommerceWithOwner({ slug: "zebra", name: "Zebra Pizzas" });
    const { commerce: suspended } = await createCommerceWithOwner({ slug: "suspensa", name: "Loja Suspensa" });
    await Commerce.updateOne({ _id: suspended._id }, { status: "suspended" });

    const res = await request(app).get("/api/public/stores");

    expect(res.status).toBe(200);
    expect(res.body.stores.map((store) => [store.slug, store.isOpen])).toEqual([
      ["burger-demo", true],
      ["zebra", true],
      ["abacaxi", false],
    ]);
    expect(res.body.stores[2].opening.status).toBe("closed");
  });

  it("solo lo de la tarjeta: sin WhatsApp, Pix ni datos internos", async () => {
    const res = await request(app).get("/api/public/stores");
    for (const key of ["whatsapp", "pixKey", "orderCounter", "override", "hours", "_id", "deliveryZones"]) {
      expect(containsKey(res.body, key), key).toBe(false);
    }
    // El estado interno (active/suspended) no sale; el de apertura sí, dentro de opening.
    expect(res.body.stores[0].status).toBeUndefined();
  });
});

describe("GET /api/public/stores/:slug", () => {
  it("devuelve el local y el menú completo en una sola respuesta", async () => {
    const res = await request(app).get("/api/public/stores/burger-demo");

    expect(res.status).toBe(200);
    expect(res.body.store).toMatchObject({ name: "Loja burger-demo", slug: "burger-demo", isOpen: true, opening: { status: "open" }, pixKey: "loja@pix.com" });
    expect(res.body.categories.map((c) => c.name)).toEqual(["Lanches", "Bebidas"]);
    expect(res.body.categories[0].products.map((p) => p.name)).toEqual(["X-Burger", "X-Salada"]);
    expect(res.body.categories[0].products[0].optionGroups).toEqual([String(menu.ponto._id), String(menu.adicionais._id)]);
    expect(res.body.optionGroups.map((g) => g.name).sort()).toEqual(["Adicionais", "Ponto da carne"]);
  });

  it("completa los campos que no tienen los documentos creados antes de que existieran", async () => {
    // Como los de un local cargado con una versión anterior: sin tags, pricing, maxQuantity ni schedule.
    await Product.collection.updateMany({ commerce: commerce._id }, { $unset: { tags: "" } });
    await OptionGroup.collection.updateMany({ commerce: commerce._id }, { $unset: { pricing: "", "options.$[].maxQuantity": "" } });
    await Category.collection.updateMany({ commerce: commerce._id }, { $unset: { schedule: "" } });

    const res = await request(app).get("/api/public/stores/burger-demo");

    expect(res.status).toBe(200);
    expect(res.body.categories[0]).toMatchObject({ schedule: null });
    expect(res.body.categories[0].products[0].tags).toEqual([]);
    const ponto = res.body.optionGroups.find((group) => group.name === "Ponto da carne");
    expect(ponto.pricing).toBe("sum");
    expect(ponto.options.every((option) => option.maxQuantity === 1)).toBe(true);
  });

  it("no expone campos internos", async () => {
    const res = await request(app).get("/api/public/stores/burger-demo");
    for (const key of ["orderCounter", "commerce", "createdAt", "passwordHash", "position", "override"]) {
      expect(containsKey(res.body, key), key).toBe(false);
    }
    // El estado interno (active/suspended) no sale; el de apertura sí, dentro de opening.
    expect(res.body.store.status).toBeUndefined();
  });

  it("muestra agotados marcados y esconde categorías inactivas o vacías", async () => {
    await Product.updateOne({ _id: menu.xSalada._id }, { available: false });
    await OptionGroup.updateOne({ _id: menu.adicionais._id, "options.name": "Bacon" }, { "options.$.available": false });
    await Category.updateOne({ _id: menu.bebidas._id }, { active: false });
    await Category.create({ commerce: commerce._id, name: "Vazia" });

    const res = await request(app).get("/api/public/stores/burger-demo");
    expect(res.body.categories.map((c) => c.name)).toEqual(["Lanches"]);
    expect(res.body.categories[0].products[1]).toMatchObject({ name: "X-Salada", available: false });
    const adicionais = res.body.optionGroups.find((g) => g.name === "Adicionais");
    expect(adicionais.options[0]).toMatchObject({ name: "Bacon", available: false });
  });

  it("un local cerrado muestra el menú con isOpen false", async () => {
    await Commerce.updateOne({ _id: commerce._id }, { override: { mode: "closed", until: null } });
    const res = await request(app).get("/api/public/stores/burger-demo");
    expect(res.status).toBe(200);
    expect(res.body.store.isOpen).toBe(false);
  });

  it("un local suspendido responde igual que uno que no existe", async () => {
    await Commerce.updateOne({ _id: commerce._id }, { status: "suspended" });
    const suspended = await request(app).get("/api/public/stores/burger-demo");
    const missing = await request(app).get("/api/public/stores/no-existe");

    expect(suspended.status).toBe(404);
    expect(suspended.body).toEqual(missing.body);
    expect(missing.body.error.code).toBe("STORE_NOT_FOUND");
  });

  it("encuentra el local aunque el slug venga con mayúsculas", async () => {
    expect((await request(app).get("/api/public/stores/Burger-Demo")).status).toBe(200);
  });
});

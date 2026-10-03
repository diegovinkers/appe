import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Commerce from "../../src/models/commerce.model.js";
import Product from "../../src/models/product.model.js";
import { containsKey, createCommerceWithOwner, createMenu, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

// Dos locales: A es el del dueño con sesión; B es de otro dueño.
let a, b, owner, menuA, menuB;
beforeEach(async () => {
  a = await createCommerceWithOwner({ slug: "loja-a" });
  b = await createCommerceWithOwner({ slug: "loja-b" });
  menuA = await createMenu(a.commerce);
  menuB = await createMenu(b.commerce);
  owner = await loginAs(app, a.owner.email);
});

describe("permisos de /api/owner", () => {
  it("sin sesión da 401", async () => {
    expect((await request(app).get("/api/owner/store")).status).toBe(401);
  });

  it("un superadmin recibe 403", async () => {
    await createSuperadmin();
    const root = await loginAs(app, "root@test.local");
    expect((await root.get("/api/owner/store")).status).toBe(403);
  });

  it("con el local suspendido el dueño recibe 403 COMMERCE_SUSPENDED", async () => {
    await Commerce.updateOne({ _id: a.commerce._id }, { status: "suspended" });
    const res = await owner.get("/api/owner/categories");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("COMMERCE_SUSPENDED");
  });
});

describe("/api/owner/store", () => {
  it("devuelve el local, su estado de apertura y el link del menú, sin campos internos", async () => {
    const res = await owner.get("/api/owner/store");
    expect(res.status).toBe(200);
    expect(res.body.store).toMatchObject({ slug: "loja-a" });
    expect(res.body.opening).toMatchObject({ status: "open", acceptingOrders: true, source: "override" });
    expect(res.body.storeUrl).toBe("http://localhost:5173/loja-a");
    expect(containsKey(res.body, "orderCounter")).toBe(false);
  });

  it("actualiza datos, normaliza el WhatsApp e ignora slug, estado y apertura", async () => {
    const res = await owner.patch("/api/owner/store").send({
      name: "Loja Nova",
      whatsapp: "(55) 98888-7777",
      primaryColor: "#112233",
      override: { mode: "closed" },
      slug: "hackeado",
      status: "suspended",
    });
    expect(res.status).toBe(200);
    expect(res.body.store).toMatchObject({
      name: "Loja Nova",
      whatsapp: "+5555988887777",
      primaryColor: "#112233",
      override: { mode: "open", until: null },
      slug: "loja-a",
      status: "active",
    });
  });

  it("cambia una sola forma de entrega sin tocar la otra", async () => {
    const res = await owner.patch("/api/owner/store").send({ fulfillment: { pickup: false } });
    expect(res.body.store.fulfillment).toEqual({ delivery: true, pickup: false });
  });

  it("exige al menos una forma de entrega", async () => {
    const res = await owner.patch("/api/owner/store").send({ fulfillment: { delivery: false, pickup: false } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_FULFILLMENT");
  });

  it("para aceptar Pix exige la chave", async () => {
    const without = await owner.patch("/api/owner/store").send({ paymentMethods: ["cash", "pix"] });
    expect(without.status).toBe(400);
    expect(without.body.error.code).toBe("PIX_KEY_REQUIRED");

    const withKey = await owner.patch("/api/owner/store").send({ paymentMethods: ["pix"], pixKey: "loja@pix.com" });
    expect(withKey.status).toBe(200);
    expect(withKey.body.store.paymentMethods).toEqual(["pix"]);
  });

  it.each([
    ["color inválido", { primaryColor: "rojo" }],
    ["tarifa con decimales", { deliveryFeeCents: 5.5 }],
    ["tarifa negativa", { deliveryFeeCents: -100 }],
    ["logo que no es URL", { logoUrl: "javascript:alert(1)" }],
    ["forma de pago desconocida", { paymentMethods: ["bitcoin"] }],
    ["body vacío", {}],
  ])("rechaza con 400: %s", async (_caso, body) => {
    const res = await owner.patch("/api/owner/store").send(body);
    expect(res.status).toBe(400);
  });
});

describe("/api/owner/categories", () => {
  it("lista solo las del local, en orden", async () => {
    const res = await owner.get("/api/owner/categories");
    expect(res.body.categories.map((c) => c.name)).toEqual(["Lanches", "Bebidas"]);
    expect(res.body.categories.every((c) => c.commerce === String(a.commerce._id))).toBe(true);
  });

  it("crea al final, edita y reordena", async () => {
    const created = await owner.post("/api/owner/categories").send({ name: "Sobremesas" });
    expect(created.status).toBe(201);
    expect(created.body.category.position).toBe(2);

    const edited = await owner.patch(`/api/owner/categories/${created.body.category._id}`).send({ active: false });
    expect(edited.body.category.active).toBe(false);

    const ids = [created.body.category._id, String(menuA.bebidas._id), String(menuA.lanches._id)];
    const reordered = await owner.patch("/api/owner/categories/reorder").send({ ids });
    expect(reordered.body.categories.map((c) => c._id)).toEqual(ids);
  });

  it("no deja borrar una categoría con productos", async () => {
    const res = await owner.delete(`/api/owner/categories/${menuA.bebidas._id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_NOT_EMPTY");
  });

  it("borra una categoría vacía", async () => {
    await Product.deleteMany({ category: menuA.bebidas._id });
    expect((await owner.delete(`/api/owner/categories/${menuA.bebidas._id}`)).status).toBe(204);
  });

  it("aislamiento: no puede editar, borrar ni reordenar las de otro local", async () => {
    const other = menuB.lanches._id;
    expect((await owner.patch(`/api/owner/categories/${other}`).send({ name: "x" })).status).toBe(404);
    expect((await owner.delete(`/api/owner/categories/${other}`)).status).toBe(404);
    expect((await owner.patch("/api/owner/categories/reorder").send({ ids: [String(other)] })).status).toBe(404);
  });
});

describe("/api/owner/products", () => {
  it("crea un producto con categoría y grupos del local", async () => {
    const res = await owner.post("/api/owner/products").send({
      category: String(menuA.lanches._id),
      name: "X-Tudo",
      priceCents: 3500,
      optionGroups: [String(menuA.ponto._id)],
    });
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ name: "X-Tudo", priceCents: 3500, position: 2, available: true });
  });

  it("rechaza categoría o grupo de otro local", async () => {
    const otherCategory = await owner.post("/api/owner/products").send({
      category: String(menuB.lanches._id),
      name: "X",
      priceCents: 100,
    });
    expect(otherCategory.status).toBe(400);
    expect(otherCategory.body.error.code).toBe("INVALID_CATEGORY");

    const otherGroup = await owner.patch(`/api/owner/products/${menuA.xBurger._id}`).send({
      optionGroups: [String(menuB.adicionais._id)],
    });
    expect(otherGroup.status).toBe(400);
    expect(otherGroup.body.error.code).toBe("INVALID_OPTION_GROUP");
  });

  it.each([
    ["precio con decimales", { priceCents: 25.5 }],
    ["precio negativo", { priceCents: -1 }],
    ["imagen que no es URL", { imageUrl: "no-es-url" }],
    ["id de categoría inválido", { category: "abc" }],
  ])("rechaza con 400: %s", async (_caso, body) => {
    const res = await owner.patch(`/api/owner/products/${menuA.xBurger._id}`).send(body);
    expect(res.status).toBe(400);
  });

  it("marca agotado con un PATCH de solo available", async () => {
    const res = await owner.patch(`/api/owner/products/${menuA.coca._id}`).send({ available: false });
    expect(res.status).toBe(200);
    expect(res.body.product.available).toBe(false);
  });

  it("filtra por categoría y reordena dentro de ella", async () => {
    const list = await owner.get(`/api/owner/products?category=${menuA.lanches._id}`);
    expect(list.body.products.map((p) => p.name)).toEqual(["X-Burger", "X-Salada"]);

    const ids = [String(menuA.xSalada._id), String(menuA.xBurger._id)];
    const res = await owner
      .patch("/api/owner/products/reorder")
      .send({ category: String(menuA.lanches._id), ids });
    expect(res.body.products.map((p) => p._id)).toEqual(ids);
  });

  it("aislamiento: 404 al leer, editar o borrar un producto de otro local", async () => {
    const other = menuB.xBurger._id;
    expect((await owner.get(`/api/owner/products/${other}`)).status).toBe(404);
    expect((await owner.patch(`/api/owner/products/${other}`).send({ available: false })).status).toBe(404);
    expect((await owner.delete(`/api/owner/products/${other}`)).status).toBe(404);
    expect((await Product.findById(other)).available).toBe(true);
  });

  it("borra un producto propio", async () => {
    expect((await owner.delete(`/api/owner/products/${menuA.coca._id}`)).status).toBe(204);
    expect(await Product.findById(menuA.coca._id)).toBeNull();
  });
});

describe("/api/owner/option-groups", () => {
  it("crea un grupo y valida mínimo y máximo", async () => {
    const ok = await owner.post("/api/owner/option-groups").send({
      name: "Molhos",
      maxSelect: 2,
      options: [{ name: "Barbecue" }, { name: "Maionese verde", priceCents: 150 }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.optionGroup).toMatchObject({ minSelect: 0, maxSelect: 2 });

    const minOverMax = await owner
      .post("/api/owner/option-groups")
      .send({ name: "X", minSelect: 2, maxSelect: 1, options: [{ name: "a" }, { name: "b" }] });
    expect(minOverMax.body.error.code).toBe("INVALID_LIMITS");

    const maxOverOptions = await owner
      .post("/api/owner/option-groups")
      .send({ name: "X", maxSelect: 3, options: [{ name: "a" }] });
    expect(maxOverOptions.body.error.code).toBe("INVALID_LIMITS");
  });

  it("al editar las opciones conserva los ids de las que se mantienen", async () => {
    const [bacon] = menuA.adicionais.options;
    const res = await owner.patch(`/api/owner/option-groups/${menuA.adicionais._id}`).send({
      maxSelect: 2,
      options: [{ _id: String(bacon._id), name: "Bacon crocante", priceCents: 500 }, { name: "Picles" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.optionGroup.options[0]).toMatchObject({ _id: String(bacon._id), name: "Bacon crocante", priceCents: 500 });
    expect(res.body.optionGroup.options).toHaveLength(2);
  });

  it("rechaza ids de opciones que no son del grupo", async () => {
    const foreign = menuB.adicionais.options[0]._id;
    const res = await owner.patch(`/api/owner/option-groups/${menuA.adicionais._id}`).send({
      maxSelect: 1,
      options: [{ _id: String(foreign), name: "Bacon" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_OPTION");
  });

  it("marca una opción agotada", async () => {
    const bacon = menuA.adicionais.options[0];
    const res = await owner
      .patch(`/api/owner/option-groups/${menuA.adicionais._id}/options/${bacon._id}`)
      .send({ available: false });
    expect(res.status).toBe(200);
    expect(res.body.optionGroup.options[0].available).toBe(false);
  });

  it("borrar un grupo lo saca de los productos", async () => {
    expect((await owner.delete(`/api/owner/option-groups/${menuA.ponto._id}`)).status).toBe(204);
    const burger = await Product.findById(menuA.xBurger._id);
    expect(burger.optionGroups.map(String)).toEqual([String(menuA.adicionais._id)]);
  });

  it("aislamiento: 404 con los grupos y opciones de otro local", async () => {
    const group = menuB.adicionais;
    expect((await owner.get(`/api/owner/option-groups/${group._id}`)).status).toBe(404);
    expect((await owner.patch(`/api/owner/option-groups/${group._id}`).send({ name: "x" })).status).toBe(404);
    expect((await owner.delete(`/api/owner/option-groups/${group._id}`)).status).toBe(404);
    const option = group.options[0]._id;
    expect(
      (await owner.patch(`/api/owner/option-groups/${group._id}/options/${option}`).send({ available: false })).status
    ).toBe(404);
    expect((await owner.get("/api/owner/option-groups")).body.optionGroups).toHaveLength(2);
  });
});

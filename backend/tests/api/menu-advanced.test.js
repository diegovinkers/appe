import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { signParams } from "../../src/lib/cloudinary.js";
import AuditLog from "../../src/models/auditLog.model.js";
import Category from "../../src/models/category.model.js";
import OptionGroup from "../../src/models/optionGroup.model.js";
import Product from "../../src/models/product.model.js";
import { createCommerceWithOwner, createMenu, createStaff, loginAs } from "../helpers.js";

const app = createApp();

let commerce, owner, menu;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a" }));
  menu = await createMenu(commerce);
  owner = await loginAs(app, "dono-loja-a@test.local");
});
afterEach(() => vi.useRealTimers());

const pick = (group, name, quantity) => ({
  groupId: String(group._id),
  optionId: String(group.options.find((option) => option.name === name)._id),
  ...(quantity ? { quantity } : {}),
});
const order = (items, changes = {}) =>
  request(app)
    .post("/api/public/stores/loja-a/orders")
    .send({
      clientOrderId: randomUUID(),
      customer: { name: "Maria", phone: "55 99999-1234" },
      fulfillment: "pickup",
      paymentMethod: "cash",
      items,
      ...changes,
    });
const publicMenu = (query = "") => request(app).get(`/api/public/stores/loja-a${query}`);
const findPublic = (body, id) => body.categories.flatMap((c) => c.products).find((p) => p._id === String(id));
const imageIn = (folder) =>
  `https://res.cloudinary.com/nube-de-prueba/image/upload/v1/app-pedidos/${commerce._id}/${folder}/foto.jpg`;

describe("imágenes", () => {
  it("firma la subida en la carpeta del local", async () => {
    const res = await owner.post("/api/owner/uploads/signature").send({ kind: "product" });
    expect(res.status).toBe(200);
    const { signature, uploadUrl, apiKey, ...params } = res.body;
    expect(uploadUrl).toBe("https://api.cloudinary.com/v1_1/nube-de-prueba/image/upload");
    expect(apiKey).toBe("123456789012345");
    expect(params.folder).toBe(`app-pedidos/${commerce._id}/product`);
    const { cloudName, ...signed } = params;
    expect(signature).toBe(signParams(signed, "falso"));
  });

  it("sin Cloudinary configurado responde 503 y acepta URLs externas", async () => {
    const original = config.CLOUDINARY_URL;
    config.CLOUDINARY_URL = undefined;
    try {
      const res = await owner.post("/api/owner/uploads/signature").send({ kind: "logo" });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("FEATURE_DISABLED");
      const external = await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ imageUrl: "https://example.com/coca.jpg" });
      expect(external.status).toBe(200);
    } finally {
      config.CLOUDINARY_URL = original;
    }
  });

  it("solo acepta imágenes del local en productos, logo y portada", async () => {
    expect((await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ imageUrl: imageIn("product") })).status).toBe(200);
    expect((await owner.patch("/api/owner/store").send({ logoUrl: imageIn("logo"), coverUrl: imageIn("cover") })).status).toBe(200);

    const other = imageIn("product").replace(String(commerce._id), "64b000000000000000000009");
    for (const res of [
      await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ imageUrl: other }),
      await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ imageUrl: "https://example.com/coca.jpg" }),
      await owner.patch("/api/owner/store").send({ logoUrl: "https://example.com/logo.png" }),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_IMAGE_URL");
    }
  });

  it("un empleado no puede subir imágenes", async () => {
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-a@test.local");
    expect((await staff.post("/api/owner/uploads/signature").send({ kind: "product" })).status).toBe(403);
  });
});

describe("promociones, etiquetas y destacados", () => {
  it("el menú muestra el precio promocional y el pedido lo cobra", async () => {
    const res = await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ promoPriceCents: 450, tags: ["new"], featured: true });
    expect(res.status).toBe(200);

    const { body } = await publicMenu();
    expect(findPublic(body, menu.coca._id)).toMatchObject({ priceCents: 600, promoPriceCents: 450, fromPriceCents: 450, tags: ["new"] });
    expect(body.featuredProductIds).toEqual([String(menu.coca._id)]);

    const created = await order([{ productId: String(menu.coca._id), quantity: 2 }]);
    expect(created.body.order).toMatchObject({ subtotalCents: 900, items: [{ unitPriceCents: 450 }] });
  });

  it("una promoción que todavía no empezó no se aplica", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ promoPriceCents: 450, promoStartsAt: tomorrow });
    expect(findPublic((await publicMenu()).body, menu.coca._id).promoPriceCents).toBeNull();
    expect((await order([{ productId: String(menu.coca._id), quantity: 1 }])).body.order.subtotalCents).toBe(600);
  });

  it("rechaza promociones que no son más baratas o terminan antes de empezar", async () => {
    const cara = await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ promoPriceCents: 700 });
    expect(cara.body.error.code).toBe("INVALID_PROMO");
    const alReves = await owner.patch(`/api/owner/products/${menu.coca._id}`).send({
      promoPriceCents: 500,
      promoStartsAt: "2026-10-10T00:00:00Z",
      promoEndsAt: "2026-10-01T00:00:00Z",
    });
    expect(alReves.body.error.code).toBe("INVALID_PROMO");
  });

  it("la auditoría registra los cambios de promoción", async () => {
    await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ promoPriceCents: 450 });
    const entry = await AuditLog.findOne({ action: "product.price_changed" }).lean();
    expect(entry.changes).toEqual({ name: "Coca-Cola 350ml", promoPriceCents: [null, 450] });
  });
});

describe("stock", () => {
  beforeEach(async () => {
    await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ trackStock: true, stock: 3 });
  });

  it("descuenta con cada pedido y rechaza cuando no alcanza", async () => {
    // El mismo producto en dos líneas cuenta junto.
    const first = await order([
      { productId: String(menu.coca._id), quantity: 1 },
      { productId: String(menu.coca._id), quantity: 1 },
    ]);
    expect(first.status).toBe(201);
    expect((await Product.findById(menu.coca._id)).stock).toBe(1);

    const tooMany = await order([{ productId: String(menu.coca._id), quantity: 2 }]);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatchObject({ code: "OUT_OF_STOCK", details: { available: 1 } });
    expect((await Product.findById(menu.coca._id)).stock).toBe(1);
  });

  it("en 0 queda agotado solo, y cancelar devuelve el stock", async () => {
    const created = await order([{ productId: String(menu.coca._id), quantity: 3 }]);
    expect(findPublic((await publicMenu()).body, menu.coca._id).available).toBe(false);

    const res = await owner.patch(`/api/owner/orders/${created.body.order._id}/status`).send({ status: "cancelled", reason: "Teste" });
    expect(res.status).toBe(200);
    expect((await Product.findById(menu.coca._id)).stock).toBe(3);
    expect(findPublic((await publicMenu()).body, menu.coca._id).available).toBe(true);
  });
});

describe("horario por categoría", () => {
  beforeEach(async () => {
    await owner.patch(`/api/owner/categories/${menu.bebidas._id}`).send({ schedule: { from: "07:00", to: "11:00" } });
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  it("fuera de horario se muestra pero no se puede pedir", async () => {
    vi.setSystemTime(new Date("2026-09-25T15:00:00Z")); // 12:00 en Brasil
    const bebidas = (await publicMenu()).body.categories.find((c) => c.name === "Bebidas");
    expect(bebidas).toMatchObject({ availableNow: false, schedule: { days: [], from: "07:00", to: "11:00" } });

    const res = await order([{ productId: String(menu.coca._id), quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_NOT_AVAILABLE_NOW");
  });

  it("dentro del horario se puede pedir", async () => {
    vi.setSystemTime(new Date("2026-09-25T11:00:00Z")); // 08:00
    expect((await order([{ productId: String(menu.coca._id), quantity: 1 }])).status).toBe(201);
  });
});

describe("cantidades por opción y reglas de precio", () => {
  it("2x bacon suma dos veces y cuenta dos unidades para el máximo", async () => {
    const [bacon] = menu.adicionais.options;
    await owner.patch(`/api/owner/option-groups/${menu.adicionais._id}`).send({
      options: menu.adicionais.options.map((o) => ({ _id: String(o._id), name: o.name, priceCents: o.priceCents, maxQuantity: o._id.equals(bacon._id) ? 2 : 1 })),
    });
    const group = await OptionGroup.findById(menu.adicionais._id);
    const burger = String(menu.xBurger._id);

    const ok = await order([{ productId: burger, quantity: 1, options: [pick(menu.ponto, "Ao ponto"), pick(group, "Bacon", 2)] }]);
    expect(ok.status).toBe(201);
    expect(ok.body.order.items[0]).toMatchObject({ optionsCents: 800, totalCents: 3300 });
    expect(ok.body.whatsapp.message).toContain("Adicionais: 2x Bacon (+R$ 8,00)");

    const tooMany = await order([{ productId: burger, quantity: 1, options: [pick(menu.ponto, "Ao ponto"), pick(group, "Bacon", 3)] }]);
    expect(tooMany.body.error.code).toBe("INVALID_OPTION");

    // Máximo 3 unidades en Adicionais: 2 bacon + cheddar + ovo = 4.
    const overMax = await order([
      { productId: burger, quantity: 1, options: [pick(menu.ponto, "Ao ponto"), pick(group, "Bacon", 2), pick(group, "Cheddar"), pick(group, "Ovo")] },
    ]);
    expect(overMax.body.error.code).toBe("OPTION_SELECTION_INVALID");
  });

  it("pizza meio a meio: vale el sabor más caro, o el promedio", async () => {
    const sabores = (
      await owner.post("/api/owner/option-groups").send({
        name: "Sabores",
        minSelect: 1,
        maxSelect: 2,
        pricing: "max",
        options: [{ name: "Calabresa", priceCents: 3000 }, { name: "Portuguesa", priceCents: 3600 }],
      })
    ).body.optionGroup;
    const pizza = (
      await owner.post("/api/owner/products").send({ category: String(menu.lanches._id), name: "Pizza grande", priceCents: 0, optionGroups: [sabores._id] })
    ).body.product;

    expect(findPublic((await publicMenu()).body, pizza._id).fromPriceCents).toBe(3000);
    const meioAMeio = await order([{ productId: pizza._id, quantity: 1, options: [pick(sabores, "Calabresa"), pick(sabores, "Portuguesa")] }]);
    expect(meioAMeio.body.order.subtotalCents).toBe(3600);
    expect(meioAMeio.body.whatsapp.message).toContain("Sabores: Calabresa, Portuguesa");

    await owner.patch(`/api/owner/option-groups/${sabores._id}`).send({ pricing: "average" });
    const promedio = await order([{ productId: pizza._id, quantity: 1, options: [pick(sabores, "Calabresa"), pick(sabores, "Portuguesa")] }]);
    expect(promedio.body.order.subtotalCents).toBe(3300);
  });

  it("un producto con un grupo obligatorio todo agotado aparece no disponible", async () => {
    for (const option of menu.ponto.options) {
      await owner.patch(`/api/owner/option-groups/${menu.ponto._id}/options/${option._id}`).send({ available: false });
    }
    const burger = findPublic((await publicMenu()).body, menu.xBurger._id);
    expect(burger).toMatchObject({ available: false, fromPriceCents: null });
  });
});

describe("duplicar producto", () => {
  it("crea una copia al final de la categoría, sin stock", async () => {
    await owner.patch(`/api/owner/products/${menu.xBurger._id}`).send({ trackStock: true, stock: 10 });
    const res = await owner.post(`/api/owner/products/${menu.xBurger._id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ name: "X-Burger (cópia)", priceCents: 2500, position: 2, stock: 0, trackStock: true });
    expect(res.body.product.optionGroups).toEqual([String(menu.ponto._id), String(menu.adicionais._id)]);
  });

  it("no duplica productos de otro local", async () => {
    const other = await createCommerceWithOwner({ slug: "loja-b" });
    const otherMenu = await createMenu(other.commerce);
    expect((await owner.post(`/api/owner/products/${otherMenu.coca._id}/duplicate`)).status).toBe(404);
  });
});

describe("planilla del menú (CSV)", () => {
  it("exporta el menú como CSV para Excel", async () => {
    const res = await owner.get("/api/owner/menu/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain('filename="cardapio-loja-a.csv"');
    const lines = res.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("categoria;produto;descricao;preco;preco_promocional;disponivel;destaque;grupos;etiquetas");
    expect(lines).toContain("Lanches;X-Burger;;25,00;;sim;não;Ponto da carne | Adicionais;");
  });

  const csv = "categoria;produto;preco;grupos\nLanches;X-Burger;27,50;Ponto da carne\nSobremesas;Pudim;9,90;\nSobremesas;Brownie;12;";

  it("con dryRun muestra qué haría sin cambiar nada", async () => {
    const res = await owner.post("/api/owner/menu/import").send({ csv });
    expect(res.body).toEqual({
      dryRun: true,
      summary: { categoriesCreated: 1, productsCreated: 2, productsUpdated: 1 },
      errors: [],
    });
    expect(await Category.countDocuments({ commerce: commerce._id })).toBe(2);
  });

  it("aplica todo junto: categorías nuevas, productos nuevos y precios actualizados", async () => {
    const res = await owner.post("/api/owner/menu/import").send({ csv, dryRun: false });
    expect(res.status).toBe(200);
    expect((await Product.findById(menu.xBurger._id)).priceCents).toBe(2750);
    const sobremesas = await Category.findOne({ commerce: commerce._id, name: "Sobremesas" });
    expect(sobremesas.position).toBe(2);
    const doces = await Product.find({ category: sobremesas._id }).sort({ position: 1 });
    expect(doces.map((p) => [p.name, p.priceCents, p.position])).toEqual([
      ["Pudim", 990, 0],
      ["Brownie", 1200, 1],
    ]);
    expect(await AuditLog.exists({ action: "menu.imported" })).toBeTruthy();
  });

  it("con errores no aplica nada y dice en qué línea", async () => {
    const res = await owner
      .post("/api/owner/menu/import")
      .send({ csv: "categoria;produto;preco\nSobremesas;Pudim;9,90\nSobremesas;Torta;caro", dryRun: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "IMPORT_HAS_ERRORS", details: [{ line: 3 }] });
    expect(await Category.exists({ name: "Sobremesas" })).toBeNull();
  });

  it("un empleado puede exportar pero no importar", async () => {
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-a@test.local");
    expect((await staff.get("/api/owner/menu/export")).status).toBe(200);
    expect((await staff.post("/api/owner/menu/import").send({ csv })).status).toBe(403);
  });
});

describe("textos en español", () => {
  it("con ?lang=es muestra lo traducido y cae al portugués en lo que falta", async () => {
    await owner.patch("/api/owner/store").send({ about: "Hambúrgueres artesanais", translations: { es: { about: "Hamburguesas artesanales" } } });
    await owner.patch(`/api/owner/categories/${menu.bebidas._id}`).send({ translations: { es: { name: "Bebidas frías" } } });
    await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ description: "Lata gelada", translations: { es: { description: "Lata helada" } } });
    await owner.patch(`/api/owner/option-groups/${menu.ponto._id}`).send({ translations: { es: { name: "Punto de la carne" } } });

    const es = (await publicMenu("?lang=es")).body;
    expect(es.store.about).toBe("Hamburguesas artesanales");
    expect(es.categories.map((c) => c.name)).toEqual(["Lanches", "Bebidas frías"]);
    expect(findPublic(es, menu.coca._id)).toMatchObject({ name: "Coca-Cola 350ml", description: "Lata helada" });
    expect(es.optionGroups.find((g) => g._id === String(menu.ponto._id)).name).toBe("Punto de la carne");

    const pt = (await publicMenu()).body;
    expect(pt.store.about).toBe("Hambúrgueres artesanais");
    expect((await publicMenu("?lang=fr")).status).toBe(400);
  });

  it("guardar una traducción no borra las otras", async () => {
    await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ translations: { es: { name: "Coca", description: "Helada" } } });
    const res = await owner.patch(`/api/owner/products/${menu.coca._id}`).send({ translations: { es: { name: "Coca-Cola" } } });
    expect(res.body.product.translations.es).toEqual({ name: "Coca-Cola", description: "Helada" });
  });
});

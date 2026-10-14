import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import OptionGroup from "../../src/models/optionGroup.model.js";
import Product from "../../src/models/product.model.js";
import { createCommerceWithOwner, createMenu, createStaff, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

let commerce, menu, owner;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a" }));
  menu = await createMenu(commerce);
  // El mismo ingrediente en otro grupo, con otra forma de escribirlo: "Queijo" y "queijo ".
  await OptionGroup.create({ commerce: commerce._id, name: "Queijos", maxSelect: 1, options: [{ name: "Cheddar " }, { name: "Prato" }] });
  owner = await loginAs(app, "dono-loja-a@test.local");
});

const option = (body, name) => body.options.find((entry) => entry.key === name);

describe("disponibilidade", () => {
  it("junta las opciones por nombre y lista los productos por categoría", async () => {
    await Product.updateOne({ _id: menu.coca._id }, { $set: { trackStock: true, stock: 0 } });
    const res = await owner.get("/api/owner/availability");
    expect(res.status).toBe(200);
    expect(res.body.products.map((product) => product.name)).toEqual(["X-Burger", "X-Salada", "Coca-Cola 350ml"]);
    expect(res.body.products[2]).toMatchObject({ category: "Bebidas", available: true, soldOut: true });
    const cheddar = option(res.body, "cheddar");
    expect(cheddar.groups.map((group) => group.group).sort()).toEqual(["Adicionais", "Queijos"]);
    expect(cheddar).toMatchObject({ available: true, unavailable: 0 });
  });

  it("agota una opción en todos sus grupos y la vuelve a ofrecer", async () => {
    const res = await owner.patch("/api/owner/availability/options").send({ name: "CHEDDAR", available: false });
    expect(res.status).toBe(200);
    expect(option(res.body, "cheddar")).toMatchObject({ available: false, unavailable: 2 });
    const groups = await OptionGroup.find({ commerce: commerce._id }).lean();
    const cheddars = groups.flatMap((group) => group.options).filter((entry) => entry.name.trim() === "Cheddar");
    expect(cheddars.map((entry) => entry.available)).toEqual([false, false]);
    // Las otras opciones de esos grupos no se tocan.
    expect(groups.flatMap((group) => group.options).filter((entry) => entry.name !== "Cheddar" && entry.name !== "Cheddar ").every((entry) => entry.available)).toBe(true);

    const back = await owner.patch("/api/owner/availability/options").send({ name: "cheddar", available: true });
    expect(option(back.body, "cheddar")).toMatchObject({ available: true, unavailable: 0 });
  });

  it("reactivar todo vuelve a ofrecer productos y opciones, sin tocar el stock", async () => {
    await Product.updateOne({ _id: menu.xSalada._id }, { $set: { available: false } });
    await Product.updateOne({ _id: menu.coca._id }, { $set: { trackStock: true, stock: 0 } });
    await owner.patch("/api/owner/availability/options").send({ name: "bacon", available: false });
    const res = await owner.post("/api/owner/availability/restore");
    expect(res.status).toBe(200);
    expect(res.body.products.every((product) => product.available)).toBe(true);
    expect(res.body.options.every((entry) => entry.available)).toBe(true);
    expect((await Product.findById(menu.coca._id)).stock).toBe(0);
  });

  it("el empleado puede agotar y reactivar", async () => {
    const staff = await createStaff(commerce);
    const employee = await loginAs(app, staff.email);
    expect((await employee.get("/api/owner/availability")).status).toBe(200);
    expect((await employee.patch("/api/owner/availability/options").send({ name: "ovo", available: false })).status).toBe(200);
    expect((await employee.post("/api/owner/availability/restore")).status).toBe(200);
  });

  it("sin sesión 401, superadmin 403, entrada inválida 400 y nombre que no existe 404", async () => {
    expect((await request(app).get("/api/owner/availability")).status).toBe(401);
    await createSuperadmin();
    const root = await loginAs(app, "root@test.local");
    expect((await root.get("/api/owner/availability")).status).toBe(403);
    expect((await owner.patch("/api/owner/availability/options").send({ name: "", available: false })).status).toBe(400);
    expect((await owner.patch("/api/owner/availability/options").send({ name: "bacon" })).status).toBe(400);
    const missing = await owner.patch("/api/owner/availability/options").send({ name: "Picanha", available: false });
    expect(missing.status).toBe(404);
  });

  it("no ve ni toca las opciones de otro local", async () => {
    const { commerce: other } = await createCommerceWithOwner({ slug: "loja-b" });
    await OptionGroup.create({ commerce: other._id, name: "Extras", options: [{ name: "Bacon" }, { name: "Picanha" }] });
    await Product.create({ commerce: other._id, category: menu.lanches._id, name: "Produto da outra loja", priceCents: 100, available: false });

    const view = await owner.get("/api/owner/availability");
    expect(view.body.products.map((product) => product.name)).not.toContain("Produto da outra loja");
    expect(option(view.body, "picanha")).toBeUndefined();
    expect(option(view.body, "bacon").groups).toHaveLength(1);

    expect((await owner.patch("/api/owner/availability/options").send({ name: "Picanha", available: false })).status).toBe(404);
    await owner.patch("/api/owner/availability/options").send({ name: "Bacon", available: false });
    await owner.post("/api/owner/availability/restore");
    const otherGroup = await OptionGroup.findOne({ commerce: other._id }).lean();
    expect(otherGroup.options.every((entry) => entry.available)).toBe(true);
    expect((await Product.findOne({ commerce: other._id })).available).toBe(false);
  });
});

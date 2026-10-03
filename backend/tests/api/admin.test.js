import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import Commerce from "../../src/models/commerce.model.js";
import User from "../../src/models/user.model.js";
import { PASSWORD, containsKey, createCommerceWithOwner, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

const newCommerceBody = (overrides = {}) => ({
  commerce: { name: "Burger Demo", slug: "burger-demo", whatsapp: "55 99999-8888", ...overrides.commerce },
  owner: { name: "Ana", email: "ana@test.local", password: "senha-da-ana-1", ...overrides.owner },
});

let root;
beforeEach(async () => {
  await createSuperadmin();
  root = await loginAs(app, "root@test.local");
});

describe("permisos de /api/admin", () => {
  it("sin sesión da 401", async () => {
    expect((await request(app).get("/api/admin/commerces")).status).toBe(401);
  });

  it("un dueño recibe 403", async () => {
    const { owner } = await createCommerceWithOwner();
    const agent = await loginAs(app, owner.email);
    const res = await agent.get("/api/admin/commerces");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("POST /api/admin/commerces", () => {
  it("crea el local y su dueño, que puede iniciar sesión", async () => {
    const res = await root.post("/api/admin/commerces").send(newCommerceBody());

    expect(res.status).toBe(201);
    expect(res.body.commerce).toMatchObject({ slug: "burger-demo", status: "active", override: null, whatsapp: "+5555999998888" });
    expect(res.body.owner).toMatchObject({ email: "ana@test.local", role: "owner", commerce: res.body.commerce._id });
    expect(containsKey(res.body, "passwordHash")).toBe(false);
    expect(containsKey(res.body, "orderCounter")).toBe(false);

    const owner = await loginAs(app, "ana@test.local", "senha-da-ana-1");
    expect((await owner.get("/api/auth/me")).body.user.commerce.slug).toBe("burger-demo");
  });

  it("ignora rol, estado y campos internos que vengan en el body", async () => {
    const res = await root.post("/api/admin/commerces").send(
      newCommerceBody({
        commerce: { status: "suspended", orderCounter: 99, override: { mode: "open" } },
        owner: { role: "superadmin", active: false },
      })
    );
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: "ana@test.local" });
    expect(user.role).toBe("owner");
    expect(user.active).toBe(true);
    const commerce = await Commerce.findById(res.body.commerce._id).select("+orderCounter");
    expect(commerce.status).toBe("active");
    expect(commerce.orderCounter).toBe(0);
  });

  it("normaliza el slug a minúsculas", async () => {
    const res = await root.post("/api/admin/commerces").send(newCommerceBody({ commerce: { slug: " Burger-Demo " } }));
    expect(res.body.commerce.slug).toBe("burger-demo");
  });

  it("slug o email repetidos dan 409 y no dejan nada a medias", async () => {
    await createCommerceWithOwner({ slug: "burger-demo" });
    const slug = await root.post("/api/admin/commerces").send(newCommerceBody());
    expect(slug.status).toBe(409);
    expect(slug.body.error.code).toBe("SLUG_TAKEN");

    const email = await root
      .post("/api/admin/commerces")
      .send(newCommerceBody({ commerce: { slug: "outro" }, owner: { email: "dono-burger-demo@test.local" } }));
    expect(email.status).toBe(409);
    expect(email.body.error.code).toBe("EMAIL_TAKEN");
    expect(await Commerce.exists({ slug: "outro" })).toBeNull();
  });

  it.each([
    ["slug reservado", { commerce: { slug: "admin" } }],
    ["slug de una página del front", { commerce: { slug: "pedido" } }],
    ["slug de la cuenta del cliente", { commerce: { slug: "conta" } }],
    ["slug con espacios", { commerce: { slug: "burger demo" } }],
    ["whatsapp inválido", { commerce: { whatsapp: "123" } }],
    ["contraseña corta", { owner: { password: "123" } }],
    ["email inválido", { owner: { email: "ana" } }],
  ])("rechaza con 400: %s", async (_caso, overrides) => {
    const res = await root.post("/api/admin/commerces").send(newCommerceBody(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/admin/commerces", () => {
  it("lista los locales con sus dueños, sin datos sensibles", async () => {
    await createCommerceWithOwner({ slug: "loja-a" });
    await createCommerceWithOwner({ slug: "loja-b" });
    const res = await root.get("/api/admin/commerces");

    expect(res.status).toBe(200);
    expect(res.body.commerces).toHaveLength(2);
    expect(res.body.commerces[0].owners[0]).toEqual({
      _id: expect.any(String),
      name: expect.any(String),
      email: expect.stringMatching(/@test\.local$/),
      active: true,
    });
    expect(containsKey(res.body, "passwordHash")).toBe(false);
    expect(containsKey(res.body, "orderCounter")).toBe(false);
  });
});

describe("PATCH /api/admin/commerces/:id", () => {
  it("suspende un local y el dueño lo ve en su sesión", async () => {
    const { commerce, owner } = await createCommerceWithOwner();
    const res = await root.patch(`/api/admin/commerces/${commerce._id}`).send({ status: "suspended" });
    expect(res.status).toBe(200);
    expect(res.body.commerce.status).toBe("suspended");

    const agent = await loginAs(app, owner.email);
    expect((await agent.get("/api/auth/me")).body.user.commerce.status).toBe("suspended");
  });

  it("cambia el slug si está libre y da 409 si no", async () => {
    const { commerce } = await createCommerceWithOwner({ slug: "loja-a" });
    await createCommerceWithOwner({ slug: "loja-b" });
    expect((await root.patch(`/api/admin/commerces/${commerce._id}`).send({ slug: "loja-b" })).status).toBe(409);
    expect((await root.patch(`/api/admin/commerces/${commerce._id}`).send({ slug: "loja-c" })).body.commerce.slug).toBe("loja-c");
  });

  it("id inválido da 400, inexistente 404 y body vacío 400", async () => {
    expect((await root.patch("/api/admin/commerces/abc").send({ status: "active" })).status).toBe(400);
    expect((await root.patch("/api/admin/commerces/64b000000000000000000000").send({ status: "active" })).status).toBe(404);
    const { commerce } = await createCommerceWithOwner();
    expect((await root.patch(`/api/admin/commerces/${commerce._id}`).send({})).status).toBe(400);
  });
});

describe("PATCH /api/admin/users/:id/password", () => {
  it("resetea la contraseña de un dueño y cierra sus sesiones", async () => {
    const { owner } = await createCommerceWithOwner();
    const oldSession = await loginAs(app, owner.email);

    const res = await root.patch(`/api/admin/users/${owner._id}/password`).send({ password: "nova-senha-123" });
    expect(res.status).toBe(204);
    expect((await oldSession.get("/api/auth/me")).status).toBe(401);
    await loginAs(app, owner.email, "nova-senha-123");
  });

  it("no sirve para cambiar la contraseña de un superadmin", async () => {
    const other = await createSuperadmin("otro-root@test.local");
    const res = await root.patch(`/api/admin/users/${other._id}/password`).send({ password: "nova-senha-123" });
    expect(res.status).toBe(404);
    await loginAs(app, "otro-root@test.local", PASSWORD);
  });
});

import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import User from "../../src/models/user.model.js";
import { PASSWORD, containsKey, createCommerceWithOwner, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

describe("POST /api/auth/login", () => {
  it("inicia sesión con cookie httpOnly y SameSite=Lax", async () => {
    const { owner } = await createCommerceWithOwner();
    const res = await request(app).post("/api/auth/login").send({ email: owner.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: owner.email, role: "owner", commerce: { slug: "loja-a" } });
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(containsKey(res.body, "passwordHash")).toBe(false);
    expect(containsKey(res.body, "tokenVersion")).toBe(false);
  });

  it("acepta el email con mayúsculas y espacios", async () => {
    await createSuperadmin("root@test.local");
    const res = await request(app).post("/api/auth/login").send({ email: "  ROOT@test.local ", password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("da el mismo 401 para contraseña incorrecta y para email inexistente", async () => {
    await createSuperadmin();
    const wrong = await request(app).post("/api/auth/login").send({ email: "root@test.local", password: "otra-cosa" });
    const missing = await request(app).post("/api/auth/login").send({ email: "nadie@test.local", password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("no deja entrar a un usuario inactivo", async () => {
    const admin = await createSuperadmin();
    await User.updateOne({ _id: admin._id }, { active: false });
    const res = await request(app).post("/api/auth/login").send({ email: admin.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("un body inválido da 400 con detalles", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "no-es-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d) => d.path)).toEqual(expect.arrayContaining(["email", "password"]));
  });

  it("corta con 429 después del límite de intentos", async () => {
    const limitedApp = createApp({ limits: { login: { limit: 2 } } });
    const attempt = () => request(limitedApp).post("/api/auth/login").send({ email: "x@test.local", password: "x" });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});

describe("sesión", () => {
  it("GET /me sin sesión da 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("GET /me devuelve el usuario y su local", async () => {
    const { owner, commerce } = await createCommerceWithOwner();
    const agent = await loginAs(app, owner.email);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.commerce).toMatchObject({ _id: String(commerce._id), slug: commerce.slug, status: "active" });
  });

  it("rechaza un token firmado con otra clave", async () => {
    const admin = await createSuperadmin();
    const forged = jwt.sign({ sub: String(admin._id), v: 0 }, "otra-clave-que-no-es-la-del-servidor-123456");
    const res = await request(app).get("/api/auth/me").set("Cookie", `token=${forged}`);
    expect(res.status).toBe(401);
  });

  it("desactivar al usuario corta su sesión abierta", async () => {
    const admin = await createSuperadmin();
    const agent = await loginAs(app, admin.email);
    await User.updateOne({ _id: admin._id }, { active: false });
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("logout borra la cookie", async () => {
    const admin = await createSuperadmin();
    const agent = await loginAs(app, admin.email);
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("PATCH /api/auth/password", () => {
  it("rechaza si la contraseña actual es incorrecta", async () => {
    const admin = await createSuperadmin();
    const agent = await loginAs(app, admin.email);
    const res = await agent.patch("/api/auth/password").send({ currentPassword: "mal", newPassword: "nueva-senha-123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PASSWORD");
  });

  it("exige una contraseña nueva de 8 caracteres o más", async () => {
    const admin = await createSuperadmin();
    const agent = await loginAs(app, admin.email);
    const res = await agent.patch("/api/auth/password").send({ currentPassword: PASSWORD, newPassword: "corta" });
    expect(res.status).toBe(400);
  });

  it("cierra las otras sesiones y mantiene la actual", async () => {
    const admin = await createSuperadmin();
    const otherDevice = await loginAs(app, admin.email);
    const thisDevice = await loginAs(app, admin.email);

    const res = await thisDevice.patch("/api/auth/password").send({ currentPassword: PASSWORD, newPassword: "nueva-senha-123" });
    expect(res.status).toBe(204);
    expect((await thisDevice.get("/api/auth/me")).status).toBe(200);
    expect((await otherDevice.get("/api/auth/me")).status).toBe(401);
    await loginAs(app, admin.email, "nueva-senha-123");
  });
});

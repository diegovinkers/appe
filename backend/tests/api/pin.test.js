import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import AuditLog from "../../src/models/auditLog.model.js";
import User from "../../src/models/user.model.js";
import { runMigrations } from "../../src/lib/migrations.js";
import { containsKey, createCommerceWithOwner, createStaff, loginAs } from "../helpers.js";

const app = createApp();

let commerce, owner;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-pin" }));
  owner = await loginAs(app, "dono-loja-pin@test.local");
});

// Registra este "aparato" (un agente aparte) como del equipo y devuelve su cookie.
async function registerTablet(name = "Tablet do salão") {
  const res = await owner.post("/api/owner/devices").send({ name });
  expect(res.status).toBe(201);
  return { device: res.body.device, cookie: res.headers["set-cookie"].find((cookie) => cookie.startsWith("aparelho=")).split(";")[0] };
}
const pinLogin = (cookie, userId, pin) => request(app).post("/api/auth/pin").set("Cookie", cookie).send({ userId, pin });

describe("mozos con PIN", () => {
  it("el dueño los crea sin email (varios) y con email y contraseña sigue igual", async () => {
    const ana = await owner.post("/api/owner/team").send({ name: "Ana", pin: "1234" });
    const bruno = await owner.post("/api/owner/team").send({ name: "Bruno", pin: "5678" });
    expect(ana.status).toBe(201);
    expect(bruno.status).toBe(201);
    expect(ana.body.member).toMatchObject({ name: "Ana", email: null, hasPin: true, role: "staff" });
    const both = await owner.post("/api/owner/team").send({ name: "Carla", email: "carla@test.local", password: "senha-forte-123", pin: "4321" });
    expect(both.body.member).toMatchObject({ email: "carla@test.local", hasPin: true });
    expect((await owner.post("/api/owner/team").send({ name: "Sem nada" })).status).toBe(400);
    expect((await owner.post("/api/owner/team").send({ name: "Só email", email: "so@test.local" })).status).toBe(400);
    expect((await owner.post("/api/owner/team").send({ name: "PIN curto", pin: "12" })).status).toBe(400);
    const team = await owner.get("/api/owner/team");
    expect(containsKey(team.body, "pinHash")).toBe(false);
    // Sin email no tiene contraseña que cambiar.
    expect((await owner.put(`/api/owner/team/${ana.body.member._id}/password`).send({ password: "outra-senha-123" })).body.error.code).toBe("MEMBER_WITHOUT_EMAIL");
  });

  it("solo desde un aparato del equipo: muestra quién entra y entra con el PIN", async () => {
    const ana = (await owner.post("/api/owner/team").send({ name: "Ana", pin: "1234" })).body.member;
    await createStaff(commerce); // con email, sin PIN: no aparece
    const loose = await request(app).get("/api/auth/device");
    expect(loose.status).toBe(401);
    expect(loose.body.error.code).toBe("DEVICE_NOT_REGISTERED");
    expect((await request(app).post("/api/auth/pin").send({ userId: ana._id, pin: "1234" })).body.error.code).toBe("DEVICE_NOT_REGISTERED");

    const { cookie } = await registerTablet();
    const info = await request(app).get("/api/auth/device").set("Cookie", cookie);
    expect(info.body).toMatchObject({ device: { name: "Tablet do salão" }, commerce: { name: "Loja loja-pin", slug: "loja-pin" }, people: [{ _id: ana._id, name: "Ana" }] });

    const wrong = await pinLogin(cookie, ana._id, "9999");
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_PIN");
    const ok = await pinLogin(cookie, ana._id, "1234");
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: "Ana", email: null, role: "staff" });
    // La sesión es de Ana: atiende pedidos pero no maneja el equipo.
    const tablet = request.agent(app);
    const session = ok.headers["set-cookie"].find((c) => c.startsWith("token=")).split(";")[0];
    expect((await tablet.get("/api/owner/orders").set("Cookie", session)).status).toBe(200);
    expect((await tablet.get("/api/owner/team").set("Cookie", session)).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: "auth.pin_login" })).toBe(1);
    // Sin contraseña, no hay contraseña para cambiar (y no rompe).
    const noPassword = await tablet.patch("/api/auth/password").set("Cookie", session).send({ currentPassword: "qualquer-coisa", newPassword: "nova-senha-123" });
    expect(noPassword.status).toBe(409);
    expect(noPassword.body.error.code).toBe("NO_PASSWORD");
  });

  it("después de 5 PIN equivocados se bloquea; el dueño le pone otro PIN y se desbloquea", async () => {
    const ana = (await owner.post("/api/owner/team").send({ name: "Ana", pin: "1234" })).body.member;
    const { cookie } = await registerTablet();
    for (let i = 0; i < 5; i++) expect((await pinLogin(cookie, ana._id, "0000")).body.error.code).toBe("INVALID_PIN");
    const locked = await pinLogin(cookie, ana._id, "1234");
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("PIN_LOCKED");
    expect(await AuditLog.countDocuments({ action: "auth.pin_locked" })).toBe(1);
    expect((await owner.put(`/api/owner/team/${ana._id}/pin`).send({ pin: "2468" })).status).toBe(204);
    expect((await pinLogin(cookie, ana._id, "2468")).status).toBe(200);
  });

  it("un aparato dado de baja o de otro local no sirve, y un empleado desactivado no entra", async () => {
    const ana = (await owner.post("/api/owner/team").send({ name: "Ana", pin: "1234" })).body.member;
    const { device, cookie } = await registerTablet();
    const other = await createCommerceWithOwner({ slug: "loja-outra" });
    const otherOwner = await loginAs(app, other.owner.email);
    const otherTablet = (await otherOwner.post("/api/owner/devices").send({ name: "Outra" })).headers["set-cookie"].find((c) => c.startsWith("aparelho=")).split(";")[0];
    // Desde la tablet de otro local, Ana no existe.
    expect((await pinLogin(otherTablet, ana._id, "1234")).body.error.code).toBe("INVALID_PIN");
    expect((await otherOwner.delete(`/api/owner/devices/${device._id}`)).status).toBe(404);

    await owner.patch(`/api/owner/team/${ana._id}`).send({ active: false });
    expect((await pinLogin(cookie, ana._id, "1234")).body.error.code).toBe("INVALID_PIN");
    expect((await owner.delete(`/api/owner/devices/${device._id}`)).status).toBe(204);
    expect((await request(app).get("/api/auth/device").set("Cookie", cookie)).status).toBe(401);
    expect((await owner.get("/api/owner/devices")).body.devices).toEqual([]);
  });

  it("cada uno cambia su PIN: con PIN pide el actual; sin PIN, la contraseña. El dueño con PIN entra en la tablet", async () => {
    const ana = (await owner.post("/api/owner/team").send({ name: "Ana", pin: "1234" })).body.member;
    const { cookie } = await registerTablet();
    const session = (await pinLogin(cookie, ana._id, "1234")).headers["set-cookie"].find((c) => c.startsWith("token=")).split(";")[0];
    const asAna = (method, path) => request(app)[method](path).set("Cookie", session);
    expect((await asAna("get", "/api/auth/me")).body.user).toMatchObject({ hasPin: true, email: null });
    expect((await asAna("put", "/api/auth/pin").send({ pin: "5555", currentPin: "0000" })).body.error.code).toBe("INVALID_CURRENT_PIN");
    expect((await asAna("put", "/api/auth/pin").send({ pin: "5555", currentPin: "1234" })).status).toBe(204);
    expect((await pinLogin(cookie, ana._id, "1234")).status).toBe(401);
    expect((await pinLogin(cookie, ana._id, "5555")).status).toBe(200);

    // El dueño no tenía PIN: lo pone con su contraseña y aparece primero en la tablet.
    expect((await owner.get("/api/auth/me")).body.user.hasPin).toBe(false);
    expect((await owner.put("/api/auth/pin").send({ pin: "9876", currentPassword: "mal" })).body.error.code).toBe("INVALID_PASSWORD");
    expect((await owner.put("/api/auth/pin").send({ pin: "9876", currentPassword: "senha-de-teste-123" })).status).toBe(204);
    const people = (await request(app).get("/api/auth/device").set("Cookie", cookie)).body.people.map((p) => p.name);
    expect(people).toEqual(["Dono loja-pin", "Ana"]);
    const ownerId = (await owner.get("/api/auth/me")).body.user._id;
    expect((await pinLogin(cookie, ownerId, "9876")).body.user).toMatchObject({ role: "owner" });
    expect(await AuditLog.countDocuments({ action: "auth.pin_changed" })).toBe(2);
  });

  it("un empleado no registra aparatos ni maneja PINs", async () => {
    await createStaff(commerce);
    const staff = await loginAs(app, "staff-loja-pin@test.local");
    expect((await staff.post("/api/owner/devices").send({ name: "Minha" })).status).toBe(403);
    expect((await staff.get("/api/owner/devices")).status).toBe(403);
  });

  it("al arrancar cambia el índice viejo de email por uno que permite usuarios sin email", async () => {
    await User.collection.dropIndex("email_1");
    await User.collection.createIndex({ email: 1 }, { unique: true, name: "email_1" });
    await runMigrations();
    const index = (await User.collection.indexes()).find((item) => item.name === "email_1");
    expect(index.partialFilterExpression).toEqual({ email: { $type: "string" } });
    await runMigrations();
  });
});

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import AuditLog from "../../src/models/auditLog.model.js";
import User from "../../src/models/user.model.js";
import { PASSWORD, containsKey, createCommerceWithOwner, createStaff, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

let commerce, owner;
beforeEach(async () => {
  ({ commerce } = await createCommerceWithOwner({ slug: "loja-a" }));
  owner = await loginAs(app, "dono-loja-a@test.local");
});

const newMember = { name: "Joana", email: "Joana@Test.local", password: "senha-da-joana" };

describe("equipe", () => {
  it("el dueño da de alta un empleado que entra y atiende pedidos", async () => {
    const res = await owner.post("/api/owner/team").send(newMember);
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ name: "Joana", email: "joana@test.local", role: "staff", active: true });
    expect(containsKey(res.body, "passwordHash")).toBe(false);

    const staff = await loginAs(app, "joana@test.local", "senha-da-joana");
    expect((await staff.get("/api/owner/orders")).status).toBe(200);
    // El empleado no maneja la equipe.
    expect((await staff.get("/api/owner/team")).status).toBe(403);
    expect((await staff.post("/api/owner/team").send({ ...newMember, email: "otro@test.local" })).status).toBe(403);

    const list = await owner.get("/api/owner/team");
    expect(list.body.members.map((member) => [member.role, member.name])).toEqual([
      ["owner", "Dono loja-a"],
      ["staff", "Joana"],
    ]);
    expect(await AuditLog.countDocuments({ action: "team.member_created" })).toBe(1);
  });

  it("no repite e-mails y valida la entrada", async () => {
    await owner.post("/api/owner/team").send(newMember);
    const again = await owner.post("/api/owner/team").send({ ...newMember, name: "Otra" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("EMAIL_TAKEN");
    expect((await owner.post("/api/owner/team").send({ ...newMember, email: "no-es-email" })).status).toBe(400);
    expect((await owner.post("/api/owner/team").send({ ...newMember, email: "x@test.local", password: "corta" })).status).toBe(400);
    // El rol no se elige: aunque lo manden, es staff.
    const sneaky = await owner.post("/api/owner/team").send({ ...newMember, email: "jefe@test.local", role: "owner" });
    expect(sneaky.body.member.role).toBe("staff");
    expect((await owner.patch(`/api/owner/team/${sneaky.body.member._id}`).send({})).status).toBe(400);
  });

  it("desactivar corta la sesión del empleado y no lo deja entrar", async () => {
    const staffUser = await createStaff(commerce);
    const staff = await loginAs(app, staffUser.email);
    const res = await owner.patch(`/api/owner/team/${staffUser._id}`).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.member.active).toBe(false);
    expect((await staff.get("/api/owner/orders")).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: staffUser.email, password: PASSWORD })).status).toBe(401);

    await owner.patch(`/api/owner/team/${staffUser._id}`).send({ active: true, name: "Atendente da noite" });
    await loginAs(app, staffUser.email);
    expect((await User.findById(staffUser._id)).name).toBe("Atendente da noite");
  });

  it("la contraseña nueva cierra las sesiones del empleado", async () => {
    const staffUser = await createStaff(commerce);
    const staff = await loginAs(app, staffUser.email);
    const res = await owner.put(`/api/owner/team/${staffUser._id}/password`).send({ password: "nova-senha-123" });
    expect(res.status).toBe(204);
    expect((await staff.get("/api/owner/orders")).status).toBe(401);
    await loginAs(app, staffUser.email, "nova-senha-123");
    expect(await AuditLog.countDocuments({ action: "team.password_reset" })).toBe(1);
  });

  it("no toca al dueño ni a empleados de otro local", async () => {
    const ownerUser = await User.findOne({ email: "dono-loja-a@test.local" });
    expect((await owner.patch(`/api/owner/team/${ownerUser._id}`).send({ active: false })).status).toBe(404);
    expect((await owner.put(`/api/owner/team/${ownerUser._id}/password`).send({ password: "outra-senha-1" })).status).toBe(404);

    const { commerce: other } = await createCommerceWithOwner({ slug: "loja-b" });
    const foreign = await createStaff(other);
    expect((await owner.patch(`/api/owner/team/${foreign._id}`).send({ active: false })).status).toBe(404);
    expect((await owner.put(`/api/owner/team/${foreign._id}/password`).send({ password: "outra-senha-1" })).status).toBe(404);
    expect((await owner.get("/api/owner/team")).body.members.map((member) => member.email)).not.toContain(foreign.email);
    expect((await User.findById(foreign._id)).active).toBe(true);
    expect((await owner.patch("/api/owner/team/no-es-un-id").send({ active: false })).status).toBe(400);
  });

  it("sin sesión 401 y superadmin 403", async () => {
    expect((await request(app).get("/api/owner/team")).status).toBe(401);
    await createSuperadmin();
    const root = await loginAs(app, "root@test.local");
    expect((await root.get("/api/owner/team")).status).toBe(403);
  });
});

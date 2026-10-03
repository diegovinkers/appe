import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("app", () => {
  it("health responde ok con la base conectada", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("una ruta que no existe da 404 con el formato de error", async () => {
    const res = await request(app).get("/api/no-existe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "ROUTE_NOT_FOUND", message: expect.any(String) } });
  });

  it.each([
    ["post", "/api/auth/register"],
    ["post", "/api/auth/register-admin"],
    ["post", "/api/auth/verify"],
    ["get", "/api/commerces"],
  ])("la ruta vieja %s %s ya no existe", async (method, path) => {
    const res = await request(app)[method](path).send({ role: "admin" });
    expect(res.status).toBe(404);
  });

  it("JSON mal formado da 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("un body de más de 100 kb da 413", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@test.local", password: "x".repeat(150_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("manda los headers de seguridad de helmet", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("CORS solo habilita los orígenes configurados", async () => {
    const allowed = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const other = await request(app).get("/api/health").set("Origin", "https://otro-sitio.com");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

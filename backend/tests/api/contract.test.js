import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiRouters, createApp } from "../../src/app.js";
import { buildOpenApi } from "../../src/docs/openapi.js";
import { operations } from "../../src/docs/operations.js";
import { errorResponse } from "../../src/schemas/responses.schema.js";
import { setAiProvider } from "../../src/services/assistant/ai.js";
import { setTranscriber } from "../../src/services/assistant/transcription.js";
import { setSpeaker } from "../../src/services/assistant/voice.js";
import { PASSWORD, createCommerceWithOwner, createMenu, createSuperadmin, loginAs } from "../helpers.js";

const app = createApp();

describe("OpenAPI", () => {
  it("docs/openapi.json está al día (si falla: npm run openapi)", () => {
    const file = JSON.parse(readFileSync(new URL("../../docs/openapi.json", import.meta.url), "utf8"));
    expect(file).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
  });

  it("el registro tiene exactamente las rutas de Express", () => {
    const routes = new Set(["get /api/health"]);
    for (const [prefix, router] of Object.entries(createApiRouters())) {
      for (const layer of router.stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) routes.add(`${method} ${prefix}${layer.route.path}`);
      }
    }
    const documented = new Set(operations.map((op) => `${op.method} ${op.path}`));
    expect([...routes].filter((route) => !documented.has(route)), "rutas sin documentar").toEqual([]);
    expect([...documented].filter((route) => !routes.has(route)), "documentadas que no existen").toEqual([]);
  });
});

// Recorre todos los endpoints y valida cada respuesta real contra su schema del registro.
describe("contrato de las respuestas", () => {
  // Recorre todos los endpoints en una sola prueba: con la máquina ocupada pasa los 5 s por defecto.
  it("cada endpoint responde exactamente lo que dice el OpenAPI", { timeout: 30_000 }, async () => {
    const covered = new Set();
    const check = (res, method, path) => {
      const op = operations.find((o) => o.method === method && o.path === path);
      const key = `${method} ${path}`;
      expect(op, `${key} no está en el registro`).toBeDefined();
      expect(Object.keys(op.responses), `${key} respondió ${res.status}: ${JSON.stringify(res.body)}`).toContain(
        String(res.status)
      );
      const schema = op.responses[res.status];
      if (schema?.binary) {
        expect(schema.binary, key).toContain(res.headers["content-type"].split(";")[0]);
      } else if (schema) {
        const result = schema.safeParse(res.body);
        expect(result.success, `${key}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      }
      covered.add(key);
      return res;
    };

    check(await request(app).get("/api/health"), "get", "/api/health");

    // Webhook de WhatsApp: la verificación y un aviso de entrega (sin mensajes que contestar).
    check(
      await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "verificacion-de-prueba", "hub.challenge": "123" }),
      "get",
      "/api/whatsapp/webhook"
    );
    const statuses = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { statuses: [] } }] }] });
    check(
      await request(app)
        .post("/api/whatsapp/webhook")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", `sha256=${createHmac("sha256", "secreto-de-prueba").update(statuses).digest("hex")}`)
        .send(statuses),
      "post",
      "/api/whatsapp/webhook"
    );

    // Plataforma
    await createSuperadmin();
    const root = request.agent(app);
    check(await root.post("/api/auth/login").send({ email: "root@test.local", password: PASSWORD }), "post", "/api/auth/login");
    check(await root.get("/api/auth/me"), "get", "/api/auth/me");
    const created = check(
      await root.post("/api/admin/commerces").send({
        commerce: { name: "Contrato", slug: "contrato", whatsapp: "55 99999-8888" },
        owner: { name: "Ana", email: "ana@test.local", password: "senha-da-ana-1" },
      }),
      "post",
      "/api/admin/commerces"
    );
    const commerceId = created.body.commerce._id;
    check(await root.get("/api/admin/commerces"), "get", "/api/admin/commerces");
    check(await root.patch(`/api/admin/commerces/${commerceId}`).send({ name: "Contrato 2" }), "patch", "/api/admin/commerces/:id");
    check(await root.get("/api/admin/audit"), "get", "/api/admin/audit");

    // Panel
    const owner = await loginAs(app, "ana@test.local", "senha-da-ana-1");
    check(await owner.get("/api/owner/store"), "get", "/api/owner/store");
    check(
      await owner.patch("/api/owner/store").send({ paymentMethods: ["cash", "pix"], pixKey: "ana@pix.com" }),
      "patch",
      "/api/owner/store"
    );
    check(
      await owner.put("/api/owner/store/hours").send({ weekly: { mon: [{ open: "18:00", close: "23:30" }] } }),
      "put",
      "/api/owner/store/hours"
    );
    check(await owner.put("/api/owner/store/status").send({ mode: "open" }), "put", "/api/owner/store/status");
    check(await owner.get("/api/owner/store/qr"), "get", "/api/owner/store/qr");

    const category = check(await owner.post("/api/owner/categories").send({ name: "Lanches" }), "post", "/api/owner/categories").body.category;
    const spare = (await owner.post("/api/owner/categories").send({ name: "Vazia" })).body.category;
    check(await owner.get("/api/owner/categories"), "get", "/api/owner/categories");
    check(await owner.patch(`/api/owner/categories/${category._id}`).send({ name: "Hambúrgueres" }), "patch", "/api/owner/categories/:id");
    check(await owner.patch("/api/owner/categories/reorder").send({ ids: [spare._id, category._id] }), "patch", "/api/owner/categories/reorder");
    check(await owner.delete(`/api/owner/categories/${spare._id}`), "delete", "/api/owner/categories/:id");

    const group = check(
      await owner.post("/api/owner/option-groups").send({ name: "Adicionais", maxSelect: 2, options: [{ name: "Bacon", priceCents: 400 }, { name: "Ovo" }] }),
      "post",
      "/api/owner/option-groups"
    ).body.optionGroup;
    const spareGroup = (await owner.post("/api/owner/option-groups").send({ name: "Molhos", options: [{ name: "Barbecue" }] })).body.optionGroup;
    check(await owner.get("/api/owner/option-groups"), "get", "/api/owner/option-groups");
    check(await owner.get(`/api/owner/option-groups/${group._id}`), "get", "/api/owner/option-groups/:id");
    check(await owner.patch(`/api/owner/option-groups/${group._id}`).send({ name: "Extras" }), "patch", "/api/owner/option-groups/:id");
    check(
      await owner.patch(`/api/owner/option-groups/${group._id}/options/${group.options[1]._id}`).send({ available: false }),
      "patch",
      "/api/owner/option-groups/:id/options/:optionId"
    );
    check(await owner.delete(`/api/owner/option-groups/${spareGroup._id}`), "delete", "/api/owner/option-groups/:id");

    const product = check(
      await owner.post("/api/owner/products").send({ category: category._id, name: "X-Burger", priceCents: 2500, optionGroups: [group._id] }),
      "post",
      "/api/owner/products"
    ).body.product;
    const spareProduct = (await owner.post("/api/owner/products").send({ category: category._id, name: "X-Salada", priceCents: 2700 })).body.product;
    check(await owner.get("/api/owner/products"), "get", "/api/owner/products");
    check(await owner.get(`/api/owner/products/${product._id}`), "get", "/api/owner/products/:id");
    check(await owner.patch(`/api/owner/products/${product._id}`).send({ priceCents: 2600 }), "patch", "/api/owner/products/:id");
    check(await owner.patch(`/api/owner/products/${spareProduct._id}/availability`).send({ available: false }), "patch", "/api/owner/products/:id/availability");
    check(
      await owner.patch("/api/owner/products/reorder").send({ category: category._id, ids: [spareProduct._id, product._id] }),
      "patch",
      "/api/owner/products/reorder"
    );
    check(await owner.post(`/api/owner/products/${product._id}/duplicate`), "post", "/api/owner/products/:id/duplicate");
    check(await owner.delete(`/api/owner/products/${spareProduct._id}`), "delete", "/api/owner/products/:id");
    check(await owner.get("/api/owner/menu/export"), "get", "/api/owner/menu/export");
    check(
      await owner.post("/api/owner/menu/import").send({ csv: "categoria;produto;preco\nBebidas;Suco;7,50" }),
      "post",
      "/api/owner/menu/import"
    );
    check(await owner.post("/api/owner/uploads/signature").send({ kind: "product" }), "post", "/api/owner/uploads/signature");

    // Cupones
    const createdCoupon = check(
      await owner.post("/api/owner/coupons").send({ code: "bemvindo", type: "percent", value: 10 }),
      "post",
      "/api/owner/coupons"
    ).body.coupon;
    check(await owner.get("/api/owner/coupons"), "get", "/api/owner/coupons");
    check(await owner.patch(`/api/owner/coupons/${createdCoupon._id}`).send({ maxUsesPerCustomer: 1 }), "patch", "/api/owner/coupons/:id");

    // Cliente
    check(await request(app).get("/api/public/stores"), "get", "/api/public/stores");
    check(await request(app).get("/api/public/stores/contrato"), "get", "/api/public/stores/:slug");
    await owner.patch("/api/owner/store").send({ scheduling: { enabled: true } });
    check(await request(app).get("/api/public/stores/contrato/slots"), "get", "/api/public/stores/:slug/slots");
    check(
      await request(app).post("/api/public/stores/contrato/coupons/validate").send({ code: "BEMVINDO" }),
      "post",
      "/api/public/stores/:slug/coupons/validate"
    );
    const orderBody = {
      clientOrderId: randomUUID(),
      customer: { name: "Maria Souza", phone: "55 99999-1234" },
      fulfillment: "delivery",
      address: { street: "Rua Brasil", number: "10", neighborhood: "Centro" },
      paymentMethod: "cash",
      couponCode: "BEMVINDO",
      items: [{ productId: product._id, quantity: 1, options: [{ groupId: group._id, optionId: group.options[0]._id }] }],
    };
    const receipt = check(await request(app).post("/api/public/stores/contrato/orders").send(orderBody), "post", "/api/public/stores/:slug/orders");
    check(await request(app).post("/api/public/stores/contrato/orders").send(orderBody), "post", "/api/public/stores/:slug/orders");
    const token = receipt.body.trackingUrl.split("/").at(-1);
    check(await request(app).get(`/api/public/orders/${token}`), "get", "/api/public/orders/:token");

    // Pedidos en el panel
    const orderId = receipt.body.order._id;
    check(await owner.get("/api/owner/orders"), "get", "/api/owner/orders");
    check(await owner.get(`/api/owner/orders/${orderId}`), "get", "/api/owner/orders/:id");
    check(await owner.patch(`/api/owner/orders/${orderId}/status`).send({ status: "confirmed" }), "patch", "/api/owner/orders/:id/status");
    check(await owner.patch(`/api/owner/orders/${orderId}/notes`).send({ internalNotes: "Cliente antigo" }), "patch", "/api/owner/orders/:id/notes");
    check(await owner.get(`/api/owner/orders/${orderId}/ticket`), "get", "/api/owner/orders/:id/ticket");

    // Reseñas: el pedido llega a entregado y el cliente opina.
    for (const status of ["ready", "out_for_delivery", "delivered"]) await owner.patch(`/api/owner/orders/${orderId}/status`).send({ status });
    check(await request(app).post(`/api/public/orders/${token}/review`).send({ rating: 5, comment: "Muito bom" }), "post", "/api/public/orders/:token/review");
    check(await request(app).get(`/api/public/orders/${token}`), "get", "/api/public/orders/:token");
    check(await request(app).get("/api/public/stores/contrato/reviews"), "get", "/api/public/stores/:slug/reviews");
    const reviews = check(await owner.get("/api/owner/reviews"), "get", "/api/owner/reviews").body.reviews;
    check(await owner.patch(`/api/owner/reviews/${reviews[0]._id}`).send({ hidden: true }), "patch", "/api/owner/reviews/:id");
    check(await request(app).get("/api/public/stores"), "get", "/api/public/stores");

    // Cuenta del cliente: la crea con el pedido de este "aparato" (mismo teléfono).
    const cliente = request.agent(app);
    const conta = { name: "Maria Souza", phone: "55 99999-1234", password: "senha-da-maria-1" };
    check(await cliente.post("/api/customer/signup").send({ ...conta, orderTokens: [token] }), "post", "/api/customer/signup");
    check(await cliente.get("/api/customer/me"), "get", "/api/customer/me");
    check(
      await cliente.patch("/api/customer/me").send({ addresses: [{ street: "Rua Brasil", number: "10", neighborhood: "Centro" }] }),
      "patch",
      "/api/customer/me"
    );
    check(await cliente.get("/api/customer/orders"), "get", "/api/customer/orders");
    check(await cliente.post("/api/customer/orders/link").send({ orderTokens: [token] }), "post", "/api/customer/orders/link");
    check(await cliente.post("/api/customer/logout"), "post", "/api/customer/logout");
    check(await cliente.post("/api/customer/login").send({ phone: conta.phone, password: conta.password }), "post", "/api/customer/login");
    check(await cliente.post("/api/customer/me/delete").send({ password: conta.password }), "post", "/api/customer/me/delete");
    check(
      await owner.post("/api/owner/orders").send({
        channel: "counter",
        customer: { name: "João" },
        fulfillment: "pickup",
        paymentMethod: "cash",
        items: [{ productId: product._id, quantity: 1, options: [{ groupId: group._id, optionId: group.options[0]._id }] }],
      }),
      "post",
      "/api/owner/orders"
    );
    check(await owner.delete(`/api/owner/coupons/${createdCoupon._id}`), "delete", "/api/owner/coupons/:id");

    // Asistente con IA, con una IA de prueba (nunca la real)
    setAiProvider({
      name: "fake",
      model: "claude-haiku-4-5-20251001",
      complete: async () => ({
        content: [{ type: "text", text: "Olá! O que vai ser hoje?" }],
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 },
      }),
    });
    check(await owner.get("/api/owner/assistant"), "get", "/api/owner/assistant");
    check(await owner.patch("/api/owner/assistant").send({ enabled: true, monthlyBudgetUsdCents: 500 }), "patch", "/api/owner/assistant");
    const chat = check(
      await owner.post("/api/owner/assistant/simulator").send({ text: "oi", customer: { name: "Maria", phone: "55 99999-1234" } }),
      "post",
      "/api/owner/assistant/simulator"
    ).body.conversation;
    setTranscriber(async () => "quero um x-burger");
    check(
      await owner
        .post("/api/owner/assistant/simulator/audio")
        .send({ audio: Buffer.from("audio ".repeat(30)).toString("base64"), customer: { name: "Maria", phone: "55 99999-1234" }, conversationId: chat._id }),
      "post",
      "/api/owner/assistant/simulator/audio"
    );
    setTranscriber(undefined);
    setSpeaker(async () => Buffer.from("OggS"));
    check(await owner.post("/api/owner/assistant/speech").send({ text: "Oi!" }), "post", "/api/owner/assistant/speech");
    setSpeaker(undefined);
    check(await owner.get("/api/owner/assistant/conversations"), "get", "/api/owner/assistant/conversations");
    check(await owner.get(`/api/owner/assistant/conversations/${chat._id}`), "get", "/api/owner/assistant/conversations/:id");
    check(await owner.post(`/api/owner/assistant/conversations/${chat._id}/takeover`), "post", "/api/owner/assistant/conversations/:id/takeover");
    check(
      await owner.post(`/api/owner/assistant/conversations/${chat._id}/messages`).send({ text: "Oi, aqui é a Ana" }),
      "post",
      "/api/owner/assistant/conversations/:id/messages"
    );
    check(await owner.post(`/api/owner/assistant/conversations/${chat._id}/release`), "post", "/api/owner/assistant/conversations/:id/release");
    setAiProvider(undefined);

    // Cierre de sesión y contraseñas
    check(await root.get(`/api/admin/commerces/${commerceId}/subscription`), "get", "/api/admin/commerces/:id/subscription");
    check(await root.put(`/api/admin/commerces/${commerceId}/subscription`).send({ plan: "Essencial", priceCents: 7990, dueDate: "2030-01-01", status: "active" }), "put", "/api/admin/commerces/:id/subscription");
    check(await root.post(`/api/admin/commerces/${commerceId}/subscription/payments`).send({ reference: randomUUID(), amountCents: 7990, paidAt: "2026-01-01T12:00:00.000Z", period: "2026-01" }), "post", "/api/admin/commerces/:id/subscription/payments");
    check(await owner.get("/api/owner/subscription"), "get", "/api/owner/subscription");
    check(await owner.get("/api/owner/reports?from=2026-01-01&to=2026-01-31"), "get", "/api/owner/reports");
    check(await owner.patch("/api/auth/password").send({ currentPassword: "senha-da-ana-1", newPassword: "senha-nova-123" }), "patch", "/api/auth/password");
    check(await owner.post("/api/auth/logout"), "post", "/api/auth/logout");
    check(await root.patch(`/api/admin/users/${created.body.owner._id}/password`).send({ password: "outra-senha-123" }), "patch", "/api/admin/users/:id/password");

    const missing = operations.map((op) => `${op.method} ${op.path}`).filter((key) => !covered.has(key));
    expect(missing, "endpoints sin prueba de contrato").toEqual([]);
  });

  it("los errores tienen siempre la forma documentada", async () => {
    const { owner } = await createCommerceWithOwner();
    await createMenu((await createCommerceWithOwner({ slug: "loja-b" })).commerce);
    const agent = await loginAs(app, owner.email);
    const errors = [
      await request(app).get("/api/no-existe"),
      await request(app).get("/api/owner/store"),
      await agent.patch("/api/owner/store").send({ primaryColor: "rojo" }),
      await agent.get("/api/admin/commerces"),
      await request(app).get("/api/public/stores/no-existe"),
    ];
    for (const res of errors) expect(errorResponse.safeParse(res.body).success, JSON.stringify(res.body)).toBe(true);
  });
});

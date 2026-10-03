import { describe, expect, it } from "vitest";
import { dayRange, isValidDay, todayIn } from "../../src/lib/dates.js";
import { formatBRL } from "../../src/lib/money.js";
import { canTransition } from "../../src/services/orderStatus.js";
import { buildOrderMessage, buildWhatsappUrl } from "../../src/services/whatsapp.service.js";

describe("formatBRL", () => {
  it("formatea centavos como reales, con espacio no separable", () => {
    expect(formatBRL(7550)).toBe("R$ 75,50");
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
  });
});

describe("dates", () => {
  it("el día de Brasil empieza a las 03:00 UTC", () => {
    const { start, end } = dayRange("2026-09-27");
    expect(start.toISOString()).toBe("2026-09-27T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-28T03:00:00.000Z");
  });

  it("hoy se cuenta en la hora de Brasil", () => {
    expect(todayIn(undefined, new Date("2026-09-27T02:30:00Z"))).toBe("2026-09-26");
    expect(todayIn(undefined, new Date("2026-09-27T03:30:00Z"))).toBe("2026-09-27");
  });

  it("funciona en zonas con horario de verano", () => {
    const { start, end } = dayRange("2026-03-08", "America/New_York");
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("valida fechas reales", () => {
    expect(isValidDay("2028-02-29")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
  });
});

describe("canTransition", () => {
  it.each([
    ["delivery", "new", "confirmed", true],
    ["delivery", "confirmed", "ready", true],
    ["delivery", "ready", "out_for_delivery", true],
    ["delivery", "out_for_delivery", "delivered", true],
    ["delivery", "ready", "delivered", false],
    ["pickup", "ready", "delivered", true],
    ["pickup", "ready", "out_for_delivery", false],
    ["delivery", "new", "cancelled", true],
    ["delivery", "out_for_delivery", "cancelled", true],
    ["delivery", "new", "delivered", false],
    ["delivery", "confirmed", "new", false],
    ["delivery", "delivered", "cancelled", false],
    ["pickup", "cancelled", "new", false],
  ])("%s: %s → %s: %s", (fulfillment, from, to, expected) => {
    expect(canTransition(from, to, fulfillment)).toBe(expected);
  });
});

describe("mensaje de WhatsApp", () => {
  const store = { name: "Burger Demo", pixKey: "burger@pix.com" };
  const order = {
    number: 12,
    items: [
      {
        name: "X-Burger",
        quantity: 2,
        totalCents: 6400,
        notes: "sem cebola",
        options: [
          { group: "Ponto da carne", name: "Ao ponto", priceCents: 0 },
          { group: "Adicionais", name: "Bacon", priceCents: 400 },
          { group: "Adicionais", name: "Cheddar", priceCents: 300 },
        ],
      },
    ],
    subtotalCents: 6400,
    deliveryFeeCents: 500,
    totalCents: 6900,
    fulfillment: "delivery",
    address: { street: "Rua Brasil", number: "123", neighborhood: "Centro", reference: "Perto da praça" },
    paymentMethod: "cash",
    changeForCents: 10000,
    notes: "",
    customer: { name: "Maria", phone: "+5555999991234" },
  };

  it("arma el pedido completo, legible en el celular", () => {
    expect(buildOrderMessage(order, store)).toBe(
      [
        "*Pedido #12 — Burger Demo*",
        "",
        "2x X-Burger — R$ 64,00",
        "   Ponto da carne: Ao ponto",
        "   Adicionais: Bacon (+R$ 4,00), Cheddar (+R$ 3,00)",
        "   Obs.: sem cebola",
        "",
        "Subtotal: R$ 64,00",
        "Taxa de entrega: R$ 5,00",
        "*Total: R$ 69,00*",
        "",
        "*Entrega:* Rua Brasil, 123 — Centro",
        "Referência: Perto da praça",
        "*Pagamento:* Dinheiro (troco para R$ 100,00)",
        "",
        "Cliente: Maria — +5555999991234",
      ].join("\n")
    );
  });

  it("en retiro con Pix muestra la chave y no la tarifa", () => {
    const message = buildOrderMessage({ ...order, fulfillment: "pickup", paymentMethod: "pix", deliveryFeeCents: 0 }, store);
    expect(message).toContain("*Retirada no local*");
    expect(message).toContain("*Pagamento:* Pix (chave: burger@pix.com)");
    expect(message).not.toContain("Taxa de entrega");
  });

  it("el link abre el WhatsApp del local con el texto codificado", () => {
    expect(buildWhatsappUrl("+5555999998888", "Olá *mundo*")).toBe("https://wa.me/5555999998888?text=Ol%C3%A1%20*mundo*");
  });
});

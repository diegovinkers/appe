import { describe, expect, it } from "vitest";
import { checkCoupon, couponDiscount } from "../../src/services/coupon.service.js";
import { availableSlots, checkScheduledTime } from "../../src/services/scheduling.service.js";
import { buildTicket, buildTicketHtml } from "../../src/services/ticket.service.js";
import { buildOrderMessage } from "../../src/services/whatsapp.service.js";

const code = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
};

describe("cupones", () => {
  const now = new Date("2026-09-25T15:00:00Z");
  const base = { active: true, type: "percent", value: 10, minOrderCents: 0, uses: 0, maxUses: null, maxUsesPerCustomer: null };
  const discount = (coupon, extra = {}) =>
    couponDiscount({ ...base, ...coupon }, { subtotalCents: 5000, deliveryFeeCents: 500, isDelivery: true, customerUses: 0, now, ...extra });

  it("calcula porcentaje, valor fijo y entrega grátis", () => {
    expect(discount({})).toBe(500);
    expect(discount({ value: 15 }, { subtotalCents: 3333 })).toBe(500); // redondea
    expect(discount({ type: "fixed", value: 700 })).toBe(700);
    expect(discount({ type: "free_delivery", value: 0 })).toBe(500);
  });

  it("nunca descuenta más que el subtotal", () => {
    expect(discount({ type: "fixed", value: 9000 })).toBe(5000);
    expect(discount({ value: 100 })).toBe(5000);
  });

  it.each([
    ["COUPON_INVALID", () => checkCoupon(null)],
    ["COUPON_INVALID", () => checkCoupon({ ...base, active: false })],
    ["COUPON_EXPIRED", () => checkCoupon({ ...base, startsAt: new Date("2026-10-01") }, { now })],
    ["COUPON_EXPIRED", () => checkCoupon({ ...base, endsAt: new Date("2026-09-25T15:00:00Z") }, { now })],
    ["COUPON_EXHAUSTED", () => checkCoupon({ ...base, maxUses: 5, uses: 5 }, { now })],
    ["COUPON_ALREADY_USED", () => checkCoupon({ ...base, maxUsesPerCustomer: 1 }, { now, customerUses: 1 })],
    ["COUPON_MIN_ORDER", () => discount({ minOrderCents: 6000 })],
    ["COUPON_NOT_APPLICABLE", () => discount({ type: "free_delivery" }, { isDelivery: false })],
  ])("rechaza con %s", (expected, fn) => {
    expect(code(fn)).toBe(expected);
  });
});

describe("franjas para pedidos programados", () => {
  // Viernes 2026-09-25 12:00 en Brasil. Abre todos los días 18:00–22:00.
  const now = new Date("2026-09-25T15:00:00Z");
  const evening = [{ open: "18:00", close: "22:00" }];
  const store = {
    hours: {
      weekly: { sun: evening, mon: evening, tue: evening, wed: evening, thu: evening, fri: evening, sat: evening },
      exceptions: [],
    },
    override: null,
    scheduling: { enabled: true, minLeadMinutes: 30, maxDaysAhead: 1, slotMinutes: 30 },
  };
  const iso = (dates) => dates.map((d) => d.toISOString());

  it("devuelve las franjas dentro del horario de hoy y mañana", () => {
    const slots = iso(availableSlots(store, now));
    expect(slots).toHaveLength(16); // 8 por día: 18:00 … 21:30
    expect(slots[0]).toBe("2026-09-25T21:00:00.000Z"); // hoy 18:00
    expect(slots.at(-1)).toBe("2026-09-27T00:30:00.000Z"); // mañana 21:30
  });

  it("respeta la anticipación mínima", () => {
    const at1830 = new Date("2026-09-25T21:30:00Z"); // ya abierto, 18:30
    const first = availableSlots(store, at1830)[0].toISOString();
    expect(first).toBe("2026-09-25T22:00:00.000Z"); // 19:00, no 18:30
  });

  it("un cierre manual con vencimiento saca las franjas de ese período", () => {
    const closedToday = { ...store, override: { mode: "closed", until: new Date("2026-09-26T03:00:00Z") } };
    expect(iso(availableSlots(closedToday, now))[0]).toBe("2026-09-26T21:00:00.000Z"); // mañana 18:00
  });

  it("sin programación no hay franjas y el pedido se rechaza", () => {
    const disabled = { ...store, scheduling: { ...store.scheduling, enabled: false } };
    expect(availableSlots(disabled, now)).toEqual([]);
    expect(code(() => checkScheduledTime(disabled, new Date("2026-09-25T21:00:00Z"), now))).toBe("SCHEDULING_NOT_AVAILABLE");
  });

  it("rechaza horarios fuera de franja", () => {
    expect(code(() => checkScheduledTime(store, new Date("2026-09-25T21:10:00Z"), now))).toBe("INVALID_SCHEDULE_TIME");
    expect(code(() => checkScheduledTime(store, new Date("2026-09-25T18:00:00Z"), now))).toBe("INVALID_SCHEDULE_TIME");
    expect(code(() => checkScheduledTime(store, new Date("2026-09-25T21:00:00Z"), now))).toBeNull();
  });
});

const order = {
  number: 12,
  channel: "phone",
  locale: "pt-BR",
  createdAt: new Date("2026-09-25T15:45:00Z"),
  scheduledFor: null,
  status: "confirmed",
  customer: { name: "Maria Souza <script>", phone: "+5555981112233" },
  fulfillment: "delivery",
  address: { street: "Rua Sete de Setembro", number: "412", neighborhood: "Centro", reference: "Casa verde, portão preto" },
  items: [
    {
      name: "X-Bacon com um nome bem comprido para testar a quebra",
      quantity: 2,
      totalCents: 7000,
      notes: "sem cebola",
      options: [
        { group: "Ponto da carne", name: "Ao ponto", priceCents: 0, quantity: 1, pricing: "sum" },
        { group: "Adicionais", name: "Bacon", priceCents: 400, quantity: 2, pricing: "sum" },
      ],
    },
  ],
  subtotalCents: 7000,
  discountCents: 700,
  coupon: { code: "DEMO10", type: "percent", value: 10 },
  deliveryFeeCents: 500,
  totalCents: 6800,
  paymentMethod: "cash",
  changeForCents: 10000,
  notes: "Tocar a campainha",
  internalNotes: "Cliente antigo",
  estimatedMinutes: { min: 40, max: 60 },
};
const store = { name: "Burger Demo", pixKey: "" };

describe("comanda", () => {
  it.each([58, 80])("en %i mm ninguna línea pasa el ancho", (paperWidth) => {
    const columns = paperWidth === 58 ? 32 : 48;
    const lines = buildTicket(order, store, { paperWidth }).trimEnd().split("\n");
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(columns);
  });

  it("trae todo lo que necesita la cocina y el repartidor", () => {
    const text = buildTicket(order, store, { paperWidth: 80 });
    for (const expected of [
      "BURGER DEMO",
      "PEDIDO #12",
      "TELEFONE",
      "25/09/2026 12:45",
      "Tel: +5555981112233",
      "ENTREGA: Rua Sete de Setembro, 412 - Centro",
      "Ref.: Casa verde, portão preto",
      "   Adicionais: 2x Bacon",
      "   Obs.: sem cebola",
      "Desconto (DEMO10)",
      "-R$ 7,00",
      "Pagamento: Dinheiro (troco p/ R$ 100,00)",
      "Obs. internas: Cliente antigo",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).toMatch(/TOTAL +R\$ 68,00/);
    expect(text).not.toContain(" ");
  });

  it("la versión HTML escapa el texto y fija el ancho del papel", () => {
    const html = buildTicketHtml(buildTicket(order, store), { paperWidth: 58 });
    expect(html).toContain("@page { size: 58mm auto; margin: 0; }");
    expect(html).toContain("Maria Souza &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("mensaje de WhatsApp: cupón, programado, seguimiento y español", () => {
  it("en portugués muestra el descuento y el link de seguimiento", () => {
    const message = buildOrderMessage(order, store, { trackingUrl: "https://app/pedido/abc" });
    expect(message).toContain("Desconto (DEMO10): -R$ 7,00");
    expect(message).toContain("   Adicionais: 2x Bacon (+R$ 8,00)");
    expect(message).toContain("Acompanhe o pedido: https://app/pedido/abc");
  });

  it("en español cambian las etiquetas, no los nombres del menú", () => {
    const message = buildOrderMessage({ ...order, locale: "es", scheduledFor: new Date("2026-09-26T21:30:00Z") }, store, {
      trackingUrl: "https://app/pedido/abc",
    });
    expect(message).toContain("*Programado para:* sáb 26/09 a las 18:30");
    expect(message).toContain("Envío: R$ 5,00");
    expect(message).toContain("Descuento (DEMO10): -R$ 7,00");
    expect(message).toContain("*Envío a:* Rua Sete de Setembro, 412 — Centro");
    expect(message).toContain("*Pago:* Efectivo (cambio para R$ 100,00)");
    expect(message).toContain("Seguí tu pedido: https://app/pedido/abc");
    expect(message).toContain("X-Bacon com um nome");
    // Un programado no muestra la previsión en minutos.
    expect(message).not.toContain("Entrega estimada");
  });
});

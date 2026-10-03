import { describe, expect, it } from "vitest";
import { isCategoryAvailable } from "../../src/services/opening.service.js";
import { activePromoPrice, effectivePrice, fromPrice, groupCost } from "../../src/services/pricing.service.js";

const now = new Date("2026-09-25T15:00:00Z"); // viernes 12:00 en Brasil

describe("effectivePrice", () => {
  const product = { priceCents: 3000, promoPriceCents: 2500, promoStartsAt: null, promoEndsAt: null };

  it("usa el promocional sin vigencia", () => {
    expect(effectivePrice(product, now)).toBe(2500);
    expect(activePromoPrice(product, now)).toBe(2500);
  });

  it("respeta el inicio y el fin de la promoción", () => {
    expect(effectivePrice({ ...product, promoStartsAt: new Date("2026-09-26T00:00:00Z") }, now)).toBe(3000);
    expect(effectivePrice({ ...product, promoEndsAt: new Date("2026-09-25T15:00:00Z") }, now)).toBe(3000);
    expect(effectivePrice({ ...product, promoEndsAt: new Date("2026-09-25T16:00:00Z") }, now)).toBe(2500);
  });

  it("ignora un promocional que no es más barato", () => {
    expect(effectivePrice({ ...product, promoPriceCents: 3500 }, now)).toBe(3000);
    expect(activePromoPrice({ ...product, promoPriceCents: null }, now)).toBeNull();
  });
});

describe("groupCost", () => {
  const picks = [
    { priceCents: 3000, quantity: 1 },
    { priceCents: 3600, quantity: 1 },
  ];

  it("sum: suma cada opción por su cantidad", () => {
    expect(groupCost("sum", [{ priceCents: 400, quantity: 2 }, { priceCents: 300, quantity: 1 }])).toBe(1100);
  });

  it("max: vale la más cara (pizza meio a meio)", () => {
    expect(groupCost("max", picks)).toBe(3600);
  });

  it("average: el promedio redondeado", () => {
    expect(groupCost("average", picks)).toBe(3300);
    expect(groupCost("average", [{ priceCents: 1000, quantity: 2 }, { priceCents: 2001, quantity: 1 }])).toBe(1334);
  });

  it("sin opciones no suma nada", () => {
    expect(groupCost("max", [])).toBe(0);
  });
});

describe("fromPrice", () => {
  const option = (priceCents, extra = {}) => ({ priceCents, available: true, maxQuantity: 1, ...extra });
  const sabores = { minSelect: 1, maxSelect: 2, pricing: "max", options: [option(3600), option(3000), option(4200)] };
  const adicionais = { minSelect: 0, maxSelect: 5, pricing: "sum", options: [option(400)] };
  const pizza = { priceCents: 0, promoPriceCents: null };

  it("suma lo mínimo obligatorio con las opciones más baratas", () => {
    expect(fromPrice(pizza, [sabores, adicionais], now)).toBe(3000);
  });

  it("repite la más barata hasta su cantidad máxima", () => {
    const doble = { minSelect: 2, maxSelect: 2, pricing: "sum", options: [option(200, { maxQuantity: 2 }), option(100)] };
    expect(fromPrice({ priceCents: 1000 }, [doble], now)).toBe(1300); // 100 + 200
  });

  it("parte del precio promocional vigente", () => {
    expect(fromPrice({ priceCents: 3000, promoPriceCents: 2000 }, [], now)).toBe(2000);
  });

  it("es null si un grupo obligatorio no tiene opciones disponibles", () => {
    const agotado = { ...sabores, options: sabores.options.map((o) => ({ ...o, available: false })) };
    expect(fromPrice(pizza, [agotado], now)).toBeNull();
  });
});

describe("isCategoryAvailable", () => {
  const cafe = { schedule: { days: [], from: "07:00", to: "11:00" } };

  it("sin horario siempre está disponible", () => {
    expect(isCategoryAvailable({ schedule: null }, now)).toBe(true);
  });

  it("solo dentro de su horario", () => {
    expect(isCategoryAvailable(cafe, new Date("2026-09-25T11:00:00Z"))).toBe(true); // 08:00
    expect(isCategoryAvailable(cafe, now)).toBe(false); // 12:00
  });

  it("solo en los días elegidos", () => {
    const weekend = { schedule: { days: ["sat", "sun"], from: "07:00", to: "11:00" } };
    expect(isCategoryAvailable(weekend, new Date("2026-09-25T11:00:00Z"))).toBe(false); // viernes
    expect(isCategoryAvailable(weekend, new Date("2026-09-26T11:00:00Z"))).toBe(true); // sábado
  });
});

import { describe, expect, it } from "vitest";
import type { PublicOptionGroup, PublicProduct, PublicStore } from "../../api/types";
import { lineKey } from "./cart";
import { indexMenu, resolveLines } from "./lines";
import { groupCost, orderTotals, unitPrice, unmetGroups } from "./pricing";

const product = (changes: Partial<PublicProduct> = {}): PublicProduct => ({
  _id: "p1",
  name: "X-Bacon",
  description: "",
  priceCents: 3200,
  promoPriceCents: null,
  fromPriceCents: 3200,
  imageUrl: "",
  tags: [],
  available: true,
  optionGroups: ["ponto", "extras"],
  ...changes,
});
const option = (_id: string, priceCents = 0, changes = {}) => ({ _id, name: _id, priceCents, maxQuantity: 1, available: true, ...changes });
const ponto: PublicOptionGroup = {
  _id: "ponto",
  name: "Ponto da carne",
  minSelect: 1,
  maxSelect: 1,
  pricing: "sum",
  options: [option("mal"), option("ao-ponto")],
};
const extras: PublicOptionGroup = {
  _id: "extras",
  name: "Adicionais",
  minSelect: 0,
  maxSelect: 3,
  pricing: "sum",
  options: [option("bacon", 400, { maxQuantity: 2 }), option("cheddar", 300)],
};
const groups = new Map([ponto, extras].map((group) => [group._id, group]));

describe("precio de un producto (igual que el backend)", () => {
  it("suma las opciones elegidas, con su cantidad", () => {
    const chosen = [
      { groupId: "ponto", optionId: "ao-ponto", quantity: 1 },
      { groupId: "extras", optionId: "bacon", quantity: 2 },
      { groupId: "extras", optionId: "cheddar", quantity: 1 },
    ];
    expect(unitPrice(product(), groups, chosen)).toBe(3200 + 800 + 300);
  });

  it("usa el precio de promoción vigente", () => {
    expect(unitPrice(product({ promoPriceCents: 2800 }), groups, [])).toBe(2800);
  });

  it("pizza meio a meio: el sabor más caro o el promedio", () => {
    const halves = [
      { priceCents: 4000, quantity: 1 },
      { priceCents: 5000, quantity: 1 },
    ];
    expect(groupCost("max", halves)).toBe(5000);
    expect(groupCost("average", halves)).toBe(4500);
    expect(groupCost("sum", halves)).toBe(9000);
  });

  it("avisa qué grupo obligatorio falta", () => {
    expect(unmetGroups(product(), groups, []).map((group) => group.name)).toEqual(["Ponto da carne"]);
    expect(unmetGroups(product(), groups, [{ groupId: "ponto", optionId: "mal", quantity: 1 }])).toEqual([]);
  });
});

const store: Pick<PublicStore, "deliveryFeeCents" | "deliveryZones" | "deliveryMode" | "freeDeliveryFromCents" | "minOrderCents"> = {
  deliveryMode: "zones",
  deliveryFeeCents: 500,
  deliveryZones: [
    { _id: "centro", name: "Centro", feeCents: 400, minOrderCents: null, estimateMin: null, estimateMax: null },
    { _id: "longe", name: "Longe", feeCents: 1000, minOrderCents: 5000, estimateMin: 50, estimateMax: 80 },
  ],
  freeDeliveryFromCents: 8000,
  minOrderCents: 2000,
};

describe("totales del pedido", () => {
  it("la entrega es la del barrio, y gratis desde el valor del local", () => {
    expect(orderTotals({ store, subtotalCents: 3000, fulfillment: "delivery", zoneId: "centro" })).toMatchObject({
      deliveryFeeCents: 400,
      totalCents: 3400,
      feePending: false,
    });
    expect(orderTotals({ store, subtotalCents: 8000, fulfillment: "delivery", zoneId: "longe" }).deliveryFeeCents).toBe(0);
  });

  it("sin barrio elegido la entrega queda pendiente, no se inventa", () => {
    expect(orderTotals({ store, subtotalCents: 3000, fulfillment: "delivery" })).toMatchObject({ deliveryFeeCents: 0, feePending: true });
  });

  it("mínimo de entrega: el del barrio si tiene, si no el del local; en retirada no hay", () => {
    expect(orderTotals({ store, subtotalCents: 1500, fulfillment: "delivery", zoneId: "centro" }).missingForMinimumCents).toBe(500);
    expect(orderTotals({ store, subtotalCents: 3000, fulfillment: "delivery", zoneId: "longe" }).missingForMinimumCents).toBe(2000);
    expect(orderTotals({ store, subtotalCents: 1500, fulfillment: "pickup" }).missingForMinimumCents).toBe(0);
  });

  it("cupones: porcentaje, valor fijo y entrega grátis", () => {
    const coupon = (type: "percent" | "fixed" | "free_delivery", value: number) => ({ code: "X", type, value, minOrderCents: 0 });
    expect(orderTotals({ store, subtotalCents: 5000, fulfillment: "pickup", coupon: coupon("percent", 10) }).discountCents).toBe(500);
    expect(orderTotals({ store, subtotalCents: 1000, fulfillment: "pickup", coupon: coupon("fixed", 1500) }).discountCents).toBe(1000);
    const free = orderTotals({ store, subtotalCents: 3000, fulfillment: "delivery", zoneId: "centro", coupon: coupon("free_delivery", 0) });
    expect(free).toMatchObject({ discountCents: 400, totalCents: 3000 });
  });
});

describe("carrito", () => {
  it("mismo producto con las mismas opciones es la misma línea, en cualquier orden", () => {
    const a = [
      { groupId: "extras", optionId: "bacon", quantity: 1 },
      { groupId: "extras", optionId: "cheddar", quantity: 1 },
    ];
    expect(lineKey("p1", a, " sem cebola ")).toBe(lineKey("p1", [...a].reverse(), "sem cebola"));
    expect(lineKey("p1", a, "")).not.toBe(lineKey("p1", a, "sem cebola"));
  });

  it("marca lo que ya no se puede pedir y calcula el resto", () => {
    const menu = indexMenu([
      {
        _id: "c1",
        name: "Lanches",
        availableNow: true,
        schedule: null,
        products: [product(), product({ _id: "p2", name: "Onion rings", available: false, optionGroups: [] })],
      },
    ]);
    const lines = resolveLines(
      [
        { key: "1", productId: "p1", quantity: 2, options: [{ groupId: "ponto", optionId: "mal", quantity: 1 }], notes: "" },
        { key: "2", productId: "p2", quantity: 1, options: [], notes: "" },
        { key: "3", productId: "borrado", quantity: 1, options: [], notes: "" },
      ],
      menu,
      groups
    );
    expect(lines.map((line) => [line.available, line.totalCents, line.optionsText])).toEqual([
      [true, 6400, "mal"],
      [false, 3200, ""],
      [false, 0, ""],
    ]);
  });
});

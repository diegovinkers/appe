import { describe, expect, it } from "vitest";
import { priceOrder } from "../../src/services/order.service.js";

const id = (n) => n.toString(16).padStart(24, "0");

const store = {
  fulfillment: { delivery: true, pickup: true },
  paymentMethods: ["cash", "pix", "card"],
  deliveryMode: "fixed",
  deliveryFeeCents: 500,
  deliveryZones: [],
  freeDeliveryFromCents: null,
  minOrderCents: 0,
  estimates: { deliveryMin: 40, deliveryMax: 60, pickupMin: 20, pickupMax: 30 },
};
const OPEN = { status: "open", acceptingOrders: true, message: "", pausedUntil: null, nextOpenAt: null };
const option = (n, name, priceCents = 0, available = true) => ({ _id: id(n), name, priceCents, available });
const ponto = {
  _id: id(10),
  name: "Ponto da carne",
  minSelect: 1,
  maxSelect: 1,
  options: [option(11, "Mal passado"), option(12, "Ao ponto")],
};
const adicionais = {
  _id: id(20),
  name: "Adicionais",
  minSelect: 0,
  maxSelect: 2,
  options: [option(21, "Bacon", 400), option(22, "Cheddar", 300), option(23, "Ovo", 200, false)],
};
const burger = { _id: id(1), category: id(100), name: "X-Burger", priceCents: 2500, available: true, optionGroups: [id(10), id(20)] };
const coca = { _id: id(2), category: id(101), name: "Coca", priceCents: 600, available: true, optionGroups: [] };

const pick = (group, optionN) => ({ groupId: group._id, optionId: id(optionN) });
const burgerItem = (options = [pick(ponto, 12)], quantity = 1) => ({ productId: burger._id, quantity, options });
const cocaItem = { productId: coca._id, quantity: 1, options: [] };

const CATEGORIES = [
  { _id: id(100), name: "Lanches", schedule: null },
  { _id: id(101), name: "Bebidas", schedule: null },
];

function run(input, { storeChanges = {}, opening = OPEN, products = [burger, coca], active = [id(100), id(101)] } = {}) {
  return priceOrder({
    input: {
      fulfillment: "delivery",
      address: { street: "Rua Brasil", number: "10", neighborhood: "Centro" },
      paymentMethod: "cash",
      items: [cocaItem],
      ...input,
    },
    store: { ...store, ...storeChanges },
    opening,
    products,
    categories: CATEGORIES.filter((category) => active.includes(category._id)),
    groups: [ponto, adicionais],
  });
}

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`esperaba el error ${code} y no se lanzó ninguno`);
}

describe("priceOrder", () => {
  it("calcula ítems, subtotal, entrega y total con los precios de la base", () => {
    const result = run({ items: [burgerItem([pick(ponto, 12), pick(adicionais, 21), pick(adicionais, 22)], 2), cocaItem] });
    expect(result.items[0]).toMatchObject({ name: "X-Burger", unitPriceCents: 2500, quantity: 2, totalCents: 6400 });
    expect(result).toMatchObject({ subtotalCents: 7000, deliveryFeeCents: 500, totalCents: 7500, changeForCents: null });
  });

  it("ordena las opciones como en el menú, no como llegan", () => {
    const result = run({ items: [burgerItem([pick(adicionais, 22), pick(adicionais, 21), pick(ponto, 12)])] });
    expect(result.items[0].options.map((o) => o.name)).toEqual(["Ao ponto", "Bacon", "Cheddar"]);
    expect(result.items[0].options[1]).toMatchObject({ group: "Adicionais", priceCents: 400 });
  });

  it("en retiro no cobra entrega ni exige el mínimo", () => {
    const result = run({ fulfillment: "pickup" }, { storeChanges: { minOrderCents: 100_000 } });
    expect(result).toMatchObject({ deliveryFeeCents: 0, totalCents: 600 });
  });

  it("guarda el troco en dinheiro y lo ignora en otras formas de pago", () => {
    expect(run({ changeForCents: 5000 }).changeForCents).toBe(5000);
    expect(run({ paymentMethod: "pix", changeForCents: 5000 }).changeForCents).toBeNull();
  });

  it.each([
    ["STORE_CLOSED", {}, { opening: { ...OPEN, status: "closed", acceptingOrders: false } }],
    ["STORE_PAUSED", {}, { opening: { ...OPEN, status: "paused", acceptingOrders: false, message: "Voltamos já" } }],
    ["VALIDATION_ERROR", { address: { street: "Rua Brasil", number: "10" } }, {}],
    ["FULFILLMENT_NOT_AVAILABLE", {}, { storeChanges: { fulfillment: { delivery: false, pickup: true } } }],
    ["PAYMENT_METHOD_NOT_AVAILABLE", { paymentMethod: "pix" }, { storeChanges: { paymentMethods: ["cash"] } }],
    ["PRODUCT_NOT_FOUND", { items: [{ productId: id(999), quantity: 1, options: [] }] }, {}],
    ["PRODUCT_UNAVAILABLE", {}, { products: [burger, { ...coca, available: false }] }],
    ["PRODUCT_UNAVAILABLE", {}, { active: [id(100)] }],
    ["INVALID_OPTION", { items: [{ ...cocaItem, options: [pick(ponto, 12)] }] }, {}],
    ["INVALID_OPTION", { items: [burgerItem([pick(ponto, 999)])] }, {}],
    ["INVALID_OPTION", { items: [burgerItem([pick(ponto, 12), pick(adicionais, 21), pick(adicionais, 21)])] }, {}],
    ["OPTION_UNAVAILABLE", { items: [burgerItem([pick(ponto, 12), pick(adicionais, 23)])] }, {}],
    ["OPTION_SELECTION_INVALID", { items: [burgerItem([])] }, {}],
    ["OPTION_SELECTION_INVALID", { items: [burgerItem([pick(ponto, 11), pick(ponto, 12)])] }, {}],
    ["MIN_ORDER_NOT_REACHED", {}, { storeChanges: { minOrderCents: 5000 } }],
    ["INVALID_CHANGE", { changeForCents: 1000 }, {}],
  ])("rechaza con %s", (code, input, context) => {
    expectCode(() => run(input, context), code);
  });
});

// Cálculo de un pedido. Función pura: recibe todo cargado de la base y no la toca,
// así se puede testear sin MongoDB. Los precios salen siempre de la base; lo que
// mande el cliente como precio ni siquiera llega acá (el schema lo descarta).
import { badRequest, conflict } from "../lib/errors.js";
import { isCategoryAvailable } from "./opening.service.js";
import { couponDiscount } from "./coupon.service.js";
import { effectivePrice, groupCost } from "./pricing.service.js";

const byId = (docs) => new Map(docs.map((doc) => [String(doc._id), doc]));

/**
 * @param {object} args
 * @param {object} args.input         Pedido validado por createOrderSchema.
 * @param {object} args.store         El local (entrega, barrios, pagos, mínimos, tiempos estimados).
 * @param {object} args.opening       Estado de apertura (getOpeningStatus).
 * @param {object[]} args.products    Productos del local que aparecen en el pedido.
 * @param {object[]} args.categories  Categorías activas de esos productos.
 * @param {object[]} args.groups      Grupos de opciones del local usados por esos productos.
 * @param {object|null} [args.coupon] El cupón del código que mandó el cliente (null si no existe).
 * @param {number} [args.customerUses] Pedidos de este teléfono que ya usaron el cupón.
 * @param {boolean} [args.manual]     Pedido cargado en el panel: no exige local abierto ni mínimo.
 * @param {Date} [args.now]           Para el precio vigente (promociones).
 * @param {Date} [args.serviceAt]     Para qué momento es el pedido (programado): horario de las categorías.
 * @returns {{ items, subtotalCents, deliveryFeeCents, discountCents, coupon, totalCents, changeForCents, estimatedMinutes, zone, stock }}
 *   `stock`: unidades a descontar de los productos con stock controlado.
 */
export function priceOrder({
  input,
  store,
  opening,
  products,
  categories,
  groups,
  coupon = null,
  customerUses = 0,
  manual = false,
  now = new Date(),
  serviceAt = now,
}) {
  if (!manual) checkOpening(opening);
  if (!store.fulfillment[input.fulfillment]) {
    const label = input.fulfillment === "delivery" ? "Entrega" : "Retirada";
    throw badRequest("FULFILLMENT_NOT_AVAILABLE", `${label} não disponível neste estabelecimento`);
  }
  if (!store.paymentMethods.includes(input.paymentMethod)) {
    throw badRequest("PAYMENT_METHOD_NOT_AVAILABLE", "Forma de pagamento não aceita neste estabelecimento");
  }

  const isDelivery = input.fulfillment === "delivery";
  const zone = isDelivery ? resolveZone(store, input.address) : null;

  const context = { products: byId(products), categories: byId(categories), groups: byId(groups), now, serviceAt };
  const items = input.items.map((item) => priceItem(item, context));
  const stock = checkStock(input.items, context.products);
  const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);

  // El barrio puede tener su propio mínimo; si no, vale el general del local.
  const minOrderCents = isDelivery && !manual ? (zone?.minOrderCents ?? store.minOrderCents) : 0;
  if (minOrderCents > 0 && subtotalCents < minOrderCents) {
    throw conflict("MIN_ORDER_NOT_REACHED", "O pedido não atinge o valor mínimo para entrega", { minOrderCents });
  }

  let deliveryFeeCents = 0;
  if (isDelivery) {
    const freeDelivery = store.freeDeliveryFromCents != null && subtotalCents >= store.freeDeliveryFromCents;
    deliveryFeeCents = freeDelivery ? 0 : (zone?.feeCents ?? store.deliveryFeeCents);
  }
  // Un cupón por pedido: descuenta del subtotal, o la entrega si es free_delivery.
  const discountCents = input.couponCode
    ? couponDiscount(coupon, { subtotalCents, deliveryFeeCents, isDelivery, customerUses, now })
    : 0;
  const totalCents = subtotalCents - discountCents + deliveryFeeCents;

  const { estimates } = store;
  const estimatedMinutes = isDelivery
    ? { min: zone?.estimateMin ?? estimates.deliveryMin, max: zone?.estimateMax ?? estimates.deliveryMax }
    : { min: estimates.pickupMin, max: estimates.pickupMax };

  let changeForCents = null;
  if (input.paymentMethod === "cash" && input.changeForCents != null) {
    if (input.changeForCents < totalCents) {
      throw badRequest("INVALID_CHANGE", "O troco precisa ser para um valor maior ou igual ao total");
    }
    changeForCents = input.changeForCents;
  }

  return {
    items,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    coupon: input.couponCode ? { code: coupon.code, type: coupon.type, value: coupon.value } : null,
    totalCents,
    changeForCents,
    estimatedMinutes,
    zone: zone && { _id: zone._id, name: zone.name },
    stock,
  };
}

function checkOpening(opening) {
  if (opening.status === "paused") {
    throw conflict("STORE_PAUSED", opening.message || "O estabelecimento pausou os pedidos por alguns minutos", {
      pausedUntil: opening.pausedUntil,
    });
  }
  if (!opening.acceptingOrders) {
    throw conflict("STORE_CLOSED", "O estabelecimento está fechado agora", { nextOpenAt: opening.nextOpenAt });
  }
}

// En modo "zones" el cliente elige un barrio activo de la lista; en "fixed" escribe el suyo.
function resolveZone(store, address) {
  if (store.deliveryMode !== "zones") {
    if (!address.neighborhood) {
      throw badRequest("VALIDATION_ERROR", "Dados inválidos", [
        { location: "body", path: "address.neighborhood", message: "Informe o bairro" },
      ]);
    }
    return null;
  }
  const zone = store.deliveryZones.find((z) => z.active && String(z._id) === address.zoneId);
  if (!zone) throw badRequest("DELIVERY_ZONE_NOT_AVAILABLE", "Não entregamos nesse bairro. Escolha um da lista.");
  return zone;
}

// Suma las unidades por producto (puede venir en varias líneas) y chequea el stock.
// La transacción que crea el pedido lo vuelve a chequear al descontarlo.
function checkStock(items, products) {
  const units = new Map();
  for (const item of items) units.set(item.productId, (units.get(item.productId) ?? 0) + item.quantity);

  const stock = [];
  for (const [productId, quantity] of units) {
    const product = products.get(productId);
    if (!product.trackStock) continue;
    if (product.stock < quantity) {
      throw conflict(
        "OUT_OF_STOCK",
        product.stock > 0 ? `Só restam ${product.stock} unidades de ${product.name}` : `${product.name} está esgotado`,
        { productId, available: product.stock }
      );
    }
    stock.push({ product: product._id, quantity });
  }
  return stock;
}

function priceItem(item, { products, categories, groups, now, serviceAt }) {
  const product = products.get(item.productId);
  if (!product) throw badRequest("PRODUCT_NOT_FOUND", "Produto não encontrado", { productId: item.productId });

  const category = categories.get(String(product.category));
  if (!product.available || !category) {
    throw conflict("PRODUCT_UNAVAILABLE", `${product.name} está esgotado`, { productId: item.productId });
  }
  if (!isCategoryAvailable(category, serviceAt)) {
    const { from, to } = category.schedule;
    throw conflict("CATEGORY_NOT_AVAILABLE_NOW", `${category.name}: disponível das ${from} às ${to}`, {
      productId: item.productId,
      categoryId: String(category._id),
    });
  }

  const productGroups = product.optionGroups.map(String);
  const chosen = new Map(productGroups.map((groupId) => [groupId, []]));
  const seen = new Set();

  for (const { groupId, optionId, quantity = 1 } of item.options) {
    const group = chosen.has(groupId) ? groups.get(groupId) : null;
    const option = group?.options.find((o) => String(o._id) === optionId);
    // La misma opción dos veces se pide con quantity, no repitiéndola.
    if (!option || seen.has(optionId) || quantity > (option.maxQuantity ?? 1)) {
      throw badRequest("INVALID_OPTION", `Opção inválida para ${product.name}`, { productId: item.productId, optionId });
    }
    if (!option.available) {
      throw conflict("OPTION_UNAVAILABLE", `${option.name} está esgotado`, { productId: item.productId, optionId });
    }
    seen.add(optionId);
    chosen.get(groupId).push({ option, quantity });
  }

  // Opciones en el orden de los grupos del producto y de las opciones dentro del grupo.
  const options = [];
  let optionsCents = 0;
  for (const groupId of productGroups) {
    const group = groups.get(groupId);
    if (!group) continue;
    const picks = chosen.get(groupId);
    const units = picks.reduce((sum, pick) => sum + pick.quantity, 0);
    if (units < group.minSelect || units > group.maxSelect) {
      throw badRequest("OPTION_SELECTION_INVALID", selectionMessage(group, product), {
        productId: item.productId,
        groupId,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
      });
    }
    const order = group.options.map((o) => String(o._id));
    picks.sort((a, b) => order.indexOf(String(a.option._id)) - order.indexOf(String(b.option._id)));
    optionsCents += groupCost(
      group.pricing ?? "sum",
      picks.map(({ option, quantity }) => ({ priceCents: option.priceCents, quantity }))
    );
    for (const { option, quantity } of picks) {
      options.push({
        groupId: group._id,
        optionId: option._id,
        group: group.name,
        pricing: group.pricing ?? "sum",
        name: option.name,
        priceCents: option.priceCents,
        quantity,
      });
    }
  }

  const unitPriceCents = effectivePrice(product, now);
  return {
    product: product._id,
    name: product.name,
    unitPriceCents,
    quantity: item.quantity,
    options,
    // Lo que suman las opciones por unidad, ya aplicada la regla de cada grupo.
    optionsCents,
    notes: item.notes ?? "",
    totalCents: (unitPriceCents + optionsCents) * item.quantity,
    stockTracked: Boolean(product.trackStock),
  };
}

function selectionMessage(group, product) {
  const { minSelect: min, maxSelect: max, name } = group;
  if (min === max) return `Escolha ${min} ${min === 1 ? "opção" : "opções"} em "${name}" (${product.name})`;
  if (min === 0) return `Escolha até ${max} ${max === 1 ? "opção" : "opções"} em "${name}" (${product.name})`;
  return `Escolha de ${min} a ${max} opções em "${name}" (${product.name})`;
}

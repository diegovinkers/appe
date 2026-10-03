// Reglas de precio del menú. Funciones puras: las usan el cálculo del pedido y el menú público.

// Precio que vale ahora: el promocional si es menor y está dentro de su vigencia.
export function effectivePrice(product, now = new Date()) {
  const promo = product.promoPriceCents;
  if (promo == null || promo >= product.priceCents) return product.priceCents;
  if (product.promoStartsAt && now < product.promoStartsAt) return product.priceCents;
  if (product.promoEndsAt && now >= product.promoEndsAt) return product.priceCents;
  return promo;
}

// El promocional vigente, o null si no hay promoción ahora.
export function activePromoPrice(product, now = new Date()) {
  const price = effectivePrice(product, now);
  return price < product.priceCents ? price : null;
}

/**
 * Cuánto suman las opciones elegidas de un grupo, según su regla.
 * @param {"sum" | "max" | "average"} pricing
 * @param {{ priceCents: number, quantity: number }[]} picks
 */
export function groupCost(pricing, picks) {
  if (!picks.length) return 0;
  if (pricing === "max") return Math.max(...picks.map((pick) => pick.priceCents));
  const total = picks.reduce((sum, pick) => sum + pick.priceCents * pick.quantity, 0);
  if (pricing === "average") {
    const units = picks.reduce((sum, pick) => sum + pick.quantity, 0);
    return Math.round(total / units);
  }
  return total;
}

// Precio más bajo con el que se puede pedir el producto, eligiendo lo mínimo obligatorio
// de cada grupo con las opciones disponibles más baratas ("a partir de R$ X").
// null si algún grupo obligatorio no tiene opciones suficientes: no se puede pedir.
export function fromPrice(product, groups, now = new Date()) {
  let total = effectivePrice(product, now);
  for (const group of groups) {
    if (!group.minSelect) continue;
    const cheapest = group.options
      .filter((option) => option.available)
      .sort((a, b) => a.priceCents - b.priceCents)
      .flatMap((option) => Array(option.maxQuantity ?? 1).fill(option.priceCents))
      .slice(0, group.minSelect);
    if (cheapest.length < group.minSelect) return null;
    total += groupCost(group.pricing ?? "sum", cheapest.map((priceCents) => ({ priceCents, quantity: 1 })));
  }
  return total;
}

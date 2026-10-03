import type { Coupon, PublicOptionGroup, PublicProduct, PublicStore } from "../../api/types";

// Las mismas reglas que el backend (src/services/pricing.service.js, order.service.js y
// coupon.service.js), para mostrar precios mientras se arma el pedido. El total que vale
// es el que calcula el servidor al recibirlo.

export type ChosenOption = { groupId: string; optionId: string; quantity: number };
export type Groups = Map<string, PublicOptionGroup>;

// El precio que vale ahora: el servidor ya manda la promoción vigente.
export const currentPrice = (product: PublicProduct) => product.promoPriceCents ?? product.priceCents;

// Cuánto suman las opciones de un grupo según su regla (en pizza meio a meio, "max" o "average").
export function groupCost(pricing: PublicOptionGroup["pricing"], picks: { priceCents: number; quantity: number }[]) {
  if (!picks.length) return 0;
  if (pricing === "max") return Math.max(...picks.map((pick) => pick.priceCents));
  const total = picks.reduce((sum, pick) => sum + pick.priceCents * pick.quantity, 0);
  if (pricing === "average") return Math.round(total / picks.reduce((sum, pick) => sum + pick.quantity, 0));
  return total;
}

// Precio de una unidad con las opciones elegidas.
export function unitPrice(product: PublicProduct, groups: Groups, chosen: ChosenOption[]) {
  let total = currentPrice(product);
  for (const groupId of product.optionGroups) {
    const group = groups.get(groupId);
    if (!group) continue;
    const picks = chosen
      .filter((pick) => pick.groupId === groupId)
      .map((pick) => ({ priceCents: group.options.find((option) => option._id === pick.optionId)?.priceCents ?? 0, quantity: pick.quantity }));
    total += groupCost(group.pricing, picks);
  }
  return total;
}

// Grupos del producto donde lo elegido no alcanza el mínimo (o pasa el máximo).
export function unmetGroups(product: PublicProduct, groups: Groups, chosen: ChosenOption[]): PublicOptionGroup[] {
  return product.optionGroups
    .map((groupId) => groups.get(groupId))
    .filter((group): group is PublicOptionGroup => {
      if (!group) return false;
      const units = chosen.filter((pick) => pick.groupId === group._id).reduce((sum, pick) => sum + pick.quantity, 0);
      return units < group.minSelect || units > group.maxSelect;
    });
}

export type Totals = {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  // Lo que falta para el mínimo de entrega (0 si ya llega o si es retirada).
  missingForMinimumCents: number;
  // Entrega por barrio sin barrio elegido: todavía no se sabe cuánto cuesta.
  feePending: boolean;
};

type TotalsInput = {
  store: Pick<PublicStore, "deliveryFeeCents" | "deliveryZones" | "deliveryMode" | "freeDeliveryFromCents" | "minOrderCents">;
  subtotalCents: number;
  fulfillment: "delivery" | "pickup";
  zoneId?: string;
  coupon?: Coupon | null;
};

export function orderTotals({ store, subtotalCents, fulfillment, zoneId, coupon }: TotalsInput): Totals {
  const isDelivery = fulfillment === "delivery";
  const zone = isDelivery && store.deliveryMode === "zones" ? store.deliveryZones.find((z) => z._id === zoneId) : undefined;

  const feePending = isDelivery && store.deliveryMode === "zones" && !zone;
  let deliveryFeeCents = 0;
  if (isDelivery && !feePending) {
    const free = store.freeDeliveryFromCents != null && subtotalCents >= store.freeDeliveryFromCents;
    deliveryFeeCents = free ? 0 : (zone?.feeCents ?? store.deliveryFeeCents);
  }

  let discountCents = 0;
  if (coupon && subtotalCents >= coupon.minOrderCents) {
    if (coupon.type === "free_delivery") discountCents = isDelivery ? deliveryFeeCents : 0;
    else if (coupon.type === "percent") discountCents = Math.min(subtotalCents, Math.round((subtotalCents * coupon.value) / 100));
    else discountCents = Math.min(subtotalCents, coupon.value);
  }

  const minimum = isDelivery ? (zone?.minOrderCents ?? store.minOrderCents) : 0;
  return {
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents: subtotalCents - discountCents + deliveryFeeCents,
    missingForMinimumCents: Math.max(0, minimum - subtotalCents),
    feePending,
  };
}

// Reglas de los cupones. Funciones puras: las usan el pedido y el endpoint que valida un cupón.
import { badRequest } from "../lib/errors.js";
import { formatBRL } from "../lib/money.js";

// Lo que no depende del pedido: que exista, esté activo, vigente y le queden usos.
// `customerUses`: cuántos pedidos (no cancelados) de este teléfono ya lo usaron.
export function checkCoupon(coupon, { now = new Date(), customerUses = 0 } = {}) {
  if (!coupon || !coupon.active) throw badRequest("COUPON_INVALID", "Cupom inválido");
  if (coupon.startsAt && now < coupon.startsAt) throw badRequest("COUPON_EXPIRED", "Esse cupom ainda não está valendo");
  if (coupon.endsAt && now >= coupon.endsAt) throw badRequest("COUPON_EXPIRED", "Esse cupom expirou");
  if (coupon.maxUses != null && coupon.uses >= coupon.maxUses) {
    throw badRequest("COUPON_EXHAUSTED", "Esse cupom já esgotou");
  }
  if (coupon.maxUsesPerCustomer != null && customerUses >= coupon.maxUsesPerCustomer) {
    throw badRequest("COUPON_ALREADY_USED", "Você já usou esse cupom");
  }
}

/**
 * Descuento del cupón en centavos. Un cupón por pedido; nunca deja el total negativo.
 * percent y fixed descuentan del subtotal; free_delivery descuenta la entrega.
 */
export function couponDiscount(coupon, { subtotalCents, deliveryFeeCents, isDelivery, customerUses, now }) {
  checkCoupon(coupon, { now, customerUses });
  if (subtotalCents < coupon.minOrderCents) {
    throw badRequest("COUPON_MIN_ORDER", `Esse cupom vale para pedidos a partir de ${formatBRL(coupon.minOrderCents)}`, {
      minOrderCents: coupon.minOrderCents,
    });
  }
  if (coupon.type === "free_delivery") {
    if (!isDelivery) throw badRequest("COUPON_NOT_APPLICABLE", "Esse cupom vale só para entrega");
    return deliveryFeeCents;
  }
  if (coupon.type === "percent") return Math.min(subtotalCents, Math.round((subtotalCents * coupon.value) / 100));
  return Math.min(subtotalCents, coupon.value);
}

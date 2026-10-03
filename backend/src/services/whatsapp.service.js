// Mensaje de WhatsApp del pedido, pensado para leerse en un celular. Lo manda el cliente
// al local, así que las etiquetas van en su idioma (pt-BR o es); los nombres de los
// productos quedan como están en el menú, para que el local los reconozca.
// Usa el formato de WhatsApp: *negrita*.
import { TIME_ZONE } from "../lib/dates.js";
import { formatBRL } from "../lib/money.js";

const LABELS = {
  "pt-BR": {
    intl: "pt-BR",
    subtotal: "Subtotal",
    deliveryFee: "Taxa de entrega",
    discount: "Desconto",
    deliveryEta: "Previsão de entrega",
    pickupEta: "Pronto para retirar em",
    delivery: "Entrega",
    reference: "Referência",
    pickup: "Retirada no local",
    payment: "Pagamento",
    cash: (change) => (change ? `Dinheiro (troco para ${change})` : "Dinheiro (sem troco)"),
    pix: (key) => (key ? `Pix (chave: ${key})` : "Pix"),
    card: "Cartão (maquininha)",
    customer: "Cliente",
    scheduled: "Agendado para",
    at: "às",
    tracking: "Acompanhe o pedido",
  },
  es: {
    intl: "es-UY",
    subtotal: "Subtotal",
    deliveryFee: "Envío",
    discount: "Descuento",
    deliveryEta: "Entrega estimada",
    pickupEta: "Listo para retirar en",
    delivery: "Envío a",
    reference: "Referencia",
    pickup: "Retiro en el local",
    payment: "Pago",
    cash: (change) => (change ? `Efectivo (cambio para ${change})` : "Efectivo (sin cambio)"),
    pix: (key) => (key ? `Pix (clave: ${key})` : "Pix"),
    card: "Tarjeta (máquina)",
    customer: "Cliente",
    scheduled: "Programado para",
    at: "a las",
    tracking: "Seguí tu pedido",
  },
};

// "sáb 27/09 às 18:30" (pt) / "sáb 27/09 a las 18:30" (es), en hora de Brasil.
function formatSchedule(date, labels) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(labels.intl, {
      timeZone: TIME_ZONE,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const weekday = parts.weekday.replace(".", "").toLowerCase();
  return `${weekday} ${parts.day}/${parts.month} ${labels.at} ${parts.hour}:${parts.minute}`;
}

function paymentText(order, store, labels) {
  if (order.paymentMethod === "cash") {
    return labels.cash(order.changeForCents != null ? formatBRL(order.changeForCents) : null);
  }
  if (order.paymentMethod === "pix") return labels.pix(store.pixKey);
  return labels.card;
}

// Una línea por grupo: "Adicionais: 2x Bacon (+R$ 8,00), Cheddar (+R$ 3,00)". En los
// grupos que no suman (pizza meio a meio: vale el sabor más caro) no se muestran precios.
function optionLines(options) {
  const groups = new Map();
  for (const option of options) {
    const quantity = option.quantity > 1 ? `${option.quantity}x ` : "";
    const sums = (option.pricing ?? "sum") === "sum" && option.priceCents > 0;
    const label = `${quantity}${option.name}${sums ? ` (+${formatBRL(option.priceCents * (option.quantity ?? 1))})` : ""}`;
    groups.set(option.group, [...(groups.get(option.group) ?? []), label]);
  }
  return [...groups].map(([group, labels]) => `   ${group}: ${labels.join(", ")}`);
}

/**
 * @param {object} order
 * @param {object} store
 * @param {{ trackingUrl?: string, title?: string }} [extras]  title: en vez de "Pedido #N" (un resumen antes de crearlo).
 */
export function buildOrderMessage(order, store, { trackingUrl, title } = {}) {
  const labels = LABELS[order.locale] ?? LABELS["pt-BR"];
  const lines = [title ?? `*Pedido #${order.number} — ${store.name}*`];
  if (order.scheduledFor) lines.push(`*${labels.scheduled}:* ${formatSchedule(order.scheduledFor, labels)}`);
  lines.push("");

  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.name} — ${formatBRL(item.totalCents)}`);
    lines.push(...optionLines(item.options));
    if (item.notes) lines.push(`   Obs.: ${item.notes}`);
  }

  lines.push("", `${labels.subtotal}: ${formatBRL(order.subtotalCents)}`);
  if (order.fulfillment === "delivery") lines.push(`${labels.deliveryFee}: ${formatBRL(order.deliveryFeeCents)}`);
  if (order.discountCents > 0) {
    const code = order.coupon?.code ? ` (${order.coupon.code})` : "";
    lines.push(`${labels.discount}${code}: -${formatBRL(order.discountCents)}`);
  }
  lines.push(`*Total: ${formatBRL(order.totalCents)}*`);
  const estimate = order.estimatedMinutes;
  if (!order.scheduledFor && estimate?.min != null && estimate?.max != null) {
    const label = order.fulfillment === "delivery" ? labels.deliveryEta : labels.pickupEta;
    lines.push(`${label}: ${estimate.min}–${estimate.max} min`);
  }
  lines.push("");

  if (order.fulfillment === "delivery") {
    const { street, number, neighborhood, reference } = order.address;
    lines.push(`*${labels.delivery}:* ${street}, ${number} — ${neighborhood}`);
    if (reference) lines.push(`${labels.reference}: ${reference}`);
  } else {
    lines.push(`*${labels.pickup}*`);
  }
  lines.push(`*${labels.payment}:* ${paymentText(order, store, labels)}`);
  if (order.notes) lines.push(`*Obs.:* ${order.notes}`);

  const phone = order.customer.phone ? ` — ${order.customer.phone}` : "";
  lines.push("", `${labels.customer}: ${order.customer.name}${phone}`);
  if (trackingUrl) lines.push(`${labels.tracking}: ${trackingUrl}`);
  return lines.join("\n");
}

// Link que abre el chat del local con el mensaje ya escrito.
export const buildWhatsappUrl = (phone, message) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

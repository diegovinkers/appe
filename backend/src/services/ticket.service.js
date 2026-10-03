// Comanda para imprimir en impresoras térmicas (58 mm = 32 columnas, 80 mm = 48).
// Texto plano monoespaciado; la versión HTML lo envuelve con estilos de impresión.
import { TIME_ZONE } from "../lib/dates.js";
import { formatBRL } from "../lib/money.js";
import { STATUS_LABELS } from "./orderStatus.js";

export const TICKET_COLUMNS = { 58: 32, 80: 48 };

const CHANNEL_LABELS = { online: "ONLINE", phone: "TELEFONE", whatsapp: "WHATSAPP", counter: "BALCÃO" };
const PAYMENT_LABELS = { cash: "Dinheiro", pix: "Pix", card: "Cartão" };

// Las impresoras no siempre entienden el espacio no separable de Intl.
const money = (cents) => formatBRL(cents).replace(/ /g, " ");

const dateTime = (date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(",", "");

// Parte un texto en líneas de hasta `width` caracteres. Respeta la sangría inicial
// (las opciones van debajo del producto) y usa `indent` en las líneas que siguen.
function wrap(text, width, indent = "") {
  const lead = text.match(/^ */)[0];
  const lines = [];
  let line = lead;
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const empty = line.trim() === "";
    const candidate = empty ? `${line}${word}` : `${line} ${word}`;
    if (candidate.length <= width || empty) {
      line = candidate;
    } else {
      lines.push(line);
      line = `${indent}${word}`;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => (l.length > width ? l.slice(0, width) : l));
}

// "2x X-Bacon ............ R$ 70,00": el texto a la izquierda y el valor alineado a la derecha.
function row(left, right, width) {
  const available = width - right.length - 1;
  const lines = wrap(left, available, "   ");
  const last = lines.pop();
  return [...lines, `${last}${" ".repeat(width - last.length - right.length)}${right}`];
}

const center = (text, width) => {
  const clipped = text.slice(0, width);
  return `${" ".repeat(Math.floor((width - clipped.length) / 2))}${clipped}`;
};

export function buildTicket(order, store, { paperWidth = 80 } = {}) {
  const width = TICKET_COLUMNS[paperWidth];
  const rule = "-".repeat(width);
  const lines = [center(store.name.toUpperCase(), width), rule];

  lines.push(...row(`PEDIDO #${order.number}`, CHANNEL_LABELS[order.channel] ?? "ONLINE", width));
  lines.push(dateTime(order.createdAt));
  if (order.scheduledFor) lines.push(`AGENDADO: ${dateTime(order.scheduledFor)}`);
  if (order.status === "cancelled") lines.push(`*** ${STATUS_LABELS.cancelled.toUpperCase()} ***`);
  lines.push(rule);

  lines.push(...wrap(`Cliente: ${order.customer.name}`, width, "  "));
  if (order.customer.phone) lines.push(`Tel: ${order.customer.phone}`);
  if (order.fulfillment === "delivery") {
    const { street, number, neighborhood, reference } = order.address;
    lines.push(...wrap(`ENTREGA: ${street}, ${number} - ${neighborhood}`, width, "  "));
    if (reference) lines.push(...wrap(`Ref.: ${reference}`, width, "  "));
  } else {
    lines.push("RETIRADA NO LOCAL");
  }
  lines.push(rule);

  for (const item of order.items) {
    lines.push(...row(`${item.quantity}x ${item.name}`, money(item.totalCents), width));
    const byGroup = new Map();
    for (const option of item.options) {
      const label = `${option.quantity > 1 ? `${option.quantity}x ` : ""}${option.name}`;
      byGroup.set(option.group, [...(byGroup.get(option.group) ?? []), label]);
    }
    for (const [group, names] of byGroup) lines.push(...wrap(`   ${group}: ${names.join(", ")}`, width, "     "));
    if (item.notes) lines.push(...wrap(`   Obs.: ${item.notes}`, width, "     "));
  }
  lines.push(rule);

  lines.push(...row("Subtotal", money(order.subtotalCents), width));
  if (order.discountCents > 0) {
    lines.push(...row(`Desconto${order.coupon?.code ? ` (${order.coupon.code})` : ""}`, `-${money(order.discountCents)}`, width));
  }
  if (order.fulfillment === "delivery") lines.push(...row("Entrega", money(order.deliveryFeeCents), width));
  lines.push(...row("TOTAL", money(order.totalCents), width), rule);

  const change = order.paymentMethod === "cash" && order.changeForCents != null ? ` (troco p/ ${money(order.changeForCents)})` : "";
  lines.push(...wrap(`Pagamento: ${PAYMENT_LABELS[order.paymentMethod]}${change}`, width, "  "));
  if (order.notes) lines.push(...wrap(`Obs.: ${order.notes}`, width, "  "));
  if (order.internalNotes) lines.push(...wrap(`Obs. internas: ${order.internalNotes}`, width, "  "));
  return `${lines.join("\n")}\n`;
}

const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Página lista para imprimir desde el navegador (Ctrl+P) en la térmica.
export function buildTicketHtml(text, { paperWidth = 80, title = "Comanda" } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: ${paperWidth}mm auto; margin: 0; }
  body { margin: 0; background: #fff; color: #000; }
  pre { width: ${paperWidth - 4}mm; margin: 0; padding: 2mm; font: ${paperWidth === 58 ? 11 : 12}px/1.35 ui-monospace, "Courier New", monospace; white-space: pre-wrap; }
</style>
</head>
<body><pre>${escapeHtml(text)}</pre></body>
</html>
`;
}

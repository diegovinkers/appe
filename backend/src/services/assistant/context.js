// Lo que sabe el asistente en cada respuesta, en texto:
// - fijo (va a la caché): la loja y el menú, con códigos cortos (P12, G3-2) en vez de ids;
// - del momento: la hora, si la loja está abierta, el cliente y el pedido cotado.
import Category from "../../models/category.model.js";
import Customer from "../../models/customer.model.js";
import OptionGroup from "../../models/optionGroup.model.js";
import Order from "../../models/order.model.js";
import Product from "../../models/product.model.js";
import { TIME_ZONE } from "../../lib/dates.js";
import { storeUrl } from "../../lib/links.js";
import { formatBRL } from "../../lib/money.js";
import { phoneVariants } from "../../lib/phone.js";
import { localized } from "../../lib/translations.js";
import { WEEKDAYS, getOpeningStatus, isCategoryAvailable } from "../opening.service.js";
import { STATUS_LABELS } from "../orderStatus.js";
import { activePromoPrice, effectivePrice, fromPrice } from "../pricing.service.js";

const WEEKDAY_NAMES = { sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sáb" };
const PAYMENT_NAMES = { cash: "dinheiro", pix: "Pix", card: "cartão (maquininha)" };
const PRICING_NOTES = { max: " (cobra só a mais cara)", average: " (cobra a média dos preços)" };

// Una línea sin saltos y cortada: las descripciones largas gastan tokens en cada mensaje.
const oneLine = (text, max) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

// "seg 28/09 19:30", en hora de Brasil.
export function formatWhen(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
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
  return `${parts.weekday.replace(".", "")} ${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}

/**
 * El menú en texto y la tabla de códigos para traducir lo que pida la IA a ids reales.
 * @returns {{ text: string, products: Map<string, string>, options: Map<string, { groupId: string, optionId: string }> }}
 */
export async function buildMenu(store, lang, now = new Date()) {
  const byPosition = { position: 1, createdAt: 1 };
  const [categories, products, groups] = await Promise.all([
    Category.find({ commerce: store._id, active: true }).sort(byPosition).lean(),
    Product.find({ commerce: store._id }).sort(byPosition).lean(),
    OptionGroup.find({ commerce: store._id }).lean(),
  ]);
  const groupsById = new Map(groups.map((group) => [String(group._id), group]));
  const groupCodes = new Map();
  const productCodes = new Map();
  const optionCodes = new Map();
  const lines = ["## Cardápio"];

  for (const category of categories) {
    const own = products.filter((product) => String(product.category) === String(category._id));
    if (!own.length) continue;
    const schedule = category.schedule;
    const outOfHours = !isCategoryAvailable(category, now);
    lines.push(
      `### ${localized(category, "name", lang)}${schedule ? ` (só das ${schedule.from} às ${schedule.to}${outOfHours ? "; agora não" : ""})` : ""}`
    );
    for (const product of own) {
      const code = `P${productCodes.size + 1}`;
      productCodes.set(code, String(product._id));
      const productGroups = product.optionGroups.map((id) => groupsById.get(String(id))).filter(Boolean);
      const codes = productGroups.map((group) => {
        if (!groupCodes.has(String(group._id))) groupCodes.set(String(group._id), `G${groupCodes.size + 1}`);
        return groupCodes.get(String(group._id));
      });
      const promo = activePromoPrice(product, now);
      const price = promo != null ? `${formatBRL(promo)} (promoção; antes ${formatBRL(product.priceCents)})` : formatBRL(effectivePrice(product, now));
      const soldOut = !product.available || (product.trackStock && product.stock <= 0) || fromPrice(product, productGroups, now) === null;
      const description = oneLine(localized(product, "description", lang), 140);
      lines.push(
        `${code} ${localized(product, "name", lang)} — ${price}${soldOut ? " [ESGOTADO]" : ""}` +
          (description ? `. ${description}` : "") +
          (codes.length ? ` | opções: ${codes.join(", ")}` : "")
      );
    }
  }

  if (groupCodes.size) lines.push("", "## Opções (dos produtos acima)");
  for (const [groupId, code] of groupCodes) {
    const group = groupsById.get(groupId);
    const { minSelect: min, maxSelect: max } = group;
    const rule = min === max ? `escolher ${min}` : min > 0 ? `escolher de ${min} a ${max}` : `opcional, até ${max}`;
    const options = group.options.map((option, index) => {
      const optionCode = `${code}-${index + 1}`;
      optionCodes.set(optionCode, { groupId, optionId: String(option._id) });
      const price = option.priceCents > 0 ? ` +${formatBRL(option.priceCents)}` : "";
      const repeat = (option.maxQuantity ?? 1) > 1 ? ` (até ${option.maxQuantity}x)` : "";
      return `${optionCode} ${localized(option, "name", lang)}${price}${repeat}${option.available ? "" : " [esgotado]"}`;
    });
    lines.push(`${code} ${localized(group, "name", lang)} — ${rule}${PRICING_NOTES[group.pricing] ?? ""}: ${options.join("; ")}`);
  }

  return { text: lines.join("\n"), products: productCodes, options: optionCodes };
}

// Datos de la loja que cambian poco (van a la caché junto con el menú).
export function storeInfo(store, lang) {
  const weekly = WEEKDAYS.map((day) => {
    const intervals = store.hours.weekly[day] ?? [];
    return `${WEEKDAY_NAMES[day]} ${intervals.length ? intervals.map(({ open, close }) => `${open}–${close}`).join(", ") : "fechado"}`;
  }).join("; ");
  const ways = [store.fulfillment.delivery && "entrega", store.fulfillment.pickup && "retirada no local"].filter(Boolean);

  const lines = [`## Loja`, `Nome: ${store.name}`];
  if (store.address) lines.push(`Endereço (para retirada): ${store.address}`);
  lines.push(`Link do cardápio (fotos e carrinho): ${storeUrl(store)}`, `Horário: ${weekly}`, `Atende: ${ways.join(" e ") || "nada no momento"}`);
  if (store.fulfillment.delivery) {
    if (store.deliveryMode === "zones") {
      const zones = store.deliveryZones
        .filter((zone) => zone.active)
        .map((zone) => {
          const extras = [
            zone.minOrderCents != null && `mínimo ${formatBRL(zone.minOrderCents)}`,
            zone.estimateMin != null && `${zone.estimateMin}–${zone.estimateMax} min`,
          ].filter(Boolean);
          return `${zone.name} ${formatBRL(zone.feeCents)}${extras.length ? ` (${extras.join(", ")})` : ""}`;
        });
      lines.push(`Entrega só nestes bairros: ${zones.join("; ")}`);
    } else {
      lines.push(`Taxa de entrega: ${formatBRL(store.deliveryFeeCents)} (qualquer bairro)`);
    }
    if (store.freeDeliveryFromCents != null) lines.push(`Entrega grátis a partir de ${formatBRL(store.freeDeliveryFromCents)}`);
    if (store.minOrderCents > 0) lines.push(`Pedido mínimo para entrega: ${formatBRL(store.minOrderCents)}`);
  }
  const { estimates } = store;
  lines.push(
    `Tempo estimado: entrega ${estimates.deliveryMin}–${estimates.deliveryMax} min; retirada ${estimates.pickupMin}–${estimates.pickupMax} min`,
    `Pagamento (na entrega ou retirada): ${store.paymentMethods.map((method) => PAYMENT_NAMES[method]).join(", ")}`
  );
  if (store.paymentMethods.includes("pix") && store.pixKey) lines.push(`Chave Pix: ${store.pixKey}`);
  lines.push(
    store.scheduling.enabled
      ? `Pedidos agendados: aceita, com ${store.scheduling.minLeadMinutes} min de antecedência e até ${store.scheduling.maxDaysAhead} dias`
      : "Pedidos agendados: não aceita"
  );
  const about = oneLine(localized(store, "about", lang) || localized(store, "description", lang), 300);
  if (about) lines.push(`Sobre a loja: ${about}`);
  const notice = localized(store, "notice", lang);
  if (notice) lines.push(`Aviso da loja: ${notice}`);
  return lines.join("\n");
}

function openingText(store, now) {
  const opening = getOpeningStatus(store, now);
  if (opening.status === "paused") {
    const until = opening.pausedUntil ? ` até ${formatWhen(opening.pausedUntil)}` : "";
    return `PAUSADA${until}: não está aceitando pedidos agora${opening.message ? ` ("${opening.message}")` : ""}.`;
  }
  if (opening.status === "open") return `ABERTA${opening.closesAt ? `, fecha ${formatWhen(opening.closesAt)}` : ""}.`;
  return `FECHADA. ${opening.nextOpenAt ? `Abre ${formatWhen(opening.nextOpenAt)}.` : "Sem horário de abertura nos próximos dias."}`;
}

function orderLine(order) {
  const items = order.items
    .map((item) => {
      const options = item.options.map((option) => option.name).join(", ");
      return `${item.quantity}x ${item.name}${options ? ` (${options})` : ""}${item.notes ? ` [${item.notes}]` : ""}`;
    })
    .join("; ");
  const where = order.fulfillment === "delivery" && order.address ? `entrega em ${order.address.street}, ${order.address.number} — ${order.address.neighborhood}` : "retirada";
  return `#${order.number} ${formatWhen(order.createdAt)} (${STATUS_LABELS[order.status]}): ${items} — ${formatBRL(order.totalCents)} — ${where} — ${PAYMENT_NAMES[order.paymentMethod]}`;
}

// La cuenta del cliente (si tiene) por su teléfono, con y sin el 9.
export const findAccount = (phone) => (phone ? Customer.findOne({ phone: { $in: phoneVariants(phone) } }) : null);

// Lo del momento: no va a la caché.
export async function momentInfo({ store, conversation, now = new Date() }) {
  const phone = conversation.customer.phone;
  const [account, orders] = await Promise.all([
    findAccount(phone),
    phone
      ? Order.find({ commerce: store._id, "customer.phone": { $in: phoneVariants(phone) } })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      : [],
  ]);

  const lines = ["## Agora", `Data e hora: ${formatWhen(now)} (horário de Brasília)`, `Loja: ${openingText(store, now)}`, "", "## Cliente"];
  lines.push(`WhatsApp: ${phone || "não informado"}`);
  const name = conversation.customer.name || account?.name;
  lines.push(`Nome: ${name || "ainda não informado (pergunte antes de cotar)"}`);
  if (account?.addresses.length) {
    lines.push(
      "Endereços salvos na conta:",
      ...account.addresses.map(
        (address, index) =>
          `${index + 1}) ${address.label ? `${address.label}: ` : ""}${address.street}, ${address.number} — ${address.neighborhood}${address.reference ? ` (ref.: ${address.reference})` : ""}`
      )
    );
  }
  const active = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  if (active.length) lines.push("Pedidos em andamento:", ...active.map(orderLine));
  const past = orders.filter((order) => ["delivered", "cancelled"].includes(order.status));
  lines.push(past.length ? "Últimos pedidos nesta loja:" : "Nunca pediu nesta loja.", ...past.map(orderLine));

  lines.push("", "## Pedido cotado nesta conversa");
  lines.push(
    conversation.draft
      ? `Versão ${conversation.draft.version}, total ${formatBRL(conversation.draft.totalCents)}, cotado ${formatWhen(conversation.draft.quotedAt)}. Ainda não foi criado.`
      : "Nenhum no momento."
  );
  if (conversation.testMode) lines.push("", "(Simulador da loja em modo de teste: os pedidos não são criados de verdade.)");
  return lines.join("\n");
}

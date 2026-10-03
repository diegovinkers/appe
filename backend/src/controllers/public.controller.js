import Category from "../models/category.model.js";
import Commerce from "../models/commerce.model.js";
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import { checkCoupon } from "../services/coupon.service.js";
import { availableSlots } from "../services/scheduling.service.js";
import OptionGroup from "../models/optionGroup.model.js";
import Product from "../models/product.model.js";
import { addDays, todayIn } from "../lib/dates.js";
import { AppError } from "../lib/errors.js";
import { localized } from "../lib/translations.js";
import { WEEKDAYS, getOpeningStatus, isCategoryAvailable } from "../services/opening.service.js";
import { activePromoPrice, fromPrice } from "../services/pricing.service.js";
import { ratingSummaries } from "../services/review.service.js";

// Un local suspendido responde igual que uno que no existe.
export async function findActiveStore(slug) {
  const commerce = await Commerce.findOne({ slug, status: "active" });
  if (!commerce) throw new AppError(404, "STORE_NOT_FOUND", "Estabelecimento não encontrado");
  return commerce;
}

// Excepciones de horario que el menú muestra ("fechado no feriado"): las de los próximos 14 días.
const UPCOMING_EXCEPTION_DAYS = 14;

const intervals = (list) => list.map(({ open, close }) => ({ open, close }));

function publicStore(commerce, lang, now) {
  const opening = getOpeningStatus(commerce, now);
  const today = todayIn(undefined, now);
  const lastDay = addDays(today, UPCOMING_EXCEPTION_DAYS);
  return {
    name: commerce.name,
    slug: commerce.slug,
    description: localized(commerce, "description", lang),
    about: localized(commerce, "about", lang),
    notice: localized(commerce, "notice", lang),
    logoUrl: commerce.logoUrl,
    coverUrl: commerce.coverUrl,
    instagram: commerce.instagram,
    primaryColor: commerce.primaryColor,
    secondaryColor: commerce.secondaryColor,
    // Si se puede pedir ahora; el detalle (horarios, pausa) va en `opening`.
    isOpen: opening.acceptingOrders,
    opening: {
      status: opening.status,
      closesAt: opening.closesAt,
      nextOpenAt: opening.nextOpenAt,
      pausedUntil: opening.pausedUntil,
      message: opening.message,
    },
    hours: {
      weekly: Object.fromEntries(WEEKDAYS.map((day) => [day, intervals(commerce.hours.weekly[day])])),
      upcomingExceptions: commerce.hours.exceptions
        .filter((exception) => exception.date >= today && exception.date <= lastDay)
        .map(({ date, closed, intervals: list, note }) => ({ date, closed, intervals: intervals(list), note })),
    },
    address: commerce.address,
    whatsapp: commerce.whatsapp,
    fulfillment: { delivery: commerce.fulfillment.delivery, pickup: commerce.fulfillment.pickup },
    estimates: {
      deliveryMin: commerce.estimates.deliveryMin,
      deliveryMax: commerce.estimates.deliveryMax,
      pickupMin: commerce.estimates.pickupMin,
      pickupMax: commerce.estimates.pickupMax,
    },
    deliveryMode: commerce.deliveryMode,
    deliveryFeeCents: commerce.deliveryFeeCents,
    // Solo los barrios activos, para que el cliente elija el suyo.
    deliveryZones: commerce.deliveryZones
      .filter((zone) => zone.active)
      .map(({ _id, name, feeCents, minOrderCents, estimateMin, estimateMax }) => ({
        _id,
        name,
        feeCents,
        minOrderCents,
        estimateMin,
        estimateMax,
      })),
    freeDeliveryFromCents: commerce.freeDeliveryFromCents,
    minOrderCents: commerce.minOrderCents,
    paymentMethods: commerce.paymentMethods,
    pixKey: commerce.pixKey,
    scheduling: {
      enabled: commerce.scheduling.enabled,
      minLeadMinutes: commerce.scheduling.minLeadMinutes,
      maxDaysAhead: commerce.scheduling.maxDaysAhead,
      slotMinutes: commerce.scheduling.slotMinutes,
    },
  };
}

function publicProduct(product, groupsById, lang, now) {
  const groups = product.optionGroups.map((id) => groupsById.get(String(id))).filter(Boolean);
  const lowest = fromPrice(product, groups, now);
  const soldOut = product.trackStock && product.stock <= 0;
  return {
    _id: product._id,
    name: localized(product, "name", lang),
    description: localized(product, "description", lang),
    priceCents: product.priceCents,
    // Precio promocional vigente ahora ("de R$ X por R$ Y"), o null.
    promoPriceCents: activePromoPrice(product, now),
    // Lo mínimo que cuesta con las opciones obligatorias ("a partir de").
    fromPriceCents: lowest,
    imageUrl: product.imageUrl,
    tags: product.tags ?? [],
    // Agotado a mano, sin stock, o con un grupo obligatorio sin opciones disponibles.
    available: product.available && !soldOut && lowest !== null,
    optionGroups: product.optionGroups,
  };
}

const publicOptionGroup = (group, lang) => ({
  _id: group._id,
  name: localized(group, "name", lang),
  minSelect: group.minSelect,
  maxSelect: group.maxSelect,
  pricing: group.pricing ?? "sum",
  options: group.options.map((option) => ({
    _id: option._id,
    name: localized(option, "name", lang),
    priceCents: option.priceCents,
    maxQuantity: option.maxQuantity ?? 1,
    available: option.available,
  })),
});

// Las consultas son .lean(): los documentos creados antes de que existiera un campo no
// traen su valor por defecto, así que acá se completa (tags, pricing, maxQuantity, schedule).
// Local y menú entero en una sola respuesta, pensando en datos móviles. Los grupos de
// opciones van aparte (los productos los referencian por id) para no repetirlos.
// ?lang=es devuelve los textos en español cuando el local los cargó.
export const getPublicStore = async (req, res) => {
  const commerce = await findActiveStore(req.valid.params.slug);
  const { lang } = req.valid.query;
  const now = new Date();
  const byPosition = { position: 1, createdAt: 1 };
  const [categories, products, groups, ratingOf] = await Promise.all([
    Category.find({ commerce: commerce._id, active: true }).sort(byPosition).lean(),
    Product.find({ commerce: commerce._id }).sort(byPosition).lean(),
    OptionGroup.find({ commerce: commerce._id }).lean(),
    ratingSummaries([commerce._id]),
  ]);
  const groupsById = new Map(groups.map((group) => [String(group._id), group]));

  const menu = categories
    .map((category) => ({
      _id: category._id,
      name: localized(category, "name", lang),
      // Fuera de su horario la categoría se muestra, pero no se puede pedir.
      availableNow: isCategoryAvailable(category, now),
      schedule: category.schedule
        ? { days: category.schedule.days, from: category.schedule.from, to: category.schedule.to }
        : null,
      products: products
        .filter((product) => String(product.category) === String(category._id))
        .map((product) => publicProduct(product, groupsById, lang, now)),
    }))
    .filter((category) => category.products.length > 0);

  const visible = menu.flatMap((category) => category.products);
  const usedGroups = new Set(visible.flatMap((product) => product.optionGroups.map(String)));
  const featuredIds = new Set(products.filter((product) => product.featured).map((product) => String(product._id)));

  res.json({
    store: { ...publicStore(commerce, lang, now), rating: ratingOf(commerce._id) },
    // Sección "Destaques": ids de productos que están en `categories`.
    featuredProductIds: visible.filter((product) => featuredIds.has(String(product._id))).map((product) => product._id),
    categories: menu,
    optionGroups: groups.filter((group) => usedGroups.has(String(group._id))).map((group) => publicOptionGroup(group, lang)),
  });
};

// Directorio: los locales activos, primero los que están recibiendo pedidos.
export const listPublicStores = async (req, res) => {
  const { lang } = req.valid.query;
  const now = new Date();
  const commerces = await Commerce.find({ status: "active" }).sort({ name: 1 }).limit(500);
  const ratingOf = await ratingSummaries(commerces.map((commerce) => commerce._id));
  const stores = commerces.map((commerce) => {
    const opening = getOpeningStatus(commerce, now);
    return {
      name: commerce.name,
      slug: commerce.slug,
      description: localized(commerce, "description", lang),
      logoUrl: commerce.logoUrl,
      coverUrl: commerce.coverUrl,
      primaryColor: commerce.primaryColor,
      address: commerce.address,
      isOpen: opening.acceptingOrders,
      opening: {
        status: opening.status,
        closesAt: opening.closesAt,
        nextOpenAt: opening.nextOpenAt,
        pausedUntil: opening.pausedUntil,
        message: opening.message,
      },
      fulfillment: { delivery: commerce.fulfillment.delivery, pickup: commerce.fulfillment.pickup },
      estimates: {
        deliveryMin: commerce.estimates.deliveryMin,
        deliveryMax: commerce.estimates.deliveryMax,
        pickupMin: commerce.estimates.pickupMin,
        pickupMax: commerce.estimates.pickupMax,
      },
      rating: ratingOf(commerce._id),
    };
  });
  // sort es estable: dentro de abiertos y de cerrados queda el orden por nombre.
  stores.sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
  res.json({ stores });
};

// Franjas que el cliente puede elegir para un pedido programado.
export const getSlots = async (req, res) => {
  const store = await findActiveStore(req.valid.params.slug);
  const { enabled, slotMinutes } = store.scheduling;
  res.json({ enabled, slotMinutes, slots: availableSlots(store) });
};

// Chequea un cupón antes de enviar el pedido (el pedido lo vuelve a validar con el total real).
export const validateCoupon = async (req, res) => {
  const store = await findActiveStore(req.valid.params.slug);
  const { code, phone } = req.valid.body;
  const coupon = await Coupon.findOne({ commerce: store._id, code }).lean();
  const customerUses =
    coupon && phone
      ? await Order.countDocuments({ commerce: store._id, "coupon.code": code, "customer.phone": phone, status: { $ne: "cancelled" } })
      : 0;
  checkCoupon(coupon, { customerUses });
  res.json({ coupon: { code: coupon.code, type: coupon.type, value: coupon.value, minOrderCents: coupon.minOrderCents } });
};

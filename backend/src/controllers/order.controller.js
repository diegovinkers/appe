import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Commerce from "../models/commerce.model.js";
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import { audit } from "../lib/audit.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import { dayRange, todayIn } from "../lib/dates.js";
import { trackingUrl as trackingUrlOf } from "../lib/links.js";
import { placeOrder } from "../services/orderPlacement.service.js";
import { notifyOrderStatus } from "../services/assistant/whatsapp.js";
import { STATUS_LABELS, canTransition } from "../services/orderStatus.js";
import { publicReview, reviewWindow } from "../services/review.service.js";
import { rememberOrder } from "../services/customer.service.js";
import Review from "../models/review.model.js";
import { buildTicket, buildTicketHtml } from "../services/ticket.service.js";
import { buildOrderMessage, buildWhatsappUrl } from "../services/whatsapp.service.js";
import { findActiveStore } from "./public.controller.js";

const orderNotFound = () => notFound("Pedido não encontrado");

// Lo que ve el cliente después de pedir: el resumen, el seguimiento y el link para
// abrir el WhatsApp del local con el mensaje escrito.
function orderReceipt(order, store) {
  const trackingUrl = trackingUrlOf(order);
  const message = buildOrderMessage(order, store, { trackingUrl });
  return {
    order: {
      _id: order._id,
      number: order.number,
      status: order.status,
      fulfillment: order.fulfillment,
      paymentMethod: order.paymentMethod,
      changeForCents: order.changeForCents,
      items: order.items,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      coupon: order.coupon,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      estimatedMinutes: order.estimatedMinutes,
      scheduledFor: order.scheduledFor,
      createdAt: order.createdAt,
    },
    trackingUrl,
    whatsapp: { message, url: buildWhatsappUrl(store.whatsapp, message) },
  };
}

const isDuplicateOrder = (error) => error.code === 11000 && error.keyPattern?.clientOrderId;

// POST /api/public/stores/:slug/orders
export const createPublicOrder = async (req, res) => {
  const store = await findActiveStore(req.valid.params.slug);
  const input = req.valid.body;
  const sameOrder = { commerce: store._id, clientOrderId: input.clientOrderId };

  // Reenvío del mismo pedido (conexión mala, doble toque): no se duplica.
  const existing = await Order.findOne(sameOrder);
  if (existing) return res.json(orderReceipt(existing, store));

  try {
    const order = await placeOrder({ store, input, channel: "online", origin: "customer", account: req.customer?._id ?? null });
    // Con la cuenta iniciada, la dirección queda guardada. Si falla, el pedido igual vale.
    if (req.customer) await rememberOrder(req.customer._id, order).catch((error) => req.log?.warn({ err: error }, "no se guardó la dirección"));
    res.status(201).json(orderReceipt(order, store));
  } catch (error) {
    // Dos envíos simultáneos del mismo pedido: se devuelve el que quedó guardado.
    if (isDuplicateOrder(error)) return res.json(orderReceipt(await Order.findOne(sameOrder), store));
    throw error;
  }
};

// POST /api/owner/orders — pedido que llegó por teléfono, WhatsApp o en el mostrador.
export const createManualOrder = async (req, res) => {
  const body = req.valid.body;
  const input = { ...body, clientOrderId: body.clientOrderId ?? randomUUID() };
  const sameOrder = { commerce: req.commerce._id, clientOrderId: input.clientOrderId };

  const existing = await Order.findOne(sameOrder);
  if (existing) return res.json({ order: existing, trackingUrl: trackingUrlOf(existing) });

  try {
    const order = await placeOrder({ store: req.commerce, input, channel: body.channel, origin: "panel", user: req.user });
    res.status(201).json({ order, trackingUrl: trackingUrlOf(order) });
  } catch (error) {
    if (isDuplicateOrder(error)) {
      const saved = await Order.findOne(sameOrder);
      return res.json({ order: saved, trackingUrl: trackingUrlOf(saved) });
    }
    throw error;
  }
};

// GET /api/owner/orders — por defecto, los de hoy (hora de Brasil), más nuevos primero.
// Un pedido programado aparece el día para el que está programado.
export const listOrders = async (req, res) => {
  const { date = todayIn(), status, updatedSince } = req.valid.query;
  const { start, end } = dayRange(date);
  const range = { $gte: start, $lt: end };
  const filter = {
    commerce: req.commerce._id,
    $or: [{ scheduledFor: null, createdAt: range }, { scheduledFor: range }],
  };
  if (status) filter.status = status;
  if (updatedSince) filter.updatedAt = { $gte: new Date(updatedSince) };

  // Se toma antes de consultar: el próximo polling con updatedSince=serverTime no pierde nada.
  const serverTime = new Date();
  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ orders, serverTime: serverTime.toISOString() });
};

export const getOrder = async (req, res) => {
  const order = await Order.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!order) throw orderNotFound();
  res.json({ order });
};

export const updateOrderStatus = async (req, res) => {
  const { id } = req.valid.params;
  const { status, reason, estimatedMinutes } = req.valid.body;
  const filter = { _id: id, commerce: req.commerce._id };

  const current = await Order.findOne(filter).select("status fulfillment");
  if (!current) throw orderNotFound();
  if (!canTransition(current.status, status, current.fulfillment)) {
    throw conflict(
      "INVALID_STATUS_TRANSITION",
      `Não é possível passar um pedido ${STATUS_LABELS[current.status]} para ${STATUS_LABELS[status]}`,
      { from: current.status, to: status }
    );
  }

  const set = { status };
  if (status === "cancelled") set.cancelReason = reason;
  if (estimatedMinutes) set.estimatedMinutes = estimatedMinutes;
  const entry = { status, at: new Date(), by: req.user.id, ...(status === "cancelled" ? { reason } : {}) };

  // El filtro por el estado anterior evita pisar un cambio hecho desde otro dispositivo.
  // Al cancelar, en la misma transacción vuelven el stock y el uso del cupón.
  let order;
  await mongoose.connection.transaction(async (session) => {
    order = await Order.findOneAndUpdate(
      { ...filter, status: current.status },
      { $set: set, $push: { statusHistory: entry } },
      { returnDocument: "after", session }
    );
    if (!order) {
      throw conflict("INVALID_STATUS_TRANSITION", "O pedido foi atualizado em outro aparelho. Atualize a lista.");
    }
    if (status !== "cancelled") return;
    for (const item of order.items.filter((line) => line.stockTracked)) {
      await Product.updateOne(
        { _id: item.product, commerce: req.commerce._id, trackStock: true },
        { $inc: { stock: item.quantity } },
        { session }
      );
    }
    if (order.coupon?.code) {
      await Coupon.updateOne(
        { commerce: req.commerce._id, code: order.coupon.code, uses: { $gt: 0 } },
        { $inc: { uses: -1 } },
        { session }
      );
    }
  });

  if (status === "cancelled") {
    await audit(req, {
      action: "order.cancelled",
      entity: { type: "order", id: order._id },
      changes: { number: order.number, from: current.status, totalCents: order.totalCents, reason },
    });
  }
  // Si lo tomó el asistente por WhatsApp, el cliente recibe el aviso. No se espera: si
  // WhatsApp tarda o falla, el panel sigue igual.
  notifyOrderStatus(order).catch((error) => req.log.warn({ err: { name: error.name, status: error.status } }, "whatsapp: no se avisó el estado"));
  res.json({ order });
};

// Notas del local sobre el pedido (nunca las ve el cliente).
export const updateOrderNotes = async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.valid.params.id, commerce: req.commerce._id },
    { $set: { internalNotes: req.valid.body.internalNotes } },
    { returnDocument: "after" }
  );
  if (!order) throw orderNotFound();
  res.json({ order });
};

// Comanda para la impresora térmica: texto plano o una página HTML lista para imprimir.
export const getOrderTicket = async (req, res) => {
  const order = await Order.findOne({ _id: req.valid.params.id, commerce: req.commerce._id });
  if (!order) throw orderNotFound();
  const { format, width } = req.valid.query;
  const text = buildTicket(order, req.commerce, { paperWidth: width });
  if (format === "text") return res.type("text/plain; charset=utf-8").send(text);
  res.type("text/html; charset=utf-8").send(buildTicketHtml(text, { paperWidth: width, title: `Pedido #${order.number}` }));
};

// Seguimiento para el cliente: estado y resumen, sin teléfono ni dirección completa.
export const getOrderTracking = async (req, res) => {
  const order = await Order.findOne({ trackingToken: req.valid.params.token });
  const store = order && (await Commerce.findOne({ _id: order.commerce, status: "active" }));
  if (!order || !store) throw new AppError(404, "ORDER_NOT_FOUND", "Pedido não encontrado");

  const review = await Review.findOne({ order: order._id }).lean();
  const final = ["delivered", "cancelled"].includes(order.status);
  const confirmedAt = order.statusHistory.find((entry) => entry.status === "confirmed")?.at;
  let eta = null;
  if (!final && order.scheduledFor) eta = { from: order.scheduledFor, to: order.scheduledFor };
  else if (!final && order.estimatedMinutes?.min != null) {
    const base = (confirmedAt ?? order.createdAt).getTime();
    eta = {
      from: new Date(base + order.estimatedMinutes.min * 60_000),
      to: new Date(base + order.estimatedMinutes.max * 60_000),
    };
  }

  res.json({
    store: {
      name: store.name,
      slug: store.slug,
      whatsapp: store.whatsapp,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor,
    },
    order: {
      number: order.number,
      status: order.status,
      statusHistory: order.statusHistory.map(({ status, at }) => ({ status, at })),
      fulfillment: order.fulfillment,
      // Solo el barrio: la dirección completa no sale en el link.
      neighborhood: order.address?.neighborhood ?? null,
      customerName: order.customer.name.split(" ")[0],
      scheduledFor: order.scheduledFor,
      estimatedMinutes: order.estimatedMinutes,
      eta,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        options: item.options.map(({ name, quantity }) => ({ name, quantity })),
        notes: item.notes,
        totalCents: item.totalCents,
      })),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
    },
    review: review ? publicReview(review) : null,
    canReview: !review && reviewWindow(order).open,
  });
};

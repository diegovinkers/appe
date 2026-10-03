import mongoose from "mongoose";
import Review from "../models/review.model.js";

// Cuántos días después de la entrega se puede opinar sobre un pedido.
export const REVIEW_WINDOW_DAYS = 30;

const firstName = (name) => name.trim().split(/\s+/)[0] ?? "";

// Si un pedido se puede reseñar ahora (sin mirar si ya tiene reseña).
export function reviewWindow(order, now = new Date()) {
  if (order.status !== "delivered") {
    return { open: false, code: "REVIEW_NOT_ALLOWED", message: "Só dá para avaliar depois que o pedido for entregue" };
  }
  const deliveredAt = order.statusHistory.findLast((entry) => entry.status === "delivered")?.at ?? order.updatedAt;
  if (now - deliveredAt > REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return { open: false, code: "REVIEW_WINDOW_CLOSED", message: "O prazo para avaliar este pedido terminou" };
  }
  return { open: true };
}

export const newReview = (order, { rating, comment }) => ({
  commerce: order.commerce,
  order: order._id,
  orderNumber: order.number,
  customerName: firstName(order.customer.name),
  rating,
  comment,
});

// Lo que ve cualquiera en el menú: sin teléfono, pedido ni datos internos.
export const publicReview = ({ rating, comment, customerName, createdAt }) => ({ rating, comment, customerName, createdAt });

// Lo que ve el local en su panel.
export const ownerReview = ({ _id, order, orderNumber, rating, comment, customerName, hidden, createdAt }) => ({
  _id,
  order,
  orderNumber,
  rating,
  comment,
  customerName,
  hidden,
  createdAt,
});

// Nota promedio (con un decimal) y cantidad de reseñas visibles de varios locales a la vez.
export async function ratingSummaries(commerceIds) {
  const ids = commerceIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Review.aggregate([
    { $match: { commerce: { $in: ids }, hidden: false } },
    { $group: { _id: "$commerce", count: { $sum: 1 }, average: { $avg: "$rating" } } },
  ]);
  const byId = new Map(rows.map((row) => [String(row._id), { average: Math.round(row.average * 10) / 10, count: row.count }]));
  return (id) => byId.get(String(id)) ?? { average: null, count: 0 };
}

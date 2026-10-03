import Commerce from "../models/commerce.model.js";
import Order from "../models/order.model.js";
import Review from "../models/review.model.js";
import { audit } from "../lib/audit.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import { newReview, ownerReview, publicReview, ratingSummaries, reviewWindow } from "../services/review.service.js";
import { findActiveStore } from "./public.controller.js";

// POST /api/public/orders/:token/review — el link de seguimiento es la prueba de que
// quien opina hizo el pedido. Una reseña por pedido, después de entregado.
export const createReview = async (req, res) => {
  const order = await Order.findOne({ trackingToken: req.valid.params.token });
  const active = order && (await Commerce.exists({ _id: order.commerce, status: "active" }));
  if (!order || !active) throw new AppError(404, "ORDER_NOT_FOUND", "Pedido não encontrado");

  const state = reviewWindow(order);
  if (!state.open) throw conflict(state.code, state.message);
  try {
    const review = await Review.create(newReview(order, req.valid.body));
    res.status(201).json({ review: publicReview(review) });
  } catch (error) {
    // Ya tenía una (también si llegan dos envíos juntos: el índice único lo frena).
    if (error.code === 11000) throw conflict("REVIEW_EXISTS", "Este pedido já foi avaliado");
    throw error;
  }
};

// GET /api/public/stores/:slug/reviews — las visibles, más nuevas primero.
export const listPublicReviews = async (req, res) => {
  const store = await findActiveStore(req.valid.params.slug);
  const [reviews, summary] = await Promise.all([
    Review.find({ commerce: store._id, hidden: false }).sort({ createdAt: -1 }).limit(50).lean(),
    ratingSummaries([store._id]),
  ]);
  res.json({ rating: summary(store._id), reviews: reviews.map(publicReview) });
};

// GET /api/owner/reviews — todas, también las ocultas.
export const listOwnerReviews = async (req, res) => {
  const [reviews, summary] = await Promise.all([
    Review.find({ commerce: req.commerce._id }).sort({ createdAt: -1 }).limit(200).lean(),
    ratingSummaries([req.commerce._id]),
  ]);
  res.json({ rating: summary(req.commerce._id), reviews: reviews.map(ownerReview) });
};

// PATCH /api/owner/reviews/:id — ocultar una reseña del menú (ofensiva, spam) o volver a mostrarla.
export const updateReview = async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.valid.params.id, commerce: req.commerce._id },
    { hidden: req.valid.body.hidden },
    { returnDocument: "after" }
  );
  if (!review) throw notFound("Avaliação não encontrada");
  await audit(req, {
    action: review.hidden ? "review.hidden" : "review.shown",
    entity: { type: "review", id: review._id },
    changes: { orderNumber: review.orderNumber, rating: review.rating },
  });
  res.json({ review: ownerReview(review) });
};

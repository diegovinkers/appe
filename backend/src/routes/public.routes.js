import { Router } from "express";
import { getPublicStore, getSlots, listPublicStores, validateCoupon } from "../controllers/public.controller.js";
import { createPublicOrder, getOrderTracking } from "../controllers/order.controller.js";
import { createReview, listPublicReviews } from "../controllers/review.controller.js";
import { customerOptional } from "../middlewares/customer.middleware.js";
import { createReviewSchema } from "../schemas/review.schema.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createOrderSchema, trackingParams, validateCouponSchema } from "../schemas/order.schema.js";
import { storeParams, storeQuery } from "../schemas/public.schema.js";

// Rutas sin sesión: las usa el cliente final desde el link del local.
export function createPublicRouter({ orderLimiter, couponLimiter, reviewLimiter }) {
  const router = Router();

  router.get("/stores", validate({ query: storeQuery }), listPublicStores);
  router.get("/stores/:slug", validate({ params: storeParams, query: storeQuery }), getPublicStore);
  router.get("/stores/:slug/slots", validate({ params: storeParams }), getSlots);
  router.get("/stores/:slug/reviews", validate({ params: storeParams }), listPublicReviews);
  router.post(
    "/stores/:slug/coupons/validate",
    couponLimiter,
    validate({ params: storeParams, body: validateCouponSchema }),
    validateCoupon
  );
  router.post(
    "/stores/:slug/orders",
    orderLimiter,
    customerOptional,
    validate({ params: storeParams, body: createOrderSchema }),
    createPublicOrder
  );
  router.get("/orders/:token", validate({ params: trackingParams }), getOrderTracking);
  router.post(
    "/orders/:token/review",
    reviewLimiter,
    validate({ params: trackingParams, body: createReviewSchema }),
    createReview
  );

  return router;
}

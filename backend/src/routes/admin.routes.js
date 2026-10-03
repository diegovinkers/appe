import { Router } from "express";
import {
  createCommerce,
  listAudit,
  listCommerces,
  resetOwnerPassword,
  updateCommerce,
} from "../controllers/admin.controller.js";
import { authRequired, requirePermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  auditQuery,
  createCommerceSchema,
  resetPasswordSchema,
  updateCommerceSchema,
} from "../schemas/admin.schema.js";
import { idParams } from "../schemas/common.schema.js";
import { getAdminSubscription, putSubscription, recordSubscriptionPayment } from "../controllers/business.controller.js";
import { subscriptionInput, subscriptionPaymentInput } from "../schemas/business.schema.js";

const router = Router();

// Todo /api/admin es de la plataforma (superadmin).
router.use(authRequired, requirePermission("platform:manage"));

router.get("/commerces", listCommerces);
router.get("/commerces/:id/subscription", validate({ params: idParams }), getAdminSubscription);
router.put("/commerces/:id/subscription", validate({ params: idParams, body: subscriptionInput }), putSubscription);
router.post("/commerces/:id/subscription/payments", validate({ params: idParams, body: subscriptionPaymentInput }), recordSubscriptionPayment);
router.post("/commerces", validate({ body: createCommerceSchema }), createCommerce);
router.patch("/commerces/:id", validate({ params: idParams, body: updateCommerceSchema }), updateCommerce);
router.patch("/users/:id/password", validate({ params: idParams, body: resetPasswordSchema }), resetOwnerPassword);
router.get("/audit", validate({ query: auditQuery }), listAudit);

export default router;

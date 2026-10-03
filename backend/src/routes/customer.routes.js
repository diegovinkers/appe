import { Router } from "express";
import { deleteMe, linkMyOrders, login, logout, me, myOrders, signup, updateMe } from "../controllers/customer.controller.js";
import { customerRequired } from "../middlewares/customer.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  customerLoginSchema,
  deleteCustomerSchema,
  linkOrdersSchema,
  signupSchema,
  updateCustomerSchema,
} from "../schemas/customer.schema.js";

// Cuenta del cliente que compra. Separada del panel: otra cookie, otra audiencia.
export function createCustomerRouter({ authLimiter }) {
  const router = Router();

  router.post("/signup", authLimiter, validate({ body: signupSchema }), signup);
  router.post("/login", authLimiter, validate({ body: customerLoginSchema }), login);
  router.post("/logout", logout);

  router.get("/me", customerRequired, me);
  router.patch("/me", customerRequired, validate({ body: updateCustomerSchema }), updateMe);
  router.post("/me/delete", customerRequired, authLimiter, validate({ body: deleteCustomerSchema }), deleteMe);
  router.get("/orders", customerRequired, myOrders);
  router.post("/orders/link", customerRequired, validate({ body: linkOrdersSchema }), linkMyOrders);

  return router;
}

import { Router } from "express";
import { changePassword, login, logout, me } from "../controllers/auth.controller.js";
import { authRequired } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { changePasswordSchema, loginSchema } from "../schemas/auth.schema.js";

export function createAuthRouter({ loginLimiter }) {
  const router = Router();

  router.post("/login", loginLimiter, validate({ body: loginSchema }), login);
  router.post("/logout", logout);
  router.get("/me", authRequired, me);
  router.patch("/password", authRequired, validate({ body: changePasswordSchema }), changePassword);

  return router;
}

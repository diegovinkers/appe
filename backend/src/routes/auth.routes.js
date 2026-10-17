import { Router } from "express";
import { changeOwnPin, changePassword, login, logout, me } from "../controllers/auth.controller.js";
import { deviceInfo, pinLogin } from "../controllers/device.controller.js";
import { authRequired } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { changePasswordSchema, changePinSchema, loginSchema } from "../schemas/auth.schema.js";
import { pinLoginSchema } from "../schemas/device.schema.js";

export function createAuthRouter({ loginLimiter, pinLimiter }) {
  const router = Router();

  router.post("/login", loginLimiter, validate({ body: loginSchema }), login);
  router.post("/logout", logout);
  // Aparatos del equipo: quién puede entrar con PIN y entrar (o cambiar de persona).
  router.get("/device", deviceInfo);
  router.post("/pin", pinLimiter, validate({ body: pinLoginSchema }), pinLogin);
  router.get("/me", authRequired, me);
  router.patch("/password", authRequired, validate({ body: changePasswordSchema }), changePassword);
  router.put("/pin", authRequired, pinLimiter, validate({ body: changePinSchema }), changeOwnPin);

  return router;
}

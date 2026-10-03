// Sesión del cliente (el que compra): otra cookie y otra audiencia que la del panel.
// Un token de cliente no sirve en el panel ni al revés. Cuando se sume Auth0, lo que
// cambia es cómo se inicia la sesión; el resto (perfil, pedidos) queda igual.
import jwt from "jsonwebtoken";
import { config, isProduction } from "../config.js";

const COOKIE_NAME = "cliente";
const AUDIENCE = "customer";
const SESSION_DAYS = 30;

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" };

export function startCustomerSession(res, customer) {
  const token = jwt.sign({ sub: String(customer._id), v: customer.tokenVersion ?? 0 }, config.JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
    audience: AUDIENCE,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

export function endCustomerSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

export function readCustomerSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"], audience: AUDIENCE });
  } catch {
    return null;
  }
}

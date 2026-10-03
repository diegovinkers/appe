// Sesión: JWT en una cookie httpOnly. El token lleva solo el id del usuario y su
// tokenVersion; el resto se lee de la base en cada request (ver authRequired).
import jwt from "jsonwebtoken";
import { config, isProduction } from "../config.js";

const COOKIE_NAME = "token";
const SESSION_DAYS = 7;

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" };

export function startSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), v: user.tokenVersion }, config.JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

export function endSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

// Devuelve el payload del token, o null si no hay cookie o no es válida.
export function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

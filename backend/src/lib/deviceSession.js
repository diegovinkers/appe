// Aparato del equipo: un token al azar en una cookie httpOnly de larga duración. En la base
// queda solo su hash (si alguien lee la base, no puede hacerse pasar por el aparato).
import { createHash, randomBytes } from "node:crypto";
import { isProduction } from "../config.js";

const COOKIE_NAME = "aparelho";
const DEVICE_DAYS = 400;
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" };

export const hashDeviceToken = (token) => createHash("sha256").update(token).digest("hex");

// Crea el token del aparato, lo deja en la cookie y devuelve su hash para guardarlo.
export function startDevice(res) {
  const token = randomBytes(32).toString("base64url");
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: DEVICE_DAYS * 24 * 60 * 60 * 1000 });
  return hashDeviceToken(token);
}

export const endDevice = (res) => res.clearCookie(COOKIE_NAME, cookieOptions);

export function readDeviceToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}
